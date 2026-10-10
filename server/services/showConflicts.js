import Show from '../models/Show.js';
import { CLEANING_MINUTES } from '../configs/screens.js';

const MINUTE = 60_000;
const DEFAULT_RUNTIME = 120;
const LONGEST_SHOW_MS = 6 * 60 * MINUTE;

/**
 * Find shows on `screenId` that overlap any of `starts` (Dates) for a movie of
 * `runtime` minutes. A show blocks its screen for its runtime plus cleaning.
 * `excludeShowId` skips the show being edited.
 */
export const findScreenConflicts = async (screenId, starts, runtime, { excludeShowId } = {}) => {
    const blockMs = (runtime + CLEANING_MINUTES) * MINUTE;
    const earliest = new Date(Math.min(...starts) - LONGEST_SHOW_MS);
    const latest = new Date(Math.max(...starts) + blockMs);
    const query = { screen: screenId, showDateTime: { $gte: earliest, $lt: latest } };
    if (excludeShowId) query._id = { $ne: excludeShowId };
    const existing = await Show.find(query).populate('movie', 'title runtime').lean();

    const conflicts = [];
    starts.forEach((start, i) => {
        const end = start.getTime() + blockMs;
        for (const show of existing) {
            const otherStart = show.showDateTime.getTime();
            const otherEnd = otherStart + ((show.movie?.runtime || DEFAULT_RUNTIME) + CLEANING_MINUTES) * MINUTE;
            if (start.getTime() < otherEnd && otherStart < end) conflicts.push({ start, show });
        }
        // New shows must not overlap each other either
        starts.slice(i + 1).forEach(other => {
            if (Math.abs(other - start) < blockMs) conflicts.push({ start, show: { showDateTime: other, movie: { title: 'another new showing' } } });
        });
    });
    return conflicts;
};

// Human-readable message for the first conflict
export const conflictMessage = (screenName, conflicts) => {
    const fmt = d => new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const { start, show } = conflicts[0];
    return `${screenName} is busy at ${fmt(start)}: it overlaps ${show.movie?.title || 'another show'} at ${fmt(show.showDateTime)}`;
};
