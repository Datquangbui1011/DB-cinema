import cron from 'node-cron';
import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;

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
 * Pick the top 3 movies from TMDB now_playing + upcoming that are
 * recent (released ≤7 days ago) or upcoming (≤14 days from now).
 * Falls back to top-rated movies not yet in the DB if fewer than 3 qualify.
 */
const fetchTop3Movies = async () => {
    const [nowPlaying, upcoming] = await Promise.all([
        tmdbGet('/movie/now_playing?language=en-US&page=1'),
        tmdbGet('/movie/upcoming?language=en-US&page=1'),
    ]);

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAhead = new Date(today);
    fourteenDaysAhead.setDate(today.getDate() + 14);

    // Merge & deduplicate by ID
    const allMap = new Map();
    [...(nowPlaying.results || []), ...(upcoming.results || [])].forEach(m => {
        if (!allMap.has(m.id)) allMap.set(m.id, m);
    });

    const allMovies = Array.from(allMap.values());

    // Filter to recent/upcoming window
    const filtered = allMovies.filter(m => {
        const rel = new Date(m.release_date);
        return rel >= sevenDaysAgo && rel <= fourteenDaysAhead;
    });

    // Sort by popularity descending
    filtered.sort((a, b) => b.popularity - a.popularity);

    let candidates = filtered.slice(0, 3);

    // If fewer than 3, fill from the full pool (by popularity, skip those already selected)
    if (candidates.length < 3) {
        const selectedIds = new Set(candidates.map(m => m.id));
        const remaining = allMovies
            .filter(m => !selectedIds.has(m.id))
            .sort((a, b) => b.popularity - a.popularity);
        for (const m of remaining) {
            if (candidates.length >= 3) break;
            candidates.push(m);
        }
    }

    return candidates.slice(0, 3);
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
 * Build 3 Show documents for a movie for tomorrow's date.
 */
const buildTimeslots = (movieId) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    const slots = [
        { time: '10:00', theaterType: 'Standard', price: 12.00 },
        { time: '14:00', theaterType: 'Standard', price: 12.00 },
        { time: '19:30', theaterType: 'IMAX',     price: 15.00 },
    ];

    return slots.map(slot => ({
        movie: movieId,
        showDateTime: new Date(`${dateStr}T${slot.time}:00`),
        showPrice: slot.price,
        theaterType: slot.theaterType,
        occupiedSeats: {},
    }));
};

/**
 * Main scheduler function — can be called programmatically.
 * Returns a report object: { added, skipped, errors, nextRun }.
 */
export const runMovieScheduler = async () => {
    const report = { added: [], skipped: [], errors: [], nextRun: null };

    try {
        console.log('[MovieScheduler] Fetching top 3 movies from TMDB…');
        const candidates = await fetchTop3Movies();

        if (candidates.length === 0) {
            report.errors.push('No movies returned from TMDB.');
            return report;
        }

        console.log(`[MovieScheduler] Candidates: ${candidates.map(m => m.title).join(', ')}`);

        for (const raw of candidates) {
            try {
                const movieId = String(raw.id);

                // Duplicate check — movie exists AND has future shows
                const existingMovie = await Movie.findById(movieId);
                if (existingMovie) {
                    const futureShows = await Show.countDocuments({
                        movie: movieId,
                        showDateTime: { $gte: new Date() },
                    });
                    if (futureShows > 0) {
                        console.log(`[MovieScheduler] Skipping "${raw.title}" — already scheduled with ${futureShows} future shows.`);
                        report.skipped.push(raw.title);
                        continue;
                    }
                }

                // Enrich with full details
                const movieData = await enrichMovie(raw.id);

                // Upsert Movie document
                await Movie.findByIdAndUpdate(movieId, movieData, { upsert: true, new: true });
                console.log(`[MovieScheduler] Upserted movie: "${movieData.title}"`);

                // Create 3 timeslot shows
                const shows = buildTimeslots(movieId);
                await Show.insertMany(shows);
                console.log(`[MovieScheduler] Created ${shows.length} shows for "${movieData.title}"`);

                report.added.push(movieData.title);
            } catch (movieErr) {
                console.error(`[MovieScheduler] Error processing "${raw.title}":`, movieErr.message);
                report.errors.push(`${raw.title}: ${movieErr.message}`);
            }
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
    console.log(`  ✅ Movies added:   ${report.added.length ? report.added.join(', ') : 'none'}`);
    console.log(`  ⏭️  Movies skipped: ${report.skipped.length ? report.skipped.join(', ') : 'none'}`);
    console.log(`  ❌ Errors:         ${report.errors.length ? report.errors.join('; ') : 'none'}`);
    console.log(`  🕐 Next run:       ${report.nextRun}`);

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
