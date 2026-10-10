import cron from 'node-cron';
import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import SystemState from '../models/SystemState.js';
import { toCinemaDate, zonedTimeToUtc } from '../configs/cinemaTime.js';
import { ensureScreens } from '../configs/screens.js';
import { planDay, toPlannerMovies, isFamilyFriendly, FAMILY_GENRES, MATURE_GENRES } from './screenPlanner.js';
import { snapshotMovieStats } from './movieStats.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;
const MOVIES_PER_RUN = 20;
const DAYS_AHEAD = 14;
const MAX_DAYS_UNTIL_RELEASE = 14;
const FAMILY_LOOKBACK_DAYS = 60;
const ENRICH_BATCH_SIZE = 5;

/**
 * Helper: make a TMDB GET request with retry logic.
 */
const tmdbGet = async (path) => {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { data } = await axios.get(`${TMDB_BASE_URL}${path}`, {
                headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
            });
            return data;
        } catch (err) {
            lastError = err;
            console.error(`[MovieScheduler] TMDB request failed (attempt ${attempt}/${MAX_RETRIES}): ${path}`);
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
        }
    }
    throw lastError;
};

/**
 * Newest family film released in the last FAMILY_LOOKBACK_DAYS days (or up to
 * MAX_DAYS_UNTIL_RELEASE days ahead), chosen from TMDB's 10 most popular matches.
 */
const fetchNewestFamilyMovie = async () => {
    const from = new Date();
    from.setDate(from.getDate() - FAMILY_LOOKBACK_DAYS);
    const to = new Date();
    to.setDate(to.getDate() + MAX_DAYS_UNTIL_RELEASE);
    const day = d => d.toISOString().split('T')[0];

    const data = await tmdbGet(
        `/discover/movie?language=en-US&include_adult=false&sort_by=popularity.desc` +
        `&with_genres=${FAMILY_GENRES.join('|')}&without_genres=${MATURE_GENRES.join('|')}` +
        `&primary_release_date.gte=${day(from)}&primary_release_date.lte=${day(to)}`
    );
    return (data.results || [])
        .slice(0, 10)
        .filter(m => m.release_date && isFamilyFriendly(m.genre_ids, m.adult))
        .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))[0] || null;
};

/**
 * Pick the latest MOVIES_PER_RUN movies from TMDB now_playing + upcoming,
 * newest release first, skipping anything releasing more than
 * MAX_DAYS_UNTIL_RELEASE days from now. Always includes at least one family
 * film so the Kids & Family room has showtimes.
 */
export const fetchLatestMovies = async ({ onLists } = {}) => {
    const pages = await Promise.all([
        tmdbGet('/movie/now_playing?language=en-US&page=1'),
        tmdbGet('/movie/now_playing?language=en-US&page=2'),
        tmdbGet('/movie/upcoming?language=en-US&page=1'),
        tmdbGet('/movie/upcoming?language=en-US&page=2'),
    ]);

    const latestRelease = new Date();
    latestRelease.setDate(latestRelease.getDate() + MAX_DAYS_UNTIL_RELEASE);

    // Hand the raw lists to the popularity snapshot (they already carry popularity and vote counts)
    onLists?.({ now_playing: [...(pages[0].results || []), ...(pages[1].results || [])], upcoming: [...(pages[2].results || []), ...(pages[3].results || [])] });

    // Merge & deduplicate by ID
    const allMap = new Map();
    pages.flatMap(p => p.results || []).forEach(m => {
        if (!allMap.has(m.id)) allMap.set(m.id, m);
    });

    // Movies an admin paused are never scheduled
    const paused = new Set((await Movie.find({ paused: true }).select('_id').lean()).map(m => String(m._id)));

    const pool = Array.from(allMap.values())
        .filter(m => !paused.has(String(m.id)))
        .filter(m => m.release_date && new Date(m.release_date) <= latestRelease)
        .sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
    const latest = pool.slice(0, MOVIES_PER_RUN);

    if (!latest.some(m => isFamilyFriendly(m.genre_ids, m.adult))) {
        const fromPool = pool.find(m => isFamilyFriendly(m.genre_ids, m.adult));
        const fallback = fromPool ? null : await fetchNewestFamilyMovie();
        const family = fromPool || (fallback && !paused.has(String(fallback.id)) ? fallback : null);
        if (family) {
            // Replace the oldest pick so the run stays at MOVIES_PER_RUN movies
            latest.splice(MOVIES_PER_RUN - 1, latest.length, family);
            console.log(`[MovieScheduler] Added family film: "${family.title}"`);
        }
    }
    return latest;
};

/**
 * Fetch full details, credits, and trailer for a movie.
 */
const enrichMovie = async (tmdbId) => {
    const [details, credits, videos] = await Promise.all([
        tmdbGet(`/movie/${tmdbId}`),
        tmdbGet(`/movie/${tmdbId}/credits`),
        tmdbGet(`/movie/${tmdbId}/videos`),
    ]);

    const trailer = (videos.results || []).find(
        v => v.type === 'Trailer' && v.site === 'YouTube'
    );

    return {
        _id: String(tmdbId),
        title: details.title,
        overview: details.overview,
        poster_path: details.poster_path,
        backdrop_path: details.backdrop_path,
        trailer_path: trailer ? trailer.key : '',
        release_date: details.release_date,
        original_language: details.original_language,
        tagline: details.tagline,
        genres: details.genres || [],
        casts: credits.cast || [],
        vote_average: details.vote_average,
        runtime: details.runtime,
    };
};

/**
 * Make sure every candidate exists in the Movie collection, fetching full
 * details from TMDB for new ones. Returns the Movie documents in candidate order.
 */
export const ensureMovies = async (candidates, report = { added: [], errors: [] }) => {
    const ids = candidates.map(m => String(m.id));
    const existing = new Set((await Movie.find({ _id: { $in: ids } }).select('_id').lean()).map(m => String(m._id)));
    const missing = candidates.filter(m => !existing.has(String(m.id)));

    // Small batches to stay well under TMDB rate limits
    for (let i = 0; i < missing.length; i += ENRICH_BATCH_SIZE) {
        await Promise.all(missing.slice(i, i + ENRICH_BATCH_SIZE).map(async raw => {
            try {
                const movieData = await enrichMovie(raw.id);
                await Movie.findByIdAndUpdate(String(raw.id), movieData, { upsert: true, new: true });
                report.added.push(movieData.title);
                console.log(`[MovieScheduler] Added movie: "${movieData.title}"`);
            } catch (err) {
                console.error(`[MovieScheduler] Error adding "${raw.title}":`, err.message);
                report.errors.push(`${raw.title}: ${err.message}`);
            }
        }));
    }

    const docs = await Movie.find({ _id: { $in: ids } }).select('_id title runtime genres').lean();
    const byId = Object.fromEntries(docs.map(d => [String(d._id), d]));
    return ids.map(id => byId[id]).filter(Boolean);
};

// A day counts as scheduled once any show exists on it
const isDayScheduled = async (dateStr) => {
    const start = zonedTimeToUtc(dateStr);
    const end = new Date(start.getTime() + 86_400_000);
    return Show.exists({ showDateTime: { $gte: start, $lt: end } });
};

/**
 * Plan and save one day across all screens, unless it's already scheduled
 * (`force` skips that check). Returns the number of shows created.
 */
export const scheduleDay = async (dateStr, movieDocs, screens, { force = false } = {}) => {
    if (!force && await isDayScheduled(dateStr)) return 0;
    const shows = planDay(dateStr, screens, toPlannerMovies(movieDocs));
    if (shows.length) await Show.insertMany(shows);
    return shows.length;
};

/**
 * Main scheduler function — can be called programmatically.
 * Picks the latest movies, then fills each of the next DAYS_AHEAD days
 * across every screen. Returns { added, days, errors, nextRun }.
 */
export const runMovieScheduler = async () => {
    const report = { added: [], days: [], errors: [], nextRun: null, movieStats: null };

    try {
        console.log(`[MovieScheduler] Fetching latest ${MOVIES_PER_RUN} movies from TMDB…`);
        let lists = null;
        const candidates = await fetchLatestMovies({ onLists: l => { lists = l; } });

        if (candidates.length === 0) {
            report.errors.push('No movies returned from TMDB.');
            return report;
        }

        console.log(`[MovieScheduler] Candidates: ${candidates.map(m => m.title).join(', ')}`);
        const [movieDocs, screens] = await Promise.all([ensureMovies(candidates, report), ensureScreens()]);

        for (let day = 1; day <= DAYS_AHEAD; day++) {
            const date = new Date();
            date.setDate(date.getDate() + day);
            const dateStr = toCinemaDate(date);
            const created = await scheduleDay(dateStr, movieDocs, screens);
            report.days.push({ date: dateStr, shows: created, skipped: created === 0 });
            console.log(`[MovieScheduler] ${dateStr}: ${created ? `created ${created} shows` : 'already scheduled'}`);
        }

        // Today's TMDB popularity for every film we show (for future forecasting features)
        try {
            report.movieStats = await snapshotMovieStats(lists || {}, tmdbGet);
            console.log(`[MovieScheduler] Popularity snapshot: ${report.movieStats.saved} films (${report.movieStats.date})`);
        } catch (err) {
            report.errors.push(`Popularity snapshot: ${err.message}`);
        }
    } catch (err) {
        console.error('[MovieScheduler] Fatal error:', err.message);
        report.errors.push(`Fatal: ${err.message}`);
    }

    // Next run = now + 24 h
    const next = new Date();
    next.setHours(next.getHours() + 24);
    report.nextRun = next.toISOString();

    console.log('\n[MovieScheduler] ─── Report ───');
    console.log(`  ✅ New movies:   ${report.added.length ? report.added.join(', ') : 'none'}`);
    console.log(`  📅 Days:         ${report.days.map(d => `${d.date} (${d.skipped ? 'already scheduled' : `${d.shows} shows`})`).join(', ')}`);
    console.log(`  ❌ Errors:       ${report.errors.length ? report.errors.join('; ') : 'none'}`);
    console.log(`  🕐 Next run:     ${report.nextRun}`);

    // Remembered for the System Status page
    await SystemState.findByIdAndUpdate('scheduler', { data: { lastRunAt: new Date(), report } }, { upsert: true })
        .catch(err => console.error('[MovieScheduler] Could not save run report:', err.message));

    return report;
};

/**
 * Initialize the cron job — runs daily at midnight.
 */
const initMovieScheduler = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('[MovieScheduler] Cron triggered — scheduling movies…');
        await runMovieScheduler();
    });
    console.log('[MovieScheduler] Cron initialized — runs daily at 00:00.');
};

export default initMovieScheduler;
