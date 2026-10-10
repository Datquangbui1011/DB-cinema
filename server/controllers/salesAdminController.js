import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Show from "../models/Show.js";
import Movie from "../models/Movie.js";
import { zonedTimeToUtc } from "../configs/cinemaTime.js";
import { THEATER_TYPES } from "../configs/theaterTypes.js";

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_LIMIT = 50_000;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(query.limit) || 25));
    return { page, limit };
};

// Booking -> show -> movie/screen, and booking -> customer. Plain joins run on
// MongoDB's faster join engine; each joined doc is trimmed right after.
const joinBookingDetails = [
    { $addFields: { showObjectId: { $convert: { input: '$show', to: 'objectId', onError: null, onNull: null } } } },
    { $lookup: { from: 'shows', localField: 'showObjectId', foreignField: '_id', as: 'showDoc' } },
    { $unwind: { path: '$showDoc', preserveNullAndEmptyArrays: true } },
    { $set: { showDoc: { showDateTime: '$showDoc.showDateTime', theaterType: '$showDoc.theaterType', movie: '$showDoc.movie', screen: '$showDoc.screen' } } },
    { $lookup: { from: 'movies', localField: 'showDoc.movie', foreignField: '_id', as: 'movieDoc' } },
    { $unwind: { path: '$movieDoc', preserveNullAndEmptyArrays: true } },
    { $set: { movieDoc: { title: '$movieDoc.title', poster_path: '$movieDoc.poster_path' } } },
    { $lookup: { from: 'screens', localField: 'showDoc.screen', foreignField: '_id', as: 'screenDoc' } },
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDoc' } },
    { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
];

const bookingProjection = {
    _id: 0,
    id: { $toString: '$_id' },
    createdAt: 1,
    amount: 1,
    seats: '$bookedSeat',
    isPaid: 1,
    isSimulated: { $ifNull: ['$isSimulated', false] },
    customerId: '$user',
    customer: { $ifNull: ['$userDoc.name', 'Guest'] },
    customerEmail: '$userDoc.email',
    customerImage: '$userDoc.image',
    showId: '$show',
    showStart: '$showDoc.showDateTime',
    theaterType: '$showDoc.theaterType',
    screenName: { $first: '$screenDoc.name' },
    movieId: '$showDoc.movie',
    movie: { $ifNull: ['$movieDoc.title', 'Removed movie'] },
    poster_path: '$movieDoc.poster_path',
};

/**
 * Shared filtering for the bookings table and CSV export.
 * Query: from, to (booking date, YYYY-MM-DD cinema-local), status (paid|unpaid),
 * source (real|simulated), movie, room, search (customer, email, movie or booking id)
 *
 * Movie, room and search are resolved to show and customer ids first (small
 * collections), so bookings can be filtered without joining every booking.
 */
const bookingFilters = async (query) => {
    const match = {};
    if (DATE_RE.test(query.from || '') || DATE_RE.test(query.to || '')) {
        match.createdAt = {};
        if (DATE_RE.test(query.from || '')) match.createdAt.$gte = zonedTimeToUtc(query.from);
        if (DATE_RE.test(query.to || '')) match.createdAt.$lt = new Date(zonedTimeToUtc(query.to).getTime() + DAY_MS);
    }
    if (query.status === 'paid') match.isPaid = true;
    if (query.status === 'unpaid') match.isPaid = false;
    if (query.source === 'simulated') match.isSimulated = true;
    if (query.source === 'real') match.isSimulated = { $ne: true };

    const showFilter = {};
    if (query.movie) showFilter.movie = String(query.movie);
    if (query.room && THEATER_TYPES.includes(query.room)) showFilter.theaterType = query.room;
    if (Object.keys(showFilter).length) {
        match.show = { $in: (await Show.distinct('_id', showFilter)).map(String) };
    }

    if (query.search) {
        const term = String(query.search).trim();
        const re = { $regex: escapeRegex(term), $options: 'i' };
        const [userIds, movieIds] = await Promise.all([
            User.distinct('_id', { $or: [{ name: re }, { email: re }] }),
            Movie.distinct('_id', { title: re }),
        ]);
        const showIds = movieIds.length ? (await Show.distinct('_id', { movie: { $in: movieIds.map(String) } })).map(String) : [];
        match.$or = [{ user: { $in: userIds } }, { show: { $in: showIds } }];
        if (mongoose.isValidObjectId(term)) match.$or.push({ _id: new mongoose.Types.ObjectId(term) });
    }
    return match;
};

const BOOKING_SORTS = {
    time: { createdAt: 1 }, '-time': { createdAt: -1 },
    amount: { amount: 1, createdAt: -1 }, '-amount': { amount: -1, createdAt: -1 },
};

// GET /api/admin/bookings-table
export const listBookings = async (req, res) => {
    try {
        const { page, limit } = pageParams(req.query);
        const match = await bookingFilters(req.query);
        const sort = BOOKING_SORTS[req.query.sort] || BOOKING_SORTS['-time'];

        // Page first, then join details only for the rows shown
        const pipeline = [{ $match: match }];
        pipeline.push({
            $facet: {
                rows: [
                    { $sort: sort },
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                    ...joinBookingDetails,
                    { $project: bookingProjection },
                ],
                total: [{ $count: 'count' }],
                totals: [{
                    $group: {
                        _id: null,
                        revenue: { $sum: { $cond: ['$isPaid', '$amount', 0] } },
                        tickets: { $sum: { $cond: ['$isPaid', { $size: '$bookedSeat' }, 0] } },
                        paid: { $sum: { $cond: ['$isPaid', 1, 0] } },
                        unpaid: { $sum: { $cond: ['$isPaid', 0, 1] } },
                    }
                }],
            }
        });

        const [result] = await Booking.aggregate(pipeline);
        const total = result.total[0]?.count || 0;
        const totals = result.totals[0] || { revenue: 0, tickets: 0, paid: 0, unpaid: 0 };
        res.json({
            success: true,
            page, limit, total,
            pages: Math.max(1, Math.ceil(total / limit)),
            summary: {
                bookings: total,
                revenue: totals.revenue,
                tickets: totals.tickets,
                paid: totals.paid,
                unpaid: totals.unpaid,
                conversion: total ? totals.paid / total : 0,
            },
            bookings: result.rows,
        });
    } catch (error) {
        console.error('[Bookings]', error);
        res.json({ success: false, message: error.message });
    }
};

// Spreadsheet apps run cells starting with = + - @ (or tab / carriage return) as formulas;
// prefix them so customer-controlled text (e.g. names) can't become one
const neutralize = (text) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);
const csvCell = (value) => {
    // Numbers stay as they are; text is neutralized
    const text = value === null || value === undefined ? '' : typeof value === 'string' ? neutralize(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvDate = (date) => date
    ? new Date(date).toLocaleString('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

// GET /api/admin/bookings-export — same filters as the table, as a CSV download
export const exportBookings = async (req, res) => {
    try {
        const match = await bookingFilters(req.query);
        const rows = await Booking.aggregate([
            { $match: match },
            { $sort: { createdAt: -1 } },
            { $limit: EXPORT_LIMIT },
            ...joinBookingDetails,
            { $project: bookingProjection },
        ]);

        const header = ['Booking ID', 'Booked at (CT)', 'Status', 'Source', 'Customer', 'Email', 'Movie', 'Showtime (CT)', 'Screen', 'Room', 'Seats', 'Tickets', 'Amount'];
        const lines = rows.map(b => [
            b.id, csvDate(b.createdAt), b.isPaid ? 'Paid' : 'Unpaid', b.isSimulated ? 'Simulated' : 'Real',
            b.customer, b.customerEmail, b.movie, csvDate(b.showStart), b.screenName, b.theaterType,
            (b.seats || []).join(' '), (b.seats || []).length, b.amount,
        ].map(csvCell).join(','));

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send([header.join(','), ...lines].join('\n'));
    } catch (error) {
        console.error('[BookingsExport]', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/admin/bookings/:id
export const getBookingDetails = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.json({ success: false, message: 'Booking not found' });
        const [booking] = await Booking.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
            ...joinBookingDetails,
            { $project: { ...bookingProjection, paymentReference: '$paymentLink', updatedAt: 1 } },
        ]);
        if (!booking) return res.json({ success: false, message: 'Booking not found' });
        res.json({ success: true, booking });
    } catch (error) {
        console.error('[BookingDetails]', error);
        res.json({ success: false, message: error.message });
    }
};

const CUSTOMER_SORTS = {
    spent: { spent: 1, name: 1 }, '-spent': { spent: -1, name: 1 },
    bookings: { bookings: 1, name: 1 }, '-bookings': { bookings: -1, name: 1 },
    lastVisit: { lastVisit: 1, name: 1 }, '-lastVisit': { lastVisit: -1, name: 1 },
    name: { name: 1 }, '-name': { name: -1 },
};

// Paid-booking totals per customer
const customerStats = {
    $lookup: {
        from: 'bookings', localField: '_id', foreignField: 'user',
        pipeline: [
            { $match: { isPaid: true } },
            {
                $group: {
                    _id: null,
                    bookings: { $sum: 1 },
                    tickets: { $sum: { $size: '$bookedSeat' } },
                    spent: { $sum: '$amount' },
                    firstVisit: { $min: '$createdAt' },
                    lastVisit: { $max: '$createdAt' },
                }
            },
        ],
        as: 'stats',
    }
};

// GET /api/admin/customers-table — query: search, source (real|simulated), sort, page, limit
export const listCustomers = async (req, res) => {
    try {
        const { page, limit } = pageParams(req.query);
        const match = {};
        if (req.query.source === 'simulated') match.isSimulated = true;
        if (req.query.source === 'real') match.isSimulated = { $ne: true };
        if (req.query.search) {
            const re = { $regex: escapeRegex(String(req.query.search).trim()), $options: 'i' };
            match.$or = [{ name: re }, { email: re }];
        }

        const [result] = await User.aggregate([
            { $match: match },
            customerStats,
            {
                $project: {
                    _id: 0,
                    id: '$_id',
                    name: 1,
                    email: 1,
                    image: 1,
                    isSimulated: { $ifNull: ['$isSimulated', false] },
                    joinedAt: '$createdAt',
                    bookings: { $ifNull: [{ $first: '$stats.bookings' }, 0] },
                    tickets: { $ifNull: [{ $first: '$stats.tickets' }, 0] },
                    spent: { $ifNull: [{ $first: '$stats.spent' }, 0] },
                    firstVisit: { $first: '$stats.firstVisit' },
                    lastVisit: { $first: '$stats.lastVisit' },
                }
            },
            {
                $facet: {
                    rows: [{ $sort: CUSTOMER_SORTS[req.query.sort] || CUSTOMER_SORTS['-spent'] }, { $skip: (page - 1) * limit }, { $limit: limit }],
                    total: [{ $count: 'count' }],
                    totals: [{
                        $group: {
                            _id: null,
                            spent: { $sum: '$spent' },
                            withBookings: { $sum: { $cond: [{ $gt: ['$bookings', 0] }, 1, 0] } },
                            repeat: { $sum: { $cond: [{ $gte: ['$bookings', 2] }, 1, 0] } },
                        }
                    }],
                }
            },
        ]);

        const total = result.total[0]?.count || 0;
        const totals = result.totals[0] || { spent: 0, withBookings: 0, repeat: 0 };
        res.json({
            success: true,
            page, limit, total,
            pages: Math.max(1, Math.ceil(total / limit)),
            summary: {
                customers: total,
                spent: totals.spent,
                averageSpend: totals.withBookings ? totals.spent / totals.withBookings : 0,
                repeatRate: totals.withBookings ? totals.repeat / totals.withBookings : 0,
            },
            customers: result.rows,
        });
    } catch (error) {
        console.error('[Customers]', error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/admin/customers/:id — profile, totals, favourites and recent bookings
export const getCustomerDetails = async (req, res) => {
    try {
        const user = await User.findById(String(req.params.id)).lean();
        if (!user) return res.json({ success: false, message: 'Customer not found' });

        const [recent, [totals], favouriteRooms, favouriteMovies] = await Promise.all([
            Booking.aggregate([
                { $match: { user: user._id } },
                { $sort: { createdAt: -1 } },
                { $limit: 50 },
                ...joinBookingDetails,
                { $project: bookingProjection },
            ]),
            Booking.aggregate([
                { $match: { user: user._id } },
                {
                    $group: {
                        _id: null,
                        bookings: { $sum: { $cond: ['$isPaid', 1, 0] } },
                        tickets: { $sum: { $cond: ['$isPaid', { $size: '$bookedSeat' }, 0] } },
                        spent: { $sum: { $cond: ['$isPaid', '$amount', 0] } },
                        abandoned: { $sum: { $cond: ['$isPaid', 0, 1] } },
                        firstVisit: { $min: { $cond: ['$isPaid', '$createdAt', null] } },
                        lastVisit: { $max: { $cond: ['$isPaid', '$createdAt', null] } },
                    }
                },
            ]),
            // Most-booked room type and movie, from paid bookings
            Booking.aggregate([
                { $match: { user: user._id, isPaid: true } },
                ...joinBookingDetails.slice(0, 4),
                { $group: { _id: '$showDoc.theaterType', n: { $sum: 1 } } },
                { $sort: { n: -1 } },
                { $limit: 1 },
            ]),
            Booking.aggregate([
                { $match: { user: user._id, isPaid: true } },
                ...joinBookingDetails.slice(0, 7),
                { $group: { _id: '$movieDoc.title', n: { $sum: 1 } } },
                { $sort: { n: -1 } },
                { $limit: 1 },
            ]),
        ]);

        res.json({
            success: true,
            customer: {
                id: user._id,
                name: user.name,
                email: user.email,
                image: user.image,
                isSimulated: Boolean(user.isSimulated),
                joinedAt: user.createdAt || null,
            },
            stats: {
                bookings: totals?.bookings || 0,
                tickets: totals?.tickets || 0,
                spent: totals?.spent || 0,
                abandoned: totals?.abandoned || 0,
                firstVisit: totals?.firstVisit || null,
                lastVisit: totals?.lastVisit || null,
                favouriteRoom: favouriteRooms[0]?._id || null,
                favouriteMovie: favouriteMovies[0]?._id || null,
            },
            bookings: recent,
        });
    } catch (error) {
        console.error('[CustomerDetails]', error);
        res.json({ success: false, message: error.message });
    }
};
