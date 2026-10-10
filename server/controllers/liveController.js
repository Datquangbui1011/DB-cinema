import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import { startOfCinemaDay } from "../configs/cinemaTime.js";
import { ensureScreens, CLEANING_MINUTES } from "../configs/screens.js";
import { SEATS_PER_SHOW } from "../configs/theaterTypes.js";

const MINUTE = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_RUNTIME = 120;
const STARTING_SOON_MINUTES = 20;
// Late shows from the previous evening can still be running after midnight
const CARRYOVER_MS = 5 * 60 * MINUTE;

const statusFor = (shows, now) => {
    const playing = shows.find(s => s.start <= now && now < s.end);
    const next = shows.find(s => s.start > now) || null;
    const last = [...shows].reverse().find(s => s.end <= now);

    if (playing) return { status: 'playing', current: playing, next };
    if (last && now < last.end + CLEANING_MINUTES * MINUTE) return { status: 'cleaning', current: null, next, cleaningUntil: last.end + CLEANING_MINUTES * MINUTE };
    if (next && next.start - now <= STARTING_SOON_MINUTES * MINUTE) return { status: 'starting', current: null, next };
    if (next) return { status: 'idle', current: null, next };
    return { status: 'closed', current: null, next: null };
};

// GET /api/admin/live — what every screen is doing right now, plus today's timeline
export const getLiveOperations = async (req, res) => {
    try {
        const now = Date.now();
        const dayStart = startOfCinemaDay(new Date(now));
        const dayEnd = new Date(dayStart.getTime() + DAY_MS);

        const [screens, rawShows, salesToday] = await Promise.all([
            ensureScreens(),
            Show.aggregate([
                { $match: { showDateTime: { $gte: new Date(dayStart.getTime() - CARRYOVER_MS), $lt: dayEnd } } },
                { $lookup: { from: 'movies', localField: 'movie', foreignField: '_id', as: 'movieDoc' } },
                { $unwind: '$movieDoc' },
                {
                    $project: {
                        screen: 1,
                        theaterType: 1,
                        showDateTime: 1,
                        title: '$movieDoc.title',
                        poster_path: '$movieDoc.poster_path',
                        runtime: { $ifNull: ['$movieDoc.runtime', DEFAULT_RUNTIME] },
                        seatsSold: { $size: { $objectToArray: { $ifNull: ['$occupiedSeats', {}] } } },
                    }
                },
                { $sort: { showDateTime: 1 } },
            ]),
            Booking.aggregate([
                { $match: { isPaid: true, createdAt: { $gte: dayStart, $lt: dayEnd } } },
                { $group: { _id: null, revenue: { $sum: '$amount' }, tickets: { $sum: { $size: '$bookedSeat' } } } },
            ]),
        ]);

        const shows = rawShows
            .map(s => {
                const start = s.showDateTime.getTime();
                const end = start + (s.runtime || DEFAULT_RUNTIME) * MINUTE;
                return {
                    id: String(s._id),
                    screen: s.screen || null,
                    theaterType: s.theaterType,
                    title: s.title,
                    poster_path: s.poster_path,
                    runtime: s.runtime,
                    start,
                    end,
                    seatsSold: s.seatsSold,
                    capacity: SEATS_PER_SHOW,
                };
            })
            // Drop yesterday's shows that had already finished before today began
            .filter(s => s.start >= dayStart.getTime() || s.end > dayStart.getTime());

        const screenBoards = screens.map(screen => {
            const screenShows = shows.filter(s => s.screen === screen._id);
            const { status, current, next, cleaningUntil } = statusFor(screenShows, now);
            return {
                id: screen._id,
                name: screen.name,
                number: screen.number,
                theaterType: screen.theaterType,
                capacity: screen.capacity,
                status,
                current,
                next,
                cleaningUntil: cleaningUntil || null,
                showsToday: screenShows.filter(s => s.start >= dayStart.getTime()).length,
                timeline: screenShows,
            };
        });

        // Shows from before screens existed have no screen; list them separately
        const unassigned = shows.filter(s => !s.screen);
        const todays = shows.filter(s => s.start >= dayStart.getTime());
        const playing = shows.filter(s => s.start <= now && now < s.end);
        const sales = salesToday[0] || { revenue: 0, tickets: 0 };

        res.json({
            success: true,
            now,
            dayStart: dayStart.getTime(),
            dayEnd: dayEnd.getTime(),
            summary: {
                playingNow: playing.length,
                guestsInSeats: playing.reduce((sum, s) => sum + s.seatsSold, 0),
                startingNextHour: shows.filter(s => s.start > now && s.start - now <= 60 * MINUTE).length,
                showsLeftToday: todays.filter(s => s.start > now).length,
                showsToday: todays.length,
                ticketsSoldToday: sales.tickets,
                revenueToday: sales.revenue,
                occupancyToday: todays.length ? todays.reduce((sum, s) => sum + s.seatsSold, 0) / (todays.length * SEATS_PER_SHOW) : 0,
            },
            screens: screenBoards,
            unassigned,
        });
    } catch (error) {
        console.error('[Live]', error);
        res.json({ success: false, message: error.message });
    }
};
