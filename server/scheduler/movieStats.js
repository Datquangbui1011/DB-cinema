/**
 * Daily TMDB popularity snapshots (MovieStats), collected by the scheduler.
 *
 * Not model features yet: there is no history to train on, and the simulated
 * training data doesn't depend on TMDB numbers. Once real bookings and a few
 * weeks of snapshots exist, they can be added as features with statsAsOf(),
 * which only returns what was known before the forecast day.
 */
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import MovieStats from '../models/MovieStats.js';
import { toCinemaDate } from '../configs/cinemaTime.js';

const DETAILS_BATCH = 5;

const toStats = (m, source) => ({
    popularity: m.popularity ?? null,
    voteAverage: m.vote_average ?? null,
    voteCount: m.vote_count ?? null,
    source,
});

/**
 * Save today's numbers for every catalog film that is showing or about to.
 * Films in the TMDB lists the scheduler already fetched cost nothing extra;
 * other films with upcoming shows are looked up individually.
 * @param {object} lists     { now_playing: [...results], upcoming: [...results] } from TMDB
 * @param {Function} tmdbGet the scheduler's TMDB helper (with retries)
 */
export const snapshotMovieStats = async (lists, tmdbGet, now = new Date()) => {
    const date = toCinemaDate(now);
    const fromLists = new Map();
    for (const [source, results] of Object.entries(lists)) {
        for (const m of results || []) if (!fromLists.has(String(m.id))) fromLists.set(String(m.id), toStats(m, source));
    }

    // Films we show: in the catalog with upcoming shows, plus anything in the lists we already have
    const scheduled = await Show.distinct('movie', { showDateTime: { $gt: now } });
    const catalog = new Set((await Movie.find({ _id: { $in: [...new Set([...scheduled, ...fromLists.keys()])] } }).select('_id').lean()).map(m => String(m._id)));
    const wanted = [...catalog];

    const stats = new Map(wanted.filter(id => fromLists.has(id)).map(id => [id, fromLists.get(id)]));
    const missing = wanted.filter(id => !stats.has(id));
    const failed = [];
    for (let i = 0; i < missing.length; i += DETAILS_BATCH) {
        await Promise.all(missing.slice(i, i + DETAILS_BATCH).map(async id => {
            try {
                stats.set(id, toStats(await tmdbGet(`/movie/${id}`), 'details'));
            } catch {
                failed.push(id);
            }
        }));
    }

    if (stats.size) {
        await MovieStats.bulkWrite([...stats].map(([movie, s]) => ({
            updateOne: { filter: { movie, date }, update: { $set: { ...s, capturedAt: now } }, upsert: true },
        })), { ordered: false });
    }
    return { date, saved: stats.size, fromLists: wanted.length - missing.length, lookedUp: missing.length - failed.length, failed: failed.length };
};

/**
 * Time-correct lookup for training/forecasting: the latest snapshot taken on a
 * day before `at`'s cinema-local date (snapshots from that same day might have
 * been captured after the forecast moment).
 * @param {Array} snapshots  MovieStats docs (any order)
 */
export const createStatsIndex = (snapshots) => {
    const byMovie = new Map();
    for (const s of snapshots) {
        if (!byMovie.has(s.movie)) byMovie.set(s.movie, []);
        byMovie.get(s.movie).push(s);
    }
    for (const list of byMovie.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return {
        statsAsOf(movieId, at) {
            const day = toCinemaDate(at);
            const list = byMovie.get(String(movieId)) || [];
            let found = null;
            for (const s of list) { if (s.date < day) found = s; else break; }
            return found;
        },
    };
};
