/**
 * The AI Advisor's batch job. Each run:
 *   1. records the actual seats sold for predictions whose show has started,
 *   2. forecasts every upcoming show (next DAYS_AHEAD days) and stores a Prediction,
 *   3. drops predictions for upcoming shows that no longer exist (cancelled),
 *   4. regenerates recommendations: new advice is added, pending advice is
 *      refreshed, and pending advice whose trigger no longer holds expires.
 *
 * Runs from POST /api/admin/advisor/refresh and (later) the nightly cron.
 */
import mongoose from 'mongoose';
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Booking from '../models/Booking.js';
import Screen from '../models/Screen.js';
import Prediction from '../models/Prediction.js';
import Recommendation from '../models/Recommendation.js';
import SystemState from '../models/SystemState.js';
import { createHistory } from '../ml/features.js';
import { forecastShow, loadModel } from '../ml/predictor.js';
import { theaterPremiums } from '../configs/theaterTypes.js';
import { generateRecommendations } from './rules.js';
import { withLock } from './lock.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DAYS_AHEAD = 14;          // matches the scheduler
const HISTORY_DAYS = 35;        // covers the 28-day slot and 7-day movie history
const LONGEST_SHOW_MS = 6 * HOUR_MS;

const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

// Paid seats and revenue per show, for the given show ids
const salesFor = async (showIds) => {
    if (showIds.length === 0) return new Map();
    const rows = await Booking.aggregate([
        { $match: { show: { $in: showIds }, isPaid: true } },
        { $group: { _id: '$show', seats: { $sum: { $size: '$bookedSeat' } }, revenue: { $sum: '$amount' } } },
    ]);
    return new Map(rows.map(r => [r._id, { seats: r.seats, revenue: r.revenue }]));
};

// Everything the forecasts and rules need, loaded once
const loadContext = async (now) => {
    const [upcoming, past, screens] = await Promise.all([
        Show.find({ showDateTime: { $gt: now, $lte: new Date(now.getTime() + DAYS_AHEAD * DAY_MS) } })
            .select('-occupiedSeats').lean(),
        Show.find({ showDateTime: { $lte: now, $gt: new Date(now.getTime() - HISTORY_DAYS * DAY_MS) } })
            .select('movie screen theaterType showDateTime').lean(),
        Screen.find({ active: true }).sort({ number: 1 }).lean(),
    ]);
    const recentlyStarted = past.filter(s => now - s.showDateTime < LONGEST_SHOW_MS);
    const movieIds = [...new Set([...upcoming, ...recentlyStarted].map(s => String(s.movie)))];
    const [movies, sales] = await Promise.all([
        Movie.find({ _id: { $in: movieIds } }).select('title poster_path release_date runtime vote_average genres').lean(),
        salesFor([...upcoming, ...past].map(s => String(s._id))),
    ]);
    const movieById = new Map(movies.map(m => [String(m._id), m]));
    const history = createHistory(past.map(s => ({ ...s, seatsSold: sales.get(String(s._id))?.seats || 0 })));
    const withMovie = (s) => ({ ...s, movieDoc: movieById.get(String(s.movie)), runtime: movieById.get(String(s.movie))?.runtime });
    return {
        now,
        screens,
        history,
        sales,
        shows: upcoming.map(withMovie),
        busyShows: [...recentlyStarted, ...upcoming].map(withMovie),
    };
};

const predictUpcomingShows = async (ctx) => {
    const model = loadModel();
    const { now, history, sales } = ctx;
    const predictions = new Map();
    const ops = [];
    let skipped = 0;

    for (const show of ctx.shows) {
        if (!show.movieDoc) { skipped += 1; continue; }
        const id = String(show._id);
        const sold = sales.get(id) || { seats: 0, revenue: 0 };
        const f = forecastShow({ show, movie: show.movieDoc, seatsSoldNow: sold.seats, at: now, history });
        const ticketPrice = show.showPrice + (theaterPremiums[show.theaterType] ?? 0);
        predictions.set(id, { ...f, sold: sold.seats, revenueSoFar: sold.revenue });
        ops.push({
            updateOne: {
                filter: { show: id },
                update: {
                    $set: {
                        movie: String(show.movie),
                        screen: show.screen || null,
                        theaterType: show.theaterType,
                        showDateTime: show.showDateTime,
                        capacity: model.capacity,
                        seatsSoldAtPrediction: sold.seats,
                        hoursUntilAtPrediction: round((show.showDateTime - now) / HOUR_MS, 1),
                        predictedSeats: round(f.seats, 1),
                        low: round(f.low, 1),
                        high: round(f.high, 1),
                        predictedOccupancy: round(f.occupancy, 4),
                        ticketPrice,
                        revenueSoFar: round(sold.revenue),
                        predictedRevenue: round(sold.revenue + (f.seats - sold.seats) * ticketPrice),
                        actualSeats: null,
                        predictedAt: now,
                        modelVersion: f.modelVersion,
                    },
                },
                upsert: true,
            },
        });
    }
    const predicted = ops.length;
    // Keep the first forecast made 1-3 days ahead and within a day (never overwritten)
    for (const show of ctx.shows) {
        const p = predictions.get(String(show._id));
        if (!p) continue;
        const hoursAhead = (show.showDateTime - now) / HOUR_MS;
        const field = hoursAhead <= 24 ? 'forecast24h' : hoursAhead <= 72 ? 'forecast72h' : null;
        if (!field) continue;
        ops.push({
            updateOne: {
                filter: { show: String(show._id), [field]: { $exists: false } },
                update: { $set: { [field]: { seats: round(p.seats, 1), low: round(p.low, 1), high: round(p.high, 1), sold: p.sold, hoursAhead: round(hoursAhead, 1), at: now } } },
            },
        });
    }
    // Ordered, so a new show's prediction exists before its horizon snapshot is added
    if (ops.length) await Prediction.bulkWrite(ops, { ordered: true });

    // Upcoming shows that were cancelled or moved out of range lose their forecast
    const { deletedCount: removed } = await Prediction.deleteMany({
        showDateTime: { $gt: now },
        show: { $nin: ctx.shows.map(s => String(s._id)) },
    });

    return { predictions, summary: { predicted, skipped, removed, modelVersion: model.version } };
};

// Freeze predictions whose show has started by recording what really sold
export const recordActuals = async (now = new Date()) => {
    let pending = await Prediction.find({ actualSeats: null, showDateTime: { $lte: now } }).select('show').lean();
    if (pending.length === 0) return { recorded: 0 };
    // A show that was cancelled never played: drop its forecast instead of recording "0 sold"
    const ids = pending.map(p => p.show).filter(id => mongoose.isValidObjectId(id));
    const existing = new Set((await Show.find({ _id: { $in: ids } }).distinct('_id')).map(String));
    const cancelled = pending.filter(p => !existing.has(p.show));
    if (cancelled.length) await Prediction.deleteMany({ _id: { $in: cancelled.map(p => p._id) } });
    pending = pending.filter(p => existing.has(p.show));
    if (pending.length === 0) return { recorded: 0 };
    const sales = await salesFor(pending.map(p => p.show));
    await Prediction.bulkWrite(pending.map(p => ({
        updateOne: { filter: { _id: p._id }, update: { $set: { actualSeats: sales.get(p.show)?.seats || 0 } } },
    })), { ordered: false });
    return { recorded: pending.length };
};

/**
 * Save this run's advice. One recommendation per show and type: pending ones
 * are updated in place (stable ids for the UI), dismissed or applied ones are
 * not offered again, and pending ones that no longer apply expire.
 */
const syncRecommendations = async (ctx, predictions, modelVersion) => {
    const candidates = generateRecommendations({
        ...ctx,
        predictions,
        forecast: (show, seatsSoldNow) => forecastShow({ show, movie: show.movieDoc, seatsSoldNow, at: ctx.now, history: ctx.history }),
    });
    const showById = new Map(ctx.shows.map(s => [String(s._id), s]));
    const existing = await Recommendation.find({
        show: { $in: [...new Set(candidates.map(c => c.show))] },
        status: { $in: ['pending', 'applied', 'dismissed'] },
    }).select('show type status').lean();
    const byKey = new Map(existing.map(r => [`${r.show}|${r.type}`, r]));

    const ops = [];
    const keep = [];
    let created = 0, updated = 0;
    for (const c of candidates) {
        const prior = byKey.get(`${c.show}|${c.type}`);
        if (prior && prior.status !== 'pending') continue;     // already handled by a manager
        const show = showById.get(c.show);
        const p = predictions.get(c.show);
        const doc = {
            ...c,
            movie: String(show.movie),
            showDateTime: show.showDateTime,
            bestImpact: Math.max(...c.options.map(o => o.impact.revenue)),
            forecast: { seats: round(p.seats, 1), low: round(p.low, 1), high: round(p.high, 1), occupancy: round(p.occupancy, 4), sold: p.sold },
            modelVersion,
        };
        if (prior) {
            keep.push(prior._id);
            updated += 1;
            ops.push({ updateOne: { filter: { _id: prior._id, status: 'pending' }, update: { $set: doc } } });
        } else {
            created += 1;
            ops.push({ insertOne: { document: { ...doc, status: 'pending' } } });
        }
    }
    if (ops.length) {
        try {
            await Recommendation.bulkWrite(ops, { ordered: false });
        } catch (error) {
            // A pending one for the same show and type already exists (unique index): keep that one
            const errors = error.writeErrors || [];
            if (!errors.length || errors.some(e => (e.code ?? e.err?.code) !== 11000)) throw error;
            created -= errors.length;
        }
    }

    const { modifiedCount: expired } = await Recommendation.updateMany(
        { status: 'pending', _id: { $nin: keep }, $or: [{ updatedAt: { $lt: ctx.now } }, { showDateTime: { $lte: ctx.now } }] },
        { $set: { status: 'expired', closedAt: ctx.now } },
    );
    return { recommendations: candidates.length, created, updated, expired };
};

export const runAdvisor = (opts = {}) => withLock('advisor-run', () => runAdvisorUnlocked(opts));

const runAdvisorUnlocked = async ({ trigger = 'manual' } = {}) => {
    const started = Date.now();
    const now = new Date();
    const actuals = await recordActuals(now);
    const ctx = await loadContext(now);
    const { predictions, summary } = await predictUpcomingShows(ctx);
    const recs = await syncRecommendations(ctx, predictions, summary.modelVersion);
    const report = { trigger, ranAt: now, durationMs: Date.now() - started, ...summary, actualsRecorded: actuals.recorded, ...recs };
    await SystemState.updateOne({ _id: 'advisor' }, { $set: { 'data.lastRun': report } }, { upsert: true });
    console.log(`[Advisor] ${report.predicted} shows forecast, ${report.recommendations} recommendations (${recs.created} new, ${recs.expired} expired) in ${report.durationMs} ms (${report.modelVersion})`);
    return report;
};
