import mongoose from "mongoose";
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import { CINEMA_TIMEZONE, startOfCinemaDay, toCinemaDate, zonedTimeToUtc } from "../configs/cinemaTime.js";
import { ensureScreens, CLEANING_MINUTES } from "../configs/screens.js";
import { SEATS_PER_SHOW, theaterPremiums } from "../configs/theaterTypes.js";

const MINUTE = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_RUNTIME = 120;
const STARTING_SOON_MINUTES = 20;
// Late shows from the previous evening can still be running after midnight
const CARRYOVER_MS = 5 * 60 * MINUTE;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const seatsSoldExpr = { $size: { $objectToArray: { $ifNull: ['$occupiedSeats', {}] } } };

// Shows starting in [from, to), with movie details and end times
const loadShows = async (from, to) => {
    const rows = await Show.aggregate([
        { $match: { showDateTime: { $gte: new Date(from), $lt: new Date(to) } } },
        // Plain joins are faster than trimming inside the join; the $project below keeps only what's used
        { $lookup: { from: 'movies', localField: 'movie', foreignField: '_id', as: 'movieDoc' } },
        { $unwind: '$movieDoc' },
        {
            $project: {
                movie: 1,
                screen: 1,
                theaterType: 1,
                showDateTime: 1,
                showPrice: 1,
                title: '$movieDoc.title',
                poster_path: '$movieDoc.poster_path',
                runtime: { $ifNull: ['$movieDoc.runtime', DEFAULT_RUNTIME] },
                seatsSold: seatsSoldExpr,
            }
        },
        { $sort: { showDateTime: 1 } },
    ]);
    return rows.map(s => {
        const start = s.showDateTime.getTime();
        return {
            id: String(s._id),
            movieId: String(s.movie),
            screen: s.screen || null,
            theaterType: s.theaterType,
            title: s.title,
            poster_path: s.poster_path,
            runtime: s.runtime,
            start,
            end: start + (s.runtime || DEFAULT_RUNTIME) * MINUTE,
            seatsSold: s.seatsSold,
            capacity: SEATS_PER_SHOW,
        };
    });
};

// `next` may be tomorrow's first show; a screen with nothing left today is closed
const statusFor = (shows, now, dayEnd) => {
    const playing = shows.find(s => s.start <= now && now < s.end);
    const next = shows.find(s => s.start > now) || null;
    const last = [...shows].reverse().find(s => s.end <= now);

    if (playing) return { status: 'playing', current: playing, next };
    if (last && now < last.end + CLEANING_MINUTES * MINUTE) return { status: 'cleaning', current: null, next, cleaningUntil: last.end + CLEANING_MINUTES * MINUTE };
    if (next && next.start - now <= STARTING_SOON_MINUTES * MINUTE) return { status: 'starting', current: null, next };
    if (next && next.start < dayEnd) return { status: 'idle', current: null, next };
    return { status: 'closed', current: null, next };
};

// GET /api/admin/live?date=YYYY-MM-DD — what every screen is doing right now,
// plus the timeline for the chosen date (defaults to today)
export const getLiveOperations = async (req, res) => {
    try {
        const now = Date.now();
        const dayStart = startOfCinemaDay(new Date(now)).getTime();
        const dayEnd = dayStart + DAY_MS;
        const today = toCinemaDate(new Date(now));
        const view = DATE_RE.test(req.query.date || '') ? req.query.date : today;
        const viewStart = zonedTimeToUtc(view).getTime();
        const viewEnd = viewStart + DAY_MS;

        // Status needs today through tomorrow (for each screen's next opening);
        // the timeline needs the chosen date, which may be further away
        const statusFrom = dayStart - CARRYOVER_MS;
        const statusTo = dayStart + 2 * DAY_MS;
        const viewInsideStatus = viewStart - CARRYOVER_MS >= statusFrom && viewEnd <= statusTo;

        const [screens, statusShows, extraViewShows, salesToday] = await Promise.all([
            ensureScreens(),
            loadShows(statusFrom, statusTo),
            viewInsideStatus ? [] : loadShows(viewStart - CARRYOVER_MS, viewEnd),
            Booking.aggregate([
                { $match: { isPaid: true, createdAt: { $gte: new Date(dayStart), $lt: new Date(dayEnd) } } },
                { $group: { _id: null, revenue: { $sum: '$amount' }, tickets: { $sum: { $size: '$bookedSeat' } } } },
            ]),
        ]);

        // Drop yesterday's shows that had already finished before today began
        const shows = statusShows.filter(s => s.end > dayStart);
        const inView = s => s.start < viewEnd && s.end > viewStart;
        const viewShows = (viewInsideStatus ? statusShows : extraViewShows).filter(inView);

        const screenBoards = screens.map(screen => {
            const screenShows = shows.filter(s => s.screen === screen._id);
            const { status, current, next, cleaningUntil } = statusFor(screenShows, now, dayEnd);
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
                showsToday: screenShows.filter(s => s.start >= dayStart && s.start < dayEnd).length,
                timeline: viewShows.filter(s => s.screen === screen._id),
            };
        });

        const todays = shows.filter(s => s.start >= dayStart && s.start < dayEnd);
        const playing = shows.filter(s => s.start <= now && now < s.end);
        const sales = salesToday[0] || { revenue: 0, tickets: 0 };

        res.json({
            success: true,
            now,
            today,
            dayStart,
            dayEnd,
            view,
            viewStart,
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
            // Shows from before screens existed have no screen; list them separately
            unassigned: viewShows.filter(s => !s.screen),
        });
    } catch (error) {
        console.error('[Live]', error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/admin/schedule-calendar — per-day totals from a week ago through
// the last scheduled day, for the calendar strip
export const getScheduleCalendar = async (req, res) => {
    try {
        const now = new Date();
        const from = startOfCinemaDay(now, 7);
        const rows = await Show.aggregate([
            { $match: { showDateTime: { $gte: from } } },
            {
                $group: {
                    _id: { $dateToString: { date: '$showDateTime', format: '%Y-%m-%d', timezone: CINEMA_TIMEZONE } },
                    shows: { $sum: 1 },
                    seatsSold: { $sum: seatsSoldExpr },
                    movies: { $addToSet: '$movie' },
                }
            },
        ]);
        const byDate = Object.fromEntries(rows.map(r => [r._id, r]));

        // Every date from a week ago to the later of two weeks ahead or the last scheduled day
        const lastScheduled = rows.map(r => r._id).sort().pop();
        const days = [];
        for (let i = 0; i < 60; i++) {
            const date = toCinemaDate(new Date(from.getTime() + i * DAY_MS + 12 * 3_600_000));
            if (i >= 21 && (!lastScheduled || date > lastScheduled)) break;
            const row = byDate[date];
            days.push({
                date,
                shows: row?.shows || 0,
                movies: row?.movies.length || 0,
                seatsSold: row?.seatsSold || 0,
                occupancy: row ? row.seatsSold / (row.shows * SEATS_PER_SHOW) : 0,
            });
        }
        res.json({ success: true, today: toCinemaDate(now), days });
    } catch (error) {
        console.error('[Calendar]', error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/admin/shows/:id — one show with its screen, sales and every booking
export const getShowDetails = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.json({ success: false, message: 'Show not found' });
        }
        const show = await Show.findById(req.params.id)
            .populate('movie', 'title poster_path runtime genres vote_average release_date')
            .populate('screen', 'name theaterType capacity')
            .lean();
        if (!show) return res.json({ success: false, message: 'Show not found' });

        const bookings = await Booking.find({ show: String(show._id) })
            .sort({ createdAt: -1 })
            .populate('user', 'name image')
            .lean();

        const paid = bookings.filter(b => b.isPaid);
        const start = show.showDateTime.getTime();
        const runtime = show.movie?.runtime || DEFAULT_RUNTIME;
        res.json({
            success: true,
            show: {
                id: String(show._id),
                movie: show.movie,
                screen: show.screen,
                theaterType: show.theaterType,
                start,
                end: start + runtime * MINUTE,
                ticketPrice: show.showPrice + (theaterPremiums[show.theaterType] || 0),
                capacity: show.screen?.capacity || SEATS_PER_SHOW,
                seatsSold: Object.keys(show.occupiedSeats || {}).length,
                occupiedSeats: Object.keys(show.occupiedSeats || {}),
            },
            totals: {
                revenue: paid.reduce((sum, b) => sum + b.amount, 0),
                tickets: paid.reduce((sum, b) => sum + b.bookedSeat.length, 0),
                bookings: paid.length,
                abandoned: bookings.length - paid.length,
            },
            bookings: bookings.map(b => ({
                id: String(b._id),
                customer: b.user?.name || 'Guest',
                customerImage: b.user?.image || null,
                seats: b.bookedSeat,
                amount: b.amount,
                isPaid: b.isPaid,
                isSimulated: Boolean(b.isSimulated),
                createdAt: b.createdAt,
            })),
        });
    } catch (error) {
        console.error('[ShowDetails]', error);
        res.json({ success: false, message: error.message });
    }
};
