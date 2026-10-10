import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import Movie from "../models/Movie.js";
import { CINEMA_TIMEZONE, toCinemaDate, startOfCinemaDay } from "../configs/cinemaTime.js";
import { THEATER_TYPES, SEATS_PER_SHOW } from "../configs/theaterTypes.js";

const DAY_MS = 86_400_000;
const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
const DEFAULT_RUNTIME_MIN = 120;

const seatsSoldExpr = { $size: { $objectToArray: { $ifNull: ['$occupiedSeats', {}] } } };

const paidIn = (from, to) => ({ $match: { isPaid: true, createdAt: { $gte: from, $lt: to } } });

const salesStats = async (from, to) => {
    const [row] = await Booking.aggregate([
        paidIn(from, to),
        {
            $group: {
                _id: null,
                revenue: { $sum: '$amount' },
                tickets: { $sum: { $size: '$bookedSeat' } },
                bookings: { $sum: 1 },
                customers: { $addToSet: '$user' },
            }
        },
        { $project: { _id: 0, revenue: 1, tickets: 1, bookings: 1, customers: { $size: '$customers' } } },
    ]);
    return row || { revenue: 0, tickets: 0, bookings: 0, customers: 0 };
};

// Occupancy of shows that have already started inside the window
const occupancyStats = async (from, to) => {
    const [row] = await Show.aggregate([
        { $match: { showDateTime: { $gte: from, $lt: to } } },
        { $group: { _id: null, shows: { $sum: 1 }, seatsSold: { $sum: seatsSoldExpr } } },
    ]);
    if (!row || row.shows === 0) return { shows: 0, seatsSold: 0, occupancy: 0 };
    return { shows: row.shows, seatsSold: row.seatsSold, occupancy: row.seatsSold / (row.shows * SEATS_PER_SHOW) };
};

const bucketedSales = (from, to, format) => Booking.aggregate([
    paidIn(from, to),
    {
        $group: {
            _id: { $dateToString: { date: '$createdAt', format, timezone: CINEMA_TIMEZONE } },
            revenue: { $sum: '$amount' },
            tickets: { $sum: { $size: '$bookedSeat' } },
        }
    },
]).then(rows => Object.fromEntries(rows.map(r => [r._id, r])));

const buildTrend = async (range, days, start, prevStart, now) => {
    if (range === 'today') {
        const [current, previous] = await Promise.all([
            bucketedSales(start, now, '%H'),
            bucketedSales(prevStart, start, '%H'),
        ]);
        const currentHour = Number(new Date().toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', hour12: false })) % 24;
        return Array.from({ length: currentHour + 1 }, (_, h) => {
            const key = String(h).padStart(2, '0');
            const label = new Date(2000, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' });
            return { label, revenue: current[key]?.revenue || 0, tickets: current[key]?.tickets || 0, previousRevenue: previous[key]?.revenue || 0 };
        });
    }

    const [current, previous] = await Promise.all([
        bucketedSales(start, now, '%Y-%m-%d'),
        bucketedSales(prevStart, start, '%Y-%m-%d'),
    ]);
    return Array.from({ length: days }, (_, i) => {
        const key = toCinemaDate(new Date(now.getTime() - (days - 1 - i) * DAY_MS));
        const prevKey = toCinemaDate(new Date(now.getTime() - (2 * days - 1 - i) * DAY_MS));
        const label = new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return { label, revenue: current[key]?.revenue || 0, tickets: current[key]?.tickets || 0, previousRevenue: previous[prevKey]?.revenue || 0 };
    });
};

// Paid sales per show, joined to each show's room and movie. Grouping by show
// before joining means one lookup per show instead of one per booking.
const salesByShow = (from, to) => Booking.aggregate([
    paidIn(from, to),
    { $group: { _id: '$show', revenue: { $sum: '$amount' }, tickets: { $sum: { $size: '$bookedSeat' } } } },
    { $addFields: { showObjectId: { $convert: { input: '$_id', to: 'objectId', onError: null, onNull: null } } } },
    {
        $lookup: {
            from: 'shows', localField: 'showObjectId', foreignField: '_id', as: 'showDoc',
            pipeline: [{ $project: { theaterType: 1, movie: 1 } }],
        }
    },
    { $unwind: '$showDoc' },
    { $project: { _id: 0, revenue: 1, tickets: 1, theaterType: '$showDoc.theaterType', movie: '$showDoc.movie' } },
]);

const sumBy = (rows, key) => rows.reduce((acc, r) => {
    const entry = acc[r[key]] || (acc[r[key]] = { revenue: 0, tickets: 0 });
    entry.revenue += r.revenue;
    entry.tickets += r.tickets;
    return acc;
}, {});

const revenueByRoom = (showSales) => {
    const byType = sumBy(showSales, 'theaterType');
    return THEATER_TYPES.map(type => ({ type, revenue: byType[type]?.revenue || 0, tickets: byType[type]?.tickets || 0 }));
};

const topMovies = async (showSales) => {
    const top = Object.entries(sumBy(showSales, 'movie'))
        .map(([movieId, totals]) => ({ movieId, ...totals }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    const movies = await Movie.find({ _id: { $in: top.map(m => m.movieId) } }).select('title poster_path').lean();
    const byId = Object.fromEntries(movies.map(m => [String(m._id), m]));
    return top.filter(m => byId[m.movieId]).map(m => ({ ...m, title: byId[m.movieId].title, poster_path: byId[m.movieId].poster_path }));
};

const recentBookings = async () => {
    const bookings = await Booking.find({ isPaid: true })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate({ path: 'show', select: 'showDateTime theaterType movie', populate: { path: 'movie', select: 'title poster_path' } })
        .populate({ path: 'user', select: 'name image' })
        .lean();
    return bookings.map(b => ({
        id: b._id,
        customer: b.user?.name || 'Guest',
        customerImage: b.user?.image || null,
        movie: b.show?.movie?.title || 'Removed movie',
        room: b.show?.theaterType || null,
        showDateTime: b.show?.showDateTime || null,
        seats: b.bookedSeat?.length || 0,
        amount: b.amount,
        createdAt: b.createdAt,
    }));
};

// Today's schedule: what's playing now and what starts next
const todaySchedule = async (now) => {
    const dayStart = startOfCinemaDay(now);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const shows = await Show.aggregate([
        { $match: { showDateTime: { $gte: dayStart, $lt: dayEnd } } },
        // Plain joins are faster than trimming inside the join; the $project below keeps only what's used
        { $lookup: { from: 'movies', localField: 'movie', foreignField: '_id', as: 'movieDoc' } },
        { $unwind: '$movieDoc' },
        {
            $project: {
                showDateTime: 1,
                theaterType: 1,
                title: '$movieDoc.title',
                poster_path: '$movieDoc.poster_path',
                runtime: { $ifNull: ['$movieDoc.runtime', DEFAULT_RUNTIME_MIN] },
                seatsSold: seatsSoldExpr,
            }
        },
        { $sort: { showDateTime: 1 } },
    ]);

    const endOf = s => new Date(s.showDateTime.getTime() + (s.runtime || DEFAULT_RUNTIME_MIN) * 60_000);
    const nowPlaying = shows.filter(s => s.showDateTime <= now && endOf(s) > now);
    const upcoming = shows.filter(s => s.showDateTime > now);
    return {
        totalShows: shows.length,
        completed: shows.filter(s => endOf(s) <= now).length,
        nowPlayingCount: nowPlaying.length,
        upcomingCount: upcoming.length,
        nextShows: upcoming.slice(0, 6).map(s => ({ ...s, capacity: SEATS_PER_SHOW })),
    };
};

const change = (current, previous) => (previous ? (current - previous) / previous : null);

// GET /api/admin/overview?range=today|7d|30d|90d
export const getOverview = async (req, res) => {
    try {
        const range = RANGE_DAYS[req.query.range] ? req.query.range : '7d';
        const days = RANGE_DAYS[range];
        const now = new Date();
        const start = startOfCinemaDay(now, days - 1);
        const elapsed = now - start;
        const prevStart = new Date(start.getTime() - days * DAY_MS);
        const prevEnd = new Date(prevStart.getTime() + elapsed);

        const [sales, prevSales, occupancy, prevOccupancy, trend, showSales, recent, today] = await Promise.all([
            salesStats(start, now),
            salesStats(prevStart, prevEnd),
            occupancyStats(start, now),
            occupancyStats(prevStart, prevEnd),
            buildTrend(range, days, start, prevStart, now),
            salesByShow(start, now),
            recentBookings(),
            todaySchedule(now),
        ]);
        const rooms = revenueByRoom(showSales);
        const movies = await topMovies(showSales);

        const avgTicket = sales.tickets ? sales.revenue / sales.tickets : 0;
        const prevAvgTicket = prevSales.tickets ? prevSales.revenue / prevSales.tickets : 0;

        res.json({
            success: true,
            range,
            generatedAt: now,
            kpis: {
                revenue: { value: sales.revenue, change: change(sales.revenue, prevSales.revenue) },
                tickets: { value: sales.tickets, change: change(sales.tickets, prevSales.tickets) },
                occupancy: { value: occupancy.occupancy, change: change(occupancy.occupancy, prevOccupancy.occupancy) },
                avgTicket: { value: avgTicket, change: change(avgTicket, prevAvgTicket) },
                customers: { value: sales.customers, change: change(sales.customers, prevSales.customers) },
            },
            trend,
            revenueByRoom: rooms,
            topMovies: movies,
            recentBookings: recent,
            today,
        });
    } catch (error) {
        console.error('[Overview]', error);
        res.json({ success: false, message: error.message });
    }
};
