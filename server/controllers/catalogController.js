import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import Screen from "../models/Screen.js";
import Booking from "../models/Booking.js";
import { THEATER_TYPES } from "../configs/theaterTypes.js";
import { ensureScreens } from "../configs/screens.js";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MOVIE_SORTS = {
    title: { title: 1 }, '-title': { title: -1 },
    release: { release_date: 1 }, '-release': { release_date: -1 },
    upcoming: { upcomingShows: 1, title: 1 }, '-upcoming': { upcomingShows: -1, title: 1 },
    revenue: { revenue: 1, title: 1 }, '-revenue': { revenue: -1, title: 1 },
};

/**
 * GET /api/admin/movies-table
 * Query: search, status (scheduled|unscheduled|paused), sort, page, limit
 */
export const listMovies = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 25));
        const now = new Date();

        const match = {};
        if (req.query.search) match.title = { $regex: escapeRegex(String(req.query.search).trim()), $options: 'i' };
        if (req.query.status === 'paused') match.paused = true;

        // Show counts per movie (small: one row per movie)
        const showCounts = await Show.aggregate([
            {
                $group: {
                    _id: '$movie',
                    upcoming: { $sum: { $cond: [{ $gt: ['$showDateTime', now] }, 1, 0] } },
                    played: { $sum: { $cond: [{ $lte: ['$showDateTime', now] }, 1, 0] } },
                    nextShow: { $min: { $cond: [{ $gt: ['$showDateTime', now] }, '$showDateTime', null] } },
                    lastShow: { $max: { $cond: [{ $lte: ['$showDateTime', now] }, '$showDateTime', null] } },
                }
            },
        ]);
        const countsByMovie = Object.fromEntries(showCounts.map(c => [c._id, c]));
        if (req.query.status === 'scheduled') match._id = { $in: showCounts.filter(c => c.upcoming > 0).map(c => c._id) };
        if (req.query.status === 'unscheduled') match._id = { $nin: showCounts.filter(c => c.upcoming > 0).map(c => c._id) };

        const movies = await Movie.find(match)
            .select('title poster_path release_date runtime genres vote_average paused')
            .lean();

        // Revenue per movie: paid bookings grouped by show, then by the show's movie
        const revenueRows = await Booking.aggregate([
            { $match: { isPaid: true } },
            { $group: { _id: '$show', revenue: { $sum: '$amount' }, tickets: { $sum: { $size: '$bookedSeat' } } } },
            { $addFields: { showObjectId: { $convert: { input: '$_id', to: 'objectId', onError: null, onNull: null } } } },
            { $lookup: { from: 'shows', localField: 'showObjectId', foreignField: '_id', as: 'showDoc' } },
            { $unwind: '$showDoc' },
            { $group: { _id: '$showDoc.movie', revenue: { $sum: '$revenue' }, tickets: { $sum: '$tickets' } } },
        ]);
        const revenueByMovie = Object.fromEntries(revenueRows.map(r => [r._id, r]));

        const rows = movies.map(m => {
            const id = String(m._id);
            const counts = countsByMovie[id] || {};
            return {
                id,
                title: m.title,
                poster_path: m.poster_path,
                release_date: m.release_date,
                runtime: m.runtime,
                genres: (m.genres || []).map(g => g.name),
                rating: m.vote_average,
                paused: Boolean(m.paused),
                upcomingShows: counts.upcoming || 0,
                playedShows: counts.played || 0,
                nextShow: counts.nextShow || null,
                lastShow: counts.lastShow || null,
                revenue: revenueByMovie[id]?.revenue || 0,
                tickets: revenueByMovie[id]?.tickets || 0,
            };
        });

        const sort = MOVIE_SORTS[req.query.sort] || MOVIE_SORTS['-upcoming'];
        const [[key, dir], second] = [Object.entries(sort)[0], Object.entries(sort)[1]];
        rows.sort((a, b) => {
            const primary = a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0;
            if (primary || !second) return primary;
            return a[second[0]] < b[second[0]] ? -second[1] : a[second[0]] > b[second[0]] ? second[1] : 0;
        });

        res.json({
            success: true,
            page,
            limit,
            total: rows.length,
            pages: Math.max(1, Math.ceil(rows.length / limit)),
            summary: {
                movies: rows.length,
                scheduled: rows.filter(r => r.upcomingShows > 0).length,
                paused: rows.filter(r => r.paused).length,
            },
            movies: rows.slice((page - 1) * limit, page * limit),
        });
    } catch (error) {
        console.error('[Movies]', error);
        res.json({ success: false, message: error.message });
    }
};

// PATCH /api/admin/movies/:id — body: { paused }
export const updateMovie = async (req, res) => {
    try {
        if (typeof req.body.paused !== 'boolean') return res.json({ success: false, message: 'Nothing to update' });
        const movie = await Movie.findByIdAndUpdate(String(req.params.id), { $set: { paused: req.body.paused } }, { new: true }).select('title paused').lean();
        if (!movie) return res.json({ success: false, message: 'Movie not found' });
        res.json({
            success: true,
            message: movie.paused
                ? `${movie.title} is paused: the scheduler won't add new shows for it`
                : `${movie.title} is active again and can be scheduled`,
        });
    } catch (error) {
        console.error('[UpdateMovie]', error);
        res.json({ success: false, message: error.message });
    }
};

// DELETE /api/admin/movies/:id/upcoming-shows — removes the movie's upcoming shows with no tickets sold
export const removeUnsoldShows = async (req, res) => {
    try {
        const movieId = String(req.params.id);
        const upcoming = await Show.find({ movie: movieId, showDateTime: { $gt: new Date() } }).select('occupiedSeats').lean();
        const unsoldIds = upcoming.filter(s => Object.keys(s.occupiedSeats || {}).length === 0).map(s => s._id);
        const withSales = new Set((await Booking.distinct('show', { show: { $in: unsoldIds.map(String) }, isPaid: true })).map(String));
        const removable = unsoldIds.filter(id => !withSales.has(String(id)));

        await Booking.deleteMany({ show: { $in: removable.map(String) }, isPaid: false });
        const { deletedCount } = await Show.deleteMany({ _id: { $in: removable }, occupiedSeats: {} });
        const kept = upcoming.length - deletedCount;
        res.json({
            success: true,
            message: `Removed ${deletedCount} unsold upcoming show${deletedCount === 1 ? '' : 's'}${kept ? `; kept ${kept} with tickets sold` : ''}`,
            removed: deletedCount,
            kept,
        });
    } catch (error) {
        console.error('[RemoveUnsoldShows]', error);
        res.json({ success: false, message: error.message });
    }
};

// GET /api/admin/screens-admin — every screen (including closed ones) with its upcoming shows
export const listScreensAdmin = async (req, res) => {
    try {
        await ensureScreens();
        const [screens, upcoming] = await Promise.all([
            Screen.find({}).sort({ number: 1 }).lean(),
            Show.aggregate([
                { $match: { showDateTime: { $gt: new Date() }, screen: { $ne: null } } },
                {
                    $group: {
                        _id: '$screen',
                        shows: { $sum: 1 },
                        withSales: { $sum: { $cond: [{ $gt: [{ $size: { $objectToArray: { $ifNull: ['$occupiedSeats', {}] } } }, 0] }, 1, 0] } },
                    }
                },
            ]),
        ]);
        const byScreen = Object.fromEntries(upcoming.map(u => [u._id, u]));
        res.json({
            success: true,
            rooms: THEATER_TYPES,
            screens: screens.map(s => ({
                id: s._id,
                name: s.name,
                number: s.number,
                theaterType: s.theaterType,
                capacity: s.capacity,
                active: s.active,
                upcomingShows: byScreen[s._id]?.shows || 0,
                upcomingWithSales: byScreen[s._id]?.withSales || 0,
            })),
        });
    } catch (error) {
        console.error('[ScreensAdmin]', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * PATCH /api/admin/screens/:id — body: { name, theaterType, active }
 * A new room type also applies to the screen's upcoming shows with no tickets
 * sold; shows that already have tickets keep the room (and price) customers paid for.
 * A closed screen gets no new shows; its existing shows stay until removed.
 */
export const updateScreen = async (req, res) => {
    try {
        const screen = await Screen.findById(String(req.params.id)).lean();
        if (!screen) return res.json({ success: false, message: 'Screen not found' });

        const { name, theaterType, active } = req.body;
        const update = {};
        if (name !== undefined) {
            const trimmed = String(name).trim();
            if (!trimmed || trimmed.length > 40) return res.json({ success: false, message: 'Enter a screen name up to 40 characters' });
            update.name = trimmed;
        }
        if (theaterType !== undefined) {
            if (!THEATER_TYPES.includes(theaterType)) return res.json({ success: false, message: 'Choose a valid room type' });
            update.theaterType = theaterType;
        }
        if (active !== undefined) update.active = Boolean(active);
        if (Object.keys(update).length === 0) return res.json({ success: true, message: 'Nothing to change' });

        await Screen.updateOne({ _id: screen._id }, { $set: update });

        let retyped = 0;
        if (update.theaterType && update.theaterType !== screen.theaterType) {
            const result = await Show.updateMany(
                { screen: screen._id, showDateTime: { $gt: new Date() }, occupiedSeats: {} },
                { $set: { theaterType: update.theaterType } },
            );
            retyped = result.modifiedCount;
        }

        const notes = [];
        if (retyped) notes.push(`${retyped} upcoming show${retyped === 1 ? '' : 's'} switched to ${update.theaterType}`);
        if (update.active === false && screen.active) notes.push('the scheduler will stop adding shows here');
        res.json({ success: true, message: `${update.name || screen.name} updated${notes.length ? `: ${notes.join('; ')}` : ''}` });
    } catch (error) {
        console.error('[UpdateScreen]', error);
        res.json({ success: false, message: error.message });
    }
};
