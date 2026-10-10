import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import Movie from "../models/Movie.js";
import User from "../models/User.js";
import { CINEMA_TIMEZONE, toCinemaDate, zonedTimeToUtc } from "../configs/cinemaTime.js";
import { THEATER_TYPES, SEATS_PER_SHOW } from "../configs/theaterTypes.js";
import { ensureScreens, hoursFor } from "../configs/screens.js";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const DEFAULT_RUNTIME = 120;
const UNDERPERFORMING_OCCUPANCY = 0.25;
const UNDERPERFORMING_MIN_SHOWS = 5;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const change = (current, previous) => (previous ? (current - previous) / previous : null);

// Date range from the query (cinema-local, inclusive), defaulting to the last 30 days
const parseRange = (query) => {
    const today = toCinemaDate(new Date());
    let to = DATE_RE.test(query.to || '') ? query.to : today;
    let from = DATE_RE.test(query.from || '') ? query.from : toCinemaDate(new Date(Date.now() - 29 * DAY_MS));
    if (from > to) [from, to] = [to, from];

    const start = zonedTimeToUtc(from);
    let end = new Date(zonedTimeToUtc(to).getTime() + DAY_MS);
    const days = Math.min(MAX_DAYS, Math.round((end - start) / DAY_MS));
    end = new Date(start.getTime() + days * DAY_MS);
    const prevStart = new Date(start.getTime() - days * DAY_MS);
    return { from, to, days, start, end, prevStart, prevEnd: start };
};

// Group paid bookings by show, then join each show once (instead of once per booking)
const paidSalesByShow = (match) => Booking.aggregate([
    { $match: { ...match, isPaid: true } },
    { $group: { _id: '$show', revenue: { $sum: '$amount' }, tickets: { $sum: { $size: '$bookedSeat' } }, bookings: { $sum: 1 } } },
    { $addFields: { showObjectId: { $convert: { input: '$_id', to: 'objectId', onError: null, onNull: null } } } },
    { $lookup: { from: 'shows', localField: 'showObjectId', foreignField: '_id', as: 'showDoc' } },
    { $unwind: '$showDoc' },
    {
        $project: {
            _id: 0, revenue: 1, tickets: 1, bookings: 1,
            theaterType: '$showDoc.theaterType', movie: '$showDoc.movie', showPrice: '$showDoc.showPrice',
        }
    },
]);

const salesTotals = async (match) => {
    const [row] = await Booking.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                started: { $sum: 1 },
                paid: { $sum: { $cond: ['$isPaid', 1, 0] } },
                revenue: { $sum: { $cond: ['$isPaid', '$amount', 0] } },
                tickets: { $sum: { $cond: ['$isPaid', { $size: '$bookedSeat' }, 0] } },
                customers: { $addToSet: { $cond: ['$isPaid', '$user', '$$REMOVE'] } },
            }
        },
        { $project: { _id: 0, started: 1, paid: 1, revenue: 1, tickets: 1, customers: { $size: '$customers' } } },
    ]);
    return row || { started: 0, paid: 0, revenue: 0, tickets: 0, customers: 0 };
};

const dailyRevenue = (match) => Booking.aggregate([
    { $match: { ...match, isPaid: true } },
    {
        $group: {
            _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: CINEMA_TIMEZONE } },
            revenue: { $sum: '$amount' },
            tickets: { $sum: { $size: '$bookedSeat' } },
        }
    },
]).then(rows => Object.fromEntries(rows.map(r => [r._id, r])));

// When bookings are made (hour of day), group sizes and how far ahead of the show
const bookingBehaviour = (match) => Booking.aggregate([
    { $match: match },
    {
        $facet: {
            byHour: [
                { $group: { _id: { $hour: { date: '$createdAt', timezone: CINEMA_TIMEZONE } }, started: { $sum: 1 }, paid: { $sum: { $cond: ['$isPaid', 1, 0] } } } },
            ],
            groupSizes: [
                { $match: { isPaid: true } },
                { $group: { _id: { $min: [{ $size: '$bookedSeat' }, 6] }, count: { $sum: 1 } } },
            ],
            leadTime: [
                { $match: { isPaid: true } },
                { $group: { _id: '$show', created: { $push: '$createdAt' } } },
                { $addFields: { showObjectId: { $convert: { input: '$_id', to: 'objectId', onError: null, onNull: null } } } },
                { $lookup: { from: 'shows', localField: 'showObjectId', foreignField: '_id', as: 'showDoc' } },
                { $unwind: '$showDoc' },
                { $unwind: '$created' },
                { $project: { hours: { $divide: [{ $subtract: ['$showDoc.showDateTime', '$created'] }, HOUR_MS] } } },
                {
                    $bucket: {
                        groupBy: '$hours',
                        boundaries: [-1e9, 2, 24, 72, 168, 1e9],
                        default: 'other',
                        output: { count: { $sum: 1 } },
                    }
                },
            ],
        }
    },
]);

// Lower bound of each lead-time bucket (hours before the show), in display order
const LEAD_BUCKETS = [[-1e9, '< 2 hrs'], [2, '2–24 hrs'], [24, '1–3 days'], [72, '3–7 days'], [168, '1 week+']];

// GET /api/admin/analytics?from=&to=&room=&movie=
export const getAnalytics = async (req, res) => {
    try {
        const range = parseRange(req.query);
        const now = new Date();
        const room = THEATER_TYPES.includes(req.query.room) ? req.query.room : null;
        const movie = req.query.movie ? String(req.query.movie) : null;

        // Room and movie filters apply to shows directly, and to bookings via their shows
        const showFilter = {};
        if (room) showFilter.theaterType = room;
        if (movie) showFilter.movie = movie;
        const bookingShowFilter = Object.keys(showFilter).length
            ? { show: { $in: (await Show.distinct('_id', showFilter)).map(String) } }
            : {};

        const inRange = { ...bookingShowFilter, createdAt: { $gte: range.start, $lt: range.end } };
        const inPrev = { ...bookingShowFilter, createdAt: { $gte: range.prevStart, $lt: range.prevEnd } };
        // Occupancy only counts shows that have already started
        const showsEnd = new Date(Math.min(range.end.getTime(), now.getTime()));

        const [totals, prevTotals, daily, prevDaily, showSales, behaviour, shows, prevShows, screens, customerSpend] = await Promise.all([
            salesTotals(inRange),
            salesTotals(inPrev),
            dailyRevenue(inRange),
            dailyRevenue(inPrev),
            paidSalesByShow(inRange),
            bookingBehaviour(inRange),
            Show.aggregate([
                { $match: { ...showFilter, showDateTime: { $gte: range.start, $lt: showsEnd } } },
                {
                    $project: {
                        movie: 1, screen: 1, theaterType: 1,
                        seatsSold: { $size: { $objectToArray: { $ifNull: ['$occupiedSeats', {}] } } },
                        dow: { $subtract: [{ $dayOfWeek: { date: '$showDateTime', timezone: CINEMA_TIMEZONE } }, 1] },
                        hour: { $hour: { date: '$showDateTime', timezone: CINEMA_TIMEZONE } },
                    }
                },
            ]),
            Show.aggregate([
                { $match: { ...showFilter, showDateTime: { $gte: range.prevStart, $lt: new Date(Math.min(range.prevEnd.getTime(), now.getTime())) } } },
                { $group: { _id: null, shows: { $sum: 1 }, seatsSold: { $sum: { $size: { $objectToArray: { $ifNull: ['$occupiedSeats', {}] } } } } } },
            ]),
            ensureScreens(),
            Booking.aggregate([
                { $match: { ...inRange, isPaid: true } },
                { $group: { _id: '$user', spent: { $sum: '$amount' }, bookings: { $sum: 1 } } },
            ]),
        ]);

        const movieIds = [...new Set([...shows.map(s => s.movie), ...showSales.map(s => s.movie)])];
        const movies = await Movie.find({ _id: { $in: movieIds } }).select('title poster_path runtime genres').lean();
        const movieById = Object.fromEntries(movies.map(m => [String(m._id), m]));

        // ---- KPIs
        const seatsSold = shows.reduce((sum, s) => sum + s.seatsSold, 0);
        const occupancy = shows.length ? seatsSold / (shows.length * SEATS_PER_SHOW) : 0;
        const prevShowRow = prevShows[0];
        const prevOccupancy = prevShowRow?.shows ? prevShowRow.seatsSold / (prevShowRow.shows * SEATS_PER_SHOW) : 0;
        const avgTicket = totals.tickets ? totals.revenue / totals.tickets : 0;
        const prevAvgTicket = prevTotals.tickets ? prevTotals.revenue / prevTotals.tickets : 0;
        const conversion = totals.started ? totals.paid / totals.started : 0;
        const prevConversion = prevTotals.started ? prevTotals.paid / prevTotals.started : 0;

        // ---- Revenue
        const dailySeries = Array.from({ length: range.days }, (_, i) => {
            const date = toCinemaDate(new Date(range.start.getTime() + i * DAY_MS + 12 * HOUR_MS));
            const prevDate = toCinemaDate(new Date(range.prevStart.getTime() + i * DAY_MS + 12 * HOUR_MS));
            return {
                date,
                revenue: daily[date]?.revenue || 0,
                tickets: daily[date]?.tickets || 0,
                previous: prevDaily[prevDate]?.revenue || 0,
            };
        });

        const showsByRoom = {};
        shows.forEach(s => {
            const r = showsByRoom[s.theaterType] || (showsByRoom[s.theaterType] = { shows: 0, seatsSold: 0 });
            r.shows += 1;
            r.seatsSold += s.seatsSold;
        });
        const salesByRoom = {};
        showSales.forEach(s => {
            const r = salesByRoom[s.theaterType] || (salesByRoom[s.theaterType] = { revenue: 0, tickets: 0, base: 0 });
            r.revenue += s.revenue;
            r.tickets += s.tickets;
            r.base += s.tickets * (s.showPrice || 0);
        });
        const byRoom = THEATER_TYPES.map(type => {
            const sales = salesByRoom[type] || { revenue: 0, tickets: 0, base: 0 };
            const showStats = showsByRoom[type] || { shows: 0, seatsSold: 0 };
            return {
                type,
                revenue: sales.revenue,
                tickets: sales.tickets,
                base: sales.base,
                upgrade: sales.revenue - sales.base,
                avgTicket: sales.tickets ? sales.revenue / sales.tickets : 0,
                shows: showStats.shows,
                occupancy: showStats.shows ? showStats.seatsSold / (showStats.shows * SEATS_PER_SHOW) : 0,
            };
        });
        const baseRevenue = byRoom.reduce((sum, r) => sum + r.base, 0);

        // ---- Occupancy heatmap (day of week x start hour) and screens
        const cells = {};
        shows.forEach(s => {
            const key = `${s.dow}-${s.hour}`;
            const cell = cells[key] || (cells[key] = { dow: s.dow, hour: s.hour, shows: 0, seatsSold: 0 });
            cell.shows += 1;
            cell.seatsSold += s.seatsSold;
        });
        const heatmap = Object.values(cells).map(c => ({ ...c, occupancy: c.seatsSold / (c.shows * SEATS_PER_SHOW) }));

        const elapsedDays = Math.max(1, Math.round((showsEnd - range.start) / DAY_MS));
        const byScreen = screens.map(screen => {
            const screenShows = shows.filter(s => s.screen === screen._id);
            const minutesPlaying = screenShows.reduce((sum, s) => sum + (movieById[s.movie]?.runtime || DEFAULT_RUNTIME), 0);
            const { open, lastStart } = hoursFor(screen.theaterType);
            // Opening window runs until the last show could end (last start + typical runtime)
            const minutesOpen = elapsedDays * (lastStart + DEFAULT_RUNTIME - open);
            const sold = screenShows.reduce((sum, s) => sum + s.seatsSold, 0);
            return {
                id: screen._id,
                name: screen.name,
                theaterType: screen.theaterType,
                shows: screenShows.length,
                occupancy: screenShows.length ? sold / (screenShows.length * SEATS_PER_SHOW) : 0,
                utilization: Math.min(1, minutesPlaying / minutesOpen),
            };
        });

        // ---- Movies
        const movieStats = {};
        shows.forEach(s => {
            const m = movieStats[s.movie] || (movieStats[s.movie] = { shows: 0, seatsSold: 0, revenue: 0, tickets: 0 });
            m.shows += 1;
            m.seatsSold += s.seatsSold;
        });
        showSales.forEach(s => {
            const m = movieStats[s.movie] || (movieStats[s.movie] = { shows: 0, seatsSold: 0, revenue: 0, tickets: 0 });
            m.revenue += s.revenue;
            m.tickets += s.tickets;
        });
        const movieRows = Object.entries(movieStats)
            .filter(([id]) => movieById[id])
            .map(([id, m]) => ({
                movieId: id,
                title: movieById[id].title,
                poster_path: movieById[id].poster_path,
                shows: m.shows,
                tickets: m.tickets,
                revenue: m.revenue,
                revenuePerShow: m.shows ? m.revenue / m.shows : 0,
                occupancy: m.shows ? m.seatsSold / (m.shows * SEATS_PER_SHOW) : 0,
            }))
            .sort((a, b) => b.revenue - a.revenue);
        const underperformers = movieRows
            .filter(m => m.shows >= UNDERPERFORMING_MIN_SHOWS && m.occupancy < UNDERPERFORMING_OCCUPANCY)
            .sort((a, b) => a.occupancy - b.occupancy);

        const genres = {};
        showSales.forEach(s => {
            (movieById[s.movie]?.genres || []).forEach(g => {
                const entry = genres[g.name] || (genres[g.name] = { genre: g.name, revenue: 0, tickets: 0 });
                entry.revenue += s.revenue;
                entry.tickets += s.tickets;
            });
        });

        // ---- Sales & checkout
        const [{ byHour, groupSizes, leadTime }] = behaviour;
        const hourly = Array.from({ length: 24 }, (_, hour) => {
            const row = byHour.find(h => h._id === hour);
            return { hour, started: row?.started || 0, paid: row?.paid || 0 };
        });

        // ---- Customers: returning = paid before this range began (answered from
        // the {user, createdAt} index), new = first paid booking falls in the range
        const returningIds = customerSpend.length
            ? await Booking.distinct('user', { user: { $in: customerSpend.map(c => c._id) }, createdAt: { $lt: range.start }, isPaid: true })
            : [];
        const newCustomers = customerSpend.length - returningIds.length;
        const topSpenders = [...customerSpend].sort((a, b) => b.spent - a.spent).slice(0, 10);
        const topUsers = await User.find({ _id: { $in: topSpenders.map(c => c._id) } }).select('name image isSimulated').lean();
        const userById = Object.fromEntries(topUsers.map(u => [u._id, u]));
        const frequencyBuckets = [['1 booking', 1, 1], ['2–3', 2, 3], ['4–9', 4, 9], ['10+', 10, Infinity]];

        res.json({
            success: true,
            range: { from: range.from, to: range.to, days: range.days, prevFrom: toCinemaDate(range.prevStart), prevTo: toCinemaDate(new Date(range.prevEnd.getTime() - DAY_MS)) },
            filters: { room, movie },
            kpis: {
                revenue: { value: totals.revenue, change: change(totals.revenue, prevTotals.revenue) },
                tickets: { value: totals.tickets, change: change(totals.tickets, prevTotals.tickets) },
                avgTicket: { value: avgTicket, change: change(avgTicket, prevAvgTicket) },
                occupancy: { value: occupancy, change: change(occupancy, prevOccupancy) },
                conversion: { value: conversion, change: change(conversion, prevConversion) },
                customers: { value: totals.customers, change: change(totals.customers, prevTotals.customers) },
            },
            revenue: {
                daily: dailySeries,
                byRoom,
                split: { base: baseRevenue, upgrade: totals.revenue - baseRevenue },
            },
            occupancy: {
                heatmap,
                totalShows: shows.length,
                soldOut: shows.filter(s => s.seatsSold >= SEATS_PER_SHOW).length,
                empty: shows.filter(s => s.seatsSold === 0).length,
                byScreen,
            },
            movies: {
                rows: movieRows,
                underperformers,
                genres: Object.values(genres).sort((a, b) => b.revenue - a.revenue),
                thresholds: { occupancy: UNDERPERFORMING_OCCUPANCY, minShows: UNDERPERFORMING_MIN_SHOWS },
            },
            sales: {
                started: totals.started,
                paid: totals.paid,
                abandoned: totals.started - totals.paid,
                conversion,
                hourly,
                groupSizes: [1, 2, 3, 4, 5, 6].map(size => ({ size: size === 6 ? '6+' : String(size), count: groupSizes.find(g => g._id === size)?.count || 0 })),
                leadTime: LEAD_BUCKETS.map(([bound, label]) => ({ label, count: leadTime.find(l => l._id === bound)?.count || 0 })),
            },
            customers: {
                active: customerSpend.length,
                new: newCustomers,
                returning: customerSpend.length - newCustomers,
                avgSpend: customerSpend.length ? totals.revenue / customerSpend.length : 0,
                top: topSpenders.map(c => ({
                    id: c._id,
                    name: userById[c._id]?.name || 'Guest',
                    image: userById[c._id]?.image || null,
                    isSimulated: Boolean(userById[c._id]?.isSimulated),
                    spent: c.spent,
                    bookings: c.bookings,
                })),
                frequency: frequencyBuckets.map(([label, min, max]) => ({ label, count: customerSpend.filter(c => c.bookings >= min && c.bookings <= max).length })),
            },
            dayNames: DOW,
        });
    } catch (error) {
        console.error('[Analytics]', error);
        res.json({ success: false, message: error.message });
    }
};
