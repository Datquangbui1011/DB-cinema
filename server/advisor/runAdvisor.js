/**
 * The AI Advisor's batch job. Today it:
 *   1. forecasts every upcoming show (next DAYS_AHEAD days) and stores a Prediction,
 *   2. records the actual seats sold for predictions whose show has started,
 *   3. drops predictions for upcoming shows that no longer exist (cancelled).
 * Recommendations are added on top of this in a later step.
 *
 * Runs from POST /api/admin/advisor/refresh and (later) the nightly cron.
 */
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Booking from '../models/Booking.js';
import Prediction from '../models/Prediction.js';
import SystemState from '../models/SystemState.js';
import { createHistory } from '../ml/features.js';
import { forecastShow, loadModel } from '../ml/predictor.js';
import { theaterPremiums } from '../configs/theaterTypes.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DAYS_AHEAD = 14;          // matches the scheduler
const HISTORY_DAYS = 35;        // covers the 28-day slot and 7-day movie history

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

export const predictUpcomingShows = async (now = new Date()) => {
    const model = loadModel();
    const [upcoming, past] = await Promise.all([
        Show.find({ showDateTime: { $gt: now, $lte: new Date(now.getTime() + DAYS_AHEAD * DAY_MS) } })
            .select('-occupiedSeats').lean(),
        Show.find({ showDateTime: { $lte: now, $gt: new Date(now.getTime() - HISTORY_DAYS * DAY_MS) } })
            .select('movie theaterType showDateTime').lean(),
    ]);
    const movieIds = [...new Set(upcoming.map(s => String(s.movie)))];
    const [movies, sales] = await Promise.all([
        Movie.find({ _id: { $in: movieIds } }).select('release_date runtime vote_average genres').lean(),
        salesFor([...upcoming, ...past].map(s => String(s._id))),
    ]);
    const movieById = new Map(movies.map(m => [String(m._id), m]));
    const history = createHistory(past.map(s => ({ ...s, seatsSold: sales.get(String(s._id))?.seats || 0 })));

    const ops = [];
    let skipped = 0;
    for (const show of upcoming) {
        const movie = movieById.get(String(show.movie));
        if (!movie) { skipped += 1; continue; }
        const id = String(show._id);
        const sold = sales.get(id) || { seats: 0, revenue: 0 };
        const f = forecastShow({ show, movie, seatsSoldNow: sold.seats, at: now, history });
        const ticketPrice = show.showPrice + (theaterPremiums[show.theaterType] ?? 0);
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
    if (ops.length) await Prediction.bulkWrite(ops, { ordered: false });

    // Upcoming shows that were cancelled or moved out of range lose their forecast
    const { deletedCount: removed } = await Prediction.deleteMany({
        showDateTime: { $gt: now },
        show: { $nin: upcoming.map(s => String(s._id)) },
    });

    return { predicted: ops.length, skipped, removed, modelVersion: model.version };
};

// Freeze predictions whose show has started by recording what really sold
export const recordActuals = async (now = new Date()) => {
    const pending = await Prediction.find({ actualSeats: null, showDateTime: { $lte: now } }).select('show').lean();
    if (pending.length === 0) return { recorded: 0 };
    const sales = await salesFor(pending.map(p => p.show));
    await Prediction.bulkWrite(pending.map(p => ({
        updateOne: { filter: { _id: p._id }, update: { $set: { actualSeats: sales.get(p.show)?.seats || 0 } } },
    })), { ordered: false });
    return { recorded: pending.length };
};

export const runAdvisor = async ({ trigger = 'manual' } = {}) => {
    const started = Date.now();
    const now = new Date();
    const actuals = await recordActuals(now);
    const predictions = await predictUpcomingShows(now);
    const report = { trigger, ranAt: now, durationMs: Date.now() - started, ...predictions, actualsRecorded: actuals.recorded };
    await SystemState.updateOne({ _id: 'advisor' }, { $set: { data: { lastRun: report } } }, { upsert: true });
    console.log(`[Advisor] ${report.predicted} shows forecast, ${report.actualsRecorded} actuals recorded, ${report.removed} removed in ${report.durationMs} ms (${report.modelVersion})`);
    return report;
};
