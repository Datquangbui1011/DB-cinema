import mongoose from "mongoose";
import Show from "../models/Show.js";
import Movie from "../models/Movie.js";
import Screen from "../models/Screen.js";
import Booking from "../models/Booking.js";
import { zonedTimeToUtc } from "../configs/cinemaTime.js";
import { SEATS_PER_SHOW, THEATER_TYPES } from "../configs/theaterTypes.js";
import { findScreenConflicts, conflictMessage } from "../services/showConflicts.js";

const DEFAULT_RUNTIME = 120;
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const STATUSES = ['upcoming', 'live', 'ended', 'soldout'];
const SORTS = {
    time: { showDateTime: 1 },
    '-time': { showDateTime: -1 },
    occupancy: { seatsSold: 1, showDateTime: 1 },
    '-occupancy': { seatsSold: -1, showDateTime: 1 },
    revenue: { revenue: 1, showDateTime: 1 },
    '-revenue': { revenue: -1, showDateTime: 1 },
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * GET /api/admin/shows-table
 * Query: from, to (YYYY-MM-DD, cinema-local, inclusive), movie, screen, room,
 * status (upcoming|live|ended|soldout), search, sort, page, limit
 */
export const listShows = async (req, res) => {
    try {
        const { from, to, movie, screen, room, status, search, sort = 'time' } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 25));
        const now = new Date();

        const match = {};
        if (DATE_RE.test(from || '') || DATE_RE.test(to || '')) {
            match.showDateTime = {};
            if (DATE_RE.test(from || '')) match.showDateTime.$gte = zonedTimeToUtc(from);
            if (DATE_RE.test(to || '')) match.showDateTime.$lt = new Date(zonedTimeToUtc(to).getTime() + DAY_MS);
        }
        if (movie) match.movie = String(movie);
        if (screen) match.screen = screen === 'none' ? null : String(screen);
        if (room && THEATER_TYPES.includes(room)) match.theaterType = room;

        const pipeline = [
            { $match: match },
            { $lookup: { from: 'movies', localField: 'movie', foreignField: '_id', as: 'movieDoc' } },
            { $unwind: '$movieDoc' },
        ];
        if (search) pipeline.push({ $match: { 'movieDoc.title': { $regex: escapeRegex(String(search)), $options: 'i' } } });

        pipeline.push(
            {
                $addFields: {
                    seatsSold: { $size: { $objectToArray: { $ifNull: ['$occupiedSeats', {}] } } },
                    endTime: { $add: ['$showDateTime', { $multiply: [{ $ifNull: ['$movieDoc.runtime', DEFAULT_RUNTIME] }, 60_000] }] },
                }
            },
            {
                $addFields: {
                    status: {
                        $switch: {
                            branches: [
                                { case: { $lte: ['$endTime', now] }, then: 'ended' },
                                { case: { $lte: ['$showDateTime', now] }, then: 'live' },
                                { case: { $gte: ['$seatsSold', SEATS_PER_SHOW] }, then: 'soldout' },
                            ],
                            default: 'upcoming',
                        }
                    }
                }
            },
        );
        if (STATUSES.includes(status)) pipeline.push({ $match: { status } });

        // Revenue from paid bookings (Booking.show is the show id as a string)
        pipeline.push(
            { $addFields: { showIdString: { $toString: '$_id' } } },
            {
                $lookup: {
                    from: 'bookings',
                    let: { sid: '$showIdString' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$show', '$$sid'] }, isPaid: true } },
                        { $group: { _id: null, revenue: { $sum: '$amount' }, bookings: { $sum: 1 } } },
                    ],
                    as: 'sales',
                }
            },
            { $addFields: { revenue: { $ifNull: [{ $first: '$sales.revenue' }, 0] }, bookings: { $ifNull: [{ $first: '$sales.bookings' }, 0] } } },
            { $sort: SORTS[sort] || SORTS.time },
            {
                $facet: {
                    rows: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                        { $lookup: { from: 'screens', localField: 'screen', foreignField: '_id', as: 'screenDoc' } },
                        {
                            $project: {
                                _id: 0,
                                id: '$showIdString',
                                start: '$showDateTime',
                                end: '$endTime',
                                status: 1,
                                theaterType: 1,
                                showPrice: 1,
                                seatsSold: 1,
                                revenue: 1,
                                bookings: 1,
                                movieId: '$movie',
                                title: '$movieDoc.title',
                                poster_path: '$movieDoc.poster_path',
                                runtime: '$movieDoc.runtime',
                                screenId: '$screen',
                                screenName: { $first: '$screenDoc.name' },
                            }
                        },
                    ],
                    total: [{ $count: 'count' }],
                    totals: [{ $group: { _id: null, seatsSold: { $sum: '$seatsSold' }, revenue: { $sum: '$revenue' }, shows: { $sum: 1 } } }],
                }
            },
        );

        const [result] = await Show.aggregate(pipeline);
        const total = result.total[0]?.count || 0;
        const totals = result.totals[0] || { seatsSold: 0, revenue: 0, shows: 0 };
        res.json({
            success: true,
            page,
            limit,
            total,
            pages: Math.max(1, Math.ceil(total / limit)),
            capacity: SEATS_PER_SHOW,
            summary: {
                shows: totals.shows,
                seatsSold: totals.seatsSold,
                revenue: totals.revenue,
                occupancy: totals.shows ? totals.seatsSold / (totals.shows * SEATS_PER_SHOW) : 0,
            },
            shows: result.rows,
        });
    } catch (error) {
        console.error('[Shows]', error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/admin/shows-filters — movies that have shows, and every screen
export const getShowFilters = async (req, res) => {
    try {
        const movieIds = await Show.distinct('movie', { showDateTime: { $gte: new Date(Date.now() - 30 * DAY_MS) } });
        const [movies, screens] = await Promise.all([
            Movie.find({ _id: { $in: movieIds } }).select('_id title runtime poster_path').sort({ title: 1 }).lean(),
            Screen.find({}).sort({ number: 1 }).lean(),
        ]);
        res.json({
            success: true,
            movies: movies.map(m => ({ id: String(m._id), title: m.title, runtime: m.runtime, poster_path: m.poster_path })),
            screens: screens.map(s => ({ id: s._id, name: s.name, theaterType: s.theaterType, active: s.active })),
            rooms: THEATER_TYPES,
        });
    } catch (error) {
        console.error('[ShowFilters]', error);
        res.json({ success: false, message: error.message });
    }
};

const hasSales = async (show) =>
    Object.keys(show.occupiedSeats || {}).length > 0 ||
    Boolean(await Booking.exists({ show: String(show._id), isPaid: true }));

/**
 * PATCH /api/admin/shows/:id — body: { date, time, screenId, showPrice }
 * Shows that have started can't be edited. Once tickets are sold the time and
 * screen are locked (customers were sold that slot); the price can still change.
 */
export const updateShow = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.json({ success: false, message: 'Show not found' });
        const show = await Show.findById(req.params.id).populate('movie', 'title runtime').lean();
        if (!show) return res.json({ success: false, message: 'Show not found' });
        if (show.showDateTime <= new Date()) return res.json({ success: false, message: 'This show has already started and can no longer be edited' });

        const { date, time, screenId, showPrice } = req.body;
        const update = {};

        if (showPrice !== undefined) {
            const price = Number(showPrice);
            if (!Number.isFinite(price) || price <= 0 || price > 500) return res.json({ success: false, message: 'Enter a ticket price between $0 and $500' });
            update.showPrice = price;
        }

        const wantsTime = date !== undefined || time !== undefined;
        const newStart = wantsTime ? zonedTimeToUtc(date, time) : show.showDateTime;
        if (wantsTime && (!DATE_RE.test(date || '') || !TIME_RE.test(time || '') || isNaN(newStart))) {
            return res.json({ success: false, message: 'Enter a valid date and time' });
        }
        const newScreenId = screenId !== undefined ? screenId : show.screen;
        const moving = newStart.getTime() !== show.showDateTime.getTime() || newScreenId !== show.screen;

        if (moving) {
            if (await hasSales(show)) {
                return res.json({ success: false, message: 'Tickets have been sold for this show, so its time and screen can no longer change' });
            }
            if (newStart <= new Date()) return res.json({ success: false, message: 'Pick a time in the future' });

            const screen = await Screen.findById(newScreenId).lean();
            if (!screen || !screen.active) return res.json({ success: false, message: 'Please choose a valid screen' });

            const conflicts = await findScreenConflicts(screen._id, [newStart], show.movie?.runtime || DEFAULT_RUNTIME, { excludeShowId: show._id });
            if (conflicts.length) return res.json({ success: false, message: conflictMessage(screen.name, conflicts) });

            Object.assign(update, { showDateTime: newStart, screen: screen._id, theaterType: screen.theaterType });
        }

        if (Object.keys(update).length === 0) return res.json({ success: true, message: 'Nothing to change' });
        await Show.updateOne({ _id: show._id }, { $set: update });
        res.json({ success: true, message: 'Show updated' });
    } catch (error) {
        console.error('[UpdateShow]', error);
        res.json({ success: false, message: error.message });
    }
};

// DELETE /api/admin/shows/:id — cancel a show that has no tickets sold
export const cancelShow = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.json({ success: false, message: 'Show not found' });
        const show = await Show.findById(req.params.id).lean();
        if (!show) return res.json({ success: false, message: 'Show not found' });
        if (show.showDateTime <= new Date()) return res.json({ success: false, message: 'This show has already started and cannot be cancelled' });
        if (await hasSales(show)) {
            return res.json({ success: false, message: 'Tickets have been sold for this show, so it cannot be cancelled here' });
        }

        // Unpaid checkouts for this show go with it
        await Booking.deleteMany({ show: String(show._id), isPaid: false });
        await Show.deleteOne({ _id: show._id, occupiedSeats: {} });
        res.json({ success: true, message: 'Show cancelled' });
    } catch (error) {
        console.error('[CancelShow]', error);
        res.json({ success: false, message: error.message });
    }
};
