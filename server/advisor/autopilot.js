/**
 * Autopilot: after the nightly forecast, apply the low-risk recommendations an
 * admin has switched on, without a click.
 *
 *   - promotions: the best option at or under maxAutoDiscountPercent, only if it
 *     is expected to add revenue
 *   - cancellations: shows with no tickets sold (the rule already requires it)
 *
 * At most maxAutoActionsPerDay per cinema day. Everything is recorded as
 * appliedBy "autopilot" and can be undone like any other change.
 */
import Recommendation from '../models/Recommendation.js';
import SystemState from '../models/SystemState.js';
import { getAdvisorSettings } from '../models/AdvisorSettings.js';
import { startOfCinemaDay } from '../configs/cinemaTime.js';
import { applyRecommendation } from './apply.js';
import { runAdvisor } from './runAdvisor.js';
import { withLock } from './lock.js';

export const AUTOPILOT_USER = 'autopilot';
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// Which option autopilot would pick, or null if it may not act on this one
export const autopilotOption = (rec, settings) => {
    if (rec.type === 'promotion') {
        const allowed = rec.options
            .filter(o => Number(o.params?.percent) <= settings.maxAutoDiscountPercent && o.impact.revenue > 0)
            .sort((a, b) => b.impact.revenue - a.impact.revenue);
        return allowed[0] || null;
    }
    if (rec.type === 'cancel') return rec.options.find(o => o.id === 'cancel' && o.impact.revenue > 0) || null;
    return null;
};

// Locked so a manual run and the nightly run can't both use the daily allowance
export const runAutopilot = (opts = {}) => withLock('autopilot-run', () => runAutopilotUnlocked(opts));

const runAutopilotUnlocked = async ({ trigger = 'cron' } = {}) => {
    const settings = await getAdvisorSettings();
    const types = Object.entries(settings.autopilot || {}).filter(([, on]) => on).map(([type]) => type);
    const now = new Date();
    const report = { trigger, ranAt: now, enabled: types, applied: [], skipped: 0, failed: [] };

    if (types.length && settings.maxAutoActionsPerDay > 0) {
        const actedToday = await Recommendation.find({ appliedBy: AUTOPILOT_USER, appliedAt: { $gte: startOfCinemaDay(now) } }).select('show').lean();
        const doneToday = actedToday.length;
        const touched = new Set(actedToday.map(r => r.show));   // one automatic change per show per day
        let remaining = settings.maxAutoActionsPerDay - doneToday;
        report.alreadyToday = doneToday;
        report.limit = settings.maxAutoActionsPerDay;
        report.limitReached = remaining <= 0;   // undone changes still count

        const pending = await Recommendation.find({ status: 'pending', type: { $in: types }, showDateTime: { $gt: now } }).lean();
        pending.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.bestImpact - a.bestImpact);

        for (const rec of pending) {
            if (remaining <= 0) break;
            const option = autopilotOption(rec, settings);
            if (!option || touched.has(rec.show)) { report.skipped += 1; continue; }
            const outcome = await applyRecommendation(rec._id, option.id, AUTOPILOT_USER, { refresh: false });
            if (outcome.success) {
                remaining -= 1;
                touched.add(rec.show);
                report.applied.push({ recommendation: String(rec._id), type: rec.type, title: rec.title, option: option.label, impact: option.impact.revenue });
            } else {
                report.failed.push({ recommendation: String(rec._id), message: outcome.message });
            }
        }
        if (report.applied.length || report.failed.length) await runAdvisor({ trigger: 'autopilot' });
    }

    await SystemState.updateOne({ _id: 'advisor' }, { $set: { 'data.lastAutopilot': report } }, { upsert: true });
    console.log(`[Autopilot] ${types.length ? `${report.applied.length} applied, ${report.failed.length} failed` : 'off'}`);
    return report;
};
