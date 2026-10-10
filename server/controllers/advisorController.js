import mongoose from "mongoose";
import Prediction from '../models/Prediction.js';
import Recommendation from '../models/Recommendation.js';
import Movie from '../models/Movie.js';
import Screen from '../models/Screen.js';
import SystemState from '../models/SystemState.js';
import { runAdvisor } from '../advisor/runAdvisor.js';
import { applyRecommendation } from '../advisor/apply.js';
import { endPromotion } from '../advisor/promotions.js';
import { undoRecommendation } from '../advisor/undo.js';
import { runAutopilot } from '../advisor/autopilot.js';
import AdvisorSettings, { getAdvisorSettings } from '../models/AdvisorSettings.js';
import { modelInfo } from '../ml/predictor.js';
import { ADVISOR } from '../advisor/advisorConfig.js';

const DAY_MS = 86_400_000;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const round = (n) => Math.round(n * 100) / 100;

// GET /api/admin/advisor — forecasts, pending advice and a summary for the AI Advisor page
export const getAdvisor = async (req, res) => {
    try {
        const now = new Date();
        const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
        const [predictions, pending, recent, state, screens, settings] = await Promise.all([
            Prediction.find({ showDateTime: { $gt: now } }).sort({ showDateTime: 1 }).lean(),
            Recommendation.find({ status: 'pending', showDateTime: { $gt: now } }).lean(),
            Recommendation.find({ status: { $in: ['applied', 'undone'] } }).sort({ appliedAt: -1 }).limit(10).lean(),
            SystemState.findById('advisor').lean(),
            Screen.find().select('name').lean(),
            getAdvisorSettings(),
        ]);
        const movieIds = [...new Set([...predictions, ...pending, ...recent].map(d => d.movie))];
        const movies = await Movie.find({ _id: { $in: movieIds } }).select('title poster_path').lean();
        const movieById = new Map(movies.map(m => [String(m._id), m]));
        const screenName = new Map(screens.map(s => [s._id, s.name]));
        const movieOf = (id) => ({ id, title: movieById.get(String(id))?.title || 'Unknown movie', poster_path: movieById.get(String(id))?.poster_path || null });

        const next7 = predictions.filter(p => p.showDateTime <= weekAhead);
        pending.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.bestImpact - a.bestImpact);
        const recommendationShape = (r) => ({
            id: r._id, show: r.show, type: r.type, priority: r.priority, title: r.title, reason: r.reason,
            assumptions: r.assumptions, options: r.options, bestImpact: r.bestImpact, status: r.status,
            chosenOption: r.chosenOption, appliedBy: r.appliedBy, appliedAt: r.appliedAt, result: r.result,
            forecast: r.forecast, showDateTime: r.showDateTime, movie: movieOf(r.movie), createdAt: r.createdAt, updatedAt: r.updatedAt,
        });

        res.json({
            success: true,
            lastRun: state?.data?.lastRun || null,
            lastAutopilot: state?.data?.lastAutopilot || null,
            settings: { autopilot: settings.autopilot, maxAutoActionsPerDay: settings.maxAutoActionsPerDay, maxAutoDiscountPercent: settings.maxAutoDiscountPercent, updatedAt: settings.updatedAt || null },
            model: modelInfo(),
            thresholds: {
                sellOut: ADVISOR.sellOutThreshold, upgrade: ADVISOR.upgradeThreshold,
                promotion: ADVISOR.promoThreshold, cancel: ADVISOR.cancelThreshold,
            },
            summary: {
                upcomingShows: predictions.length,
                forecastRevenue7d: round(next7.reduce((n, p) => n + p.predictedRevenue, 0)),
                forecastTickets7d: Math.round(next7.reduce((n, p) => n + p.predictedSeats, 0)),
                averageOccupancy7d: next7.length ? round(next7.reduce((n, p) => n + p.predictedOccupancy, 0) / next7.length) : 0,
                likelySellOuts: predictions.filter(p => p.predictedOccupancy >= ADVISOR.sellOutThreshold).length,
                atRisk: predictions.filter(p => p.predictedOccupancy < ADVISOR.promoThreshold).length,
                pendingRecommendations: pending.length,
                potentialUplift: round(pending.reduce((n, r) => n + Math.max(0, r.bestImpact), 0)),
            },
            recommendations: pending.map(recommendationShape),
            recentlyApplied: recent.map(recommendationShape),
            forecasts: predictions.map(p => ({
                show: p.show,
                movie: movieOf(p.movie),
                screen: p.screen, screenName: screenName.get(p.screen) || null,
                theaterType: p.theaterType,
                showDateTime: p.showDateTime,
                sold: p.seatsSoldAtPrediction,
                predictedSeats: p.predictedSeats, low: p.low, high: p.high,
                occupancy: p.predictedOccupancy,
                capacity: p.capacity,
                ticketPrice: p.ticketPrice,
                predictedRevenue: p.predictedRevenue,
            })),
        });
    } catch (error) {
        console.error('[Advisor]', error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/admin/advisor/refresh — re-forecast every upcoming show and refresh the advice
export const refreshAdvisor = async (req, res) => {
    try {
        const report = await runAdvisor({ trigger: 'manual' });
        res.json({
            success: true,
            message: `Forecast updated for ${report.predicted} upcoming show${report.predicted === 1 ? '' : 's'}, ${report.recommendations} recommendation${report.recommendations === 1 ? '' : 's'}`,
            report,
        });
    } catch (error) {
        console.error('[Advisor] Refresh failed:', error);
        res.json({ success: false, message: error.message });
    }
};

// PATCH /api/admin/recommendations/:id — body { status: 'dismissed' }
export const updateRecommendation = async (req, res) => {
    try {
        if (req.body.status !== 'dismissed') return res.json({ success: false, message: 'Only dismissing is supported' });
        if (!mongoose.isValidObjectId(req.params.id)) return res.json({ success: false, message: 'Recommendation not found' });
        const rec = await Recommendation.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            { $set: { status: 'dismissed', closedAt: new Date(), closedBy: req.auth().userId } },
            { new: true },
        ).lean();
        if (!rec) return res.json({ success: false, message: 'This recommendation is no longer pending' });
        res.json({ success: true, message: 'Recommendation dismissed' });
    } catch (error) {
        console.error('[Advisor] Dismiss failed:', error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/admin/recommendations/:id/apply — body { optionId }
export const applyRecommendationOption = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.json({ success: false, message: 'Recommendation not found' });
        if (!req.body.optionId) return res.json({ success: false, message: 'Choose an option to apply' });
        const outcome = await applyRecommendation(req.params.id, String(req.body.optionId), req.auth().userId);
        res.json({ success: outcome.success, message: outcome.message, expired: outcome.expired || false });
    } catch (error) {
        console.error('[Advisor] Apply failed:', error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/admin/shows/:id/end-promotion — restore the original price now
export const endShowPromotion = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.json({ success: false, message: 'Show not found' });
        const outcome = await endPromotion(req.params.id, { by: req.auth().userId });
        if (outcome.success) await runAdvisor({ trigger: 'end-promotion' });
        res.json(outcome);
    } catch (error) {
        console.error('[Advisor] End promotion failed:', error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/admin/recommendations/:id/undo — reverse an applied recommendation
export const undoRecommendationChange = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.json({ success: false, message: 'Recommendation not found' });
        res.json(await undoRecommendation(req.params.id, req.auth().userId));
    } catch (error) {
        console.error('[Advisor] Undo failed:', error);
        res.json({ success: false, message: error.message });
    }
};

const HORIZONS = [
    { label: 'Under 6h', max: 6 },
    { label: '6-24h', max: 24 },
    { label: '1-3 days', max: 72 },
    { label: '3+ days', max: Infinity },
];
const EARLY_ESTIMATE_SHOWS = 30;

/**
 * GET /api/admin/advisor/accuracy?days=30 — how the model's last forecast before
 * each show compared with what actually sold.
 */
export const getAdvisorAccuracy = async (req, res) => {
    try {
        const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
        const since = new Date(Date.now() - days * DAY_MS);
        const rows = await Prediction.find({ actualSeats: { $ne: null }, showDateTime: { $gte: since } })
            .sort({ showDateTime: -1 }).lean();
        const n = rows.length;
        const avg = (list, f) => (list.length ? list.reduce((s, r) => s + f(r), 0) / list.length : null);
        const err = (r) => Math.abs(r.predictedSeats - r.actualSeats);
        const summarize = (list) => ({
            shows: list.length,
            mae: avg(list, err) === null ? null : round(avg(list, err)),
            noMoreSalesMae: avg(list, r => Math.abs(r.seatsSoldAtPrediction - r.actualSeats)) === null ? null : round(avg(list, r => Math.abs(r.seatsSoldAtPrediction - r.actualSeats))),
        });

        const movieIds = [...new Set(rows.slice(0, 300).map(r => r.movie))];
        const movies = await Movie.find({ _id: { $in: movieIds } }).select('title').lean();
        const title = new Map(movies.map(m => [String(m._id), m.title]));

        let lower = 0;
        const byHorizon = HORIZONS.map(h => {
            const list = rows.filter(r => r.hoursUntilAtPrediction >= lower && r.hoursUntilAtPrediction < h.max);
            lower = h.max;
            return { label: h.label, ...summarize(list) };
        });
        const byDay = new Map();
        rows.forEach(r => {
            const d = r.showDateTime.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
            if (!byDay.has(d)) byDay.set(d, []);
            byDay.get(d).push(r);
        });

        res.json({
            success: true,
            days,
            earlyEstimate: n < EARLY_ESTIMATE_SHOWS,
            minimumShows: EARLY_ESTIMATE_SHOWS,
            overall: {
                ...summarize(rows),
                bias: n ? round(avg(rows, r => r.predictedSeats - r.actualSeats)) : null,
                withinRange: n ? round(avg(rows, r => (r.actualSeats >= Math.round(r.low) && r.actualSeats <= Math.round(r.high) ? 1 : 0))) : null,
                averageHoursAhead: n ? round(avg(rows, r => r.hoursUntilAtPrediction)) : null,
            },
            byHorizon,
            daily: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, list]) => ({ date, ...summarize(list) })),
            points: rows.slice(0, 300).map(r => ({
                show: r.show, title: title.get(r.movie) || 'Unknown movie', showDateTime: r.showDateTime,
                predicted: r.predictedSeats, low: r.low, high: r.high, actual: r.actualSeats, hoursAhead: r.hoursUntilAtPrediction,
            })),
        });
    } catch (error) {
        console.error('[Advisor] Accuracy failed:', error);
        res.json({ success: false, message: error.message });
    }
};

// PATCH /api/admin/advisor/settings — body { autopilot: { promotion, cancel }, maxAutoActionsPerDay, maxAutoDiscountPercent }
export const updateAdvisorSettings = async (req, res) => {
    try {
        const { autopilot = {}, maxAutoActionsPerDay, maxAutoDiscountPercent } = req.body;
        const update = { updatedBy: req.auth().userId };
        for (const type of ['promotion', 'cancel']) {
            if (autopilot[type] !== undefined) update[`autopilot.${type}`] = Boolean(autopilot[type]);
        }
        if (maxAutoActionsPerDay !== undefined) {
            const n = Number(maxAutoActionsPerDay);
            if (!Number.isInteger(n) || n < 0 || n > 20) return res.json({ success: false, message: 'Daily limit must be a whole number from 0 to 20' });
            update.maxAutoActionsPerDay = n;
        }
        if (maxAutoDiscountPercent !== undefined) {
            const p = Number(maxAutoDiscountPercent);
            if (![10, 20, 30].includes(p)) return res.json({ success: false, message: 'Largest discount must be 10, 20 or 30%' });
            update.maxAutoDiscountPercent = p;
        }
        await AdvisorSettings.updateOne({ _id: 'advisor' }, { $set: update }, { upsert: true, runValidators: true });
        res.json({ success: true, message: 'Autopilot settings saved', settings: await getAdvisorSettings() });
    } catch (error) {
        console.error('[Advisor] Settings failed:', error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/admin/advisor/autopilot/run — run autopilot now with the saved settings
export const runAutopilotNow = async (req, res) => {
    try {
        const report = await runAutopilot({ trigger: 'manual' });
        const n = report.applied.length;
        const message = report.enabled.length === 0
            ? 'Autopilot is off: switch on promotions or cancellations first'
            : report.limitReached
                ? `Daily limit reached: autopilot already made ${report.alreadyToday} change${report.alreadyToday === 1 ? '' : 's'} today (limit ${report.limit})`
                : `Autopilot applied ${n} change${n === 1 ? '' : 's'}${report.failed.length ? `, ${report.failed.length} could not be applied` : ''}`;
        res.json({ success: true, message, report });
    } catch (error) {
        console.error('[Advisor] Autopilot failed:', error);
        res.json({ success: false, message: error.message });
    }
};
