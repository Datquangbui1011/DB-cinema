import cron from 'node-cron';
import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;
const MOVIES_PER_RUN = 20;
const DAYS_AHEAD = 3;
const MAX_DAYS_UNTIL_RELEASE = 14;
const ENRICH_BATCH_SIZE = 5;
// Showtimes are defined in cinema-local time; Vercel runs in UTC
const CINEMA_TIMEZONE = 'America/Chicago';

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
 * Pick the latest MOVIES_PER_RUN movies from TMDB now_playing + upcoming,
 * newest release first, skipping anything releasing more than
 * MAX_DAYS_UNTIL_RELEASE days from now.
 */
const fetchLatestMovies = async () => {
    const pages = await Promise.all([
        tmdbGet('/movie/now_playing?language=en-US&page=1'),
        tmdbGet('/movie/now_playing?language=en-US&page=2'),
        tmdbGet('/movie/upcoming?language=en-US&page=1'),
        tmdbGet('/movie/upcoming?language=en-US&page=2'),
    ]);

    const latestRelease = new Date();
    latestRelease.setDate(latestRelease.getDate() + MAX_DAYS_UNTIL_RELEASE);

    // Merge & deduplicate by ID
    const allMap = new Map();
    pages.flatMap(p => p.results || []).forEach(m => {
        if (!allMap.has(m.id)) allMap.set(m.id, m);
    });

    return Array.from(allMap.values())
        .filter(m => m.release_date && new Date(m.release_date) <= latestRelease)
        .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
        .slice(0, MOVIES_PER_RUN);
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
 * Convert a wall-clock date + time in CINEMA_TIMEZONE to a UTC Date.
 */
const zonedTimeToUtc = (dateStr, time) => {
    const asUtc = new Date(`${dateStr}T${time}:00Z`);
    const inZone = new Date(asUtc.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE }));
    const inUtc = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(asUtc.getTime() + (inUtc - inZone));
};

// Rotated across movies so every room type gets showtimes; family rooms stay in daytime
const AFTERNOON_ROOMS = ['Kids & Family', 'ScreenX', '4DX', 'Dolby Cinema'];
const EVENING_ROOMS = ['IMAX', 'Dolby Cinema', 'VIP Recliner', '4DX', 'Premium', 'ScreenX'];

/**
 * Build Show documents for a movie for each of the next DAYS_AHEAD days
 * (starting tomorrow, in cinema-local time). `movieIndex` picks which
 * room types this movie's afternoon and evening slots use.
 */
const buildTimeslots = (movieId, movieIndex) => {
    const slots = [
        { time: '10:00', theaterType: 'Standard', price: 12.00 },
        { time: '14:00', theaterType: AFTERNOON_ROOMS[movieIndex % AFTERNOON_ROOMS.length], price: 12.00 },
        { time: '19:30', theaterType: EVENING_ROOMS[movieIndex % EVENING_ROOMS.length], price: 12.00 },
    ];

    const shows = [];
    for (let day = 1; day <= DAYS_AHEAD; day++) {
        const date = new Date();
        date.setDate(date.getDate() + day);
        const dateStr = date.toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE }); // YYYY-MM-DD

        for (const slot of slots) {
            shows.push({
                movie: movieId,
                showDateTime: zonedTimeToUtc(dateStr, slot.time),
                showPrice: slot.price,
                theaterType: slot.theaterType,
                occupiedSeats: {},
            });
        }
    }
    return shows;
};

/**
 * Main scheduler function — can be called programmatically.
 * Returns a report object: { added, skipped, errors, nextRun }.
 */
export const runMovieScheduler = async () => {
    const report = { added: [], skipped: [], errors: [], nextRun: null };

    try {
        console.log(`[MovieScheduler] Fetching latest ${MOVIES_PER_RUN} movies from TMDB…`);
        const candidates = await fetchLatestMovies();

        if (candidates.length === 0) {
            report.errors.push('No movies returned from TMDB.');
            return report;
        }

        console.log(`[MovieScheduler] Candidates: ${candidates.map(m => m.title).join(', ')}`);

        const processMovie = async (raw, movieIndex) => {
            try {
                const movieId = String(raw.id);

                // Only fetch full details for movies we don't have yet
                if (!(await Movie.exists({ _id: movieId }))) {
                    const movieData = await enrichMovie(raw.id);
                    await Movie.findByIdAndUpdate(movieId, movieData, { upsert: true, new: true });
                    console.log(`[MovieScheduler] Upserted movie: "${movieData.title}"`);
                }

                // Only insert timeslots that don't already exist
                const shows = buildTimeslots(movieId, movieIndex);
                const existing = await Show.find({
                    movie: movieId,
                    showDateTime: { $in: shows.map(s => s.showDateTime) },
                }).select('showDateTime');
                const existingTimes = new Set(existing.map(s => s.showDateTime.getTime()));
                const newShows = shows.filter(s => !existingTimes.has(s.showDateTime.getTime()));

                if (newShows.length === 0) {
                    console.log(`[MovieScheduler] Skipping "${raw.title}" — all timeslots already scheduled.`);
                    report.skipped.push(raw.title);
                    return;
                }

                await Show.insertMany(newShows);
                console.log(`[MovieScheduler] Created ${newShows.length} shows for "${raw.title}"`);
                report.added.push(raw.title);
            } catch (movieErr) {
                console.error(`[MovieScheduler] Error processing "${raw.title}":`, movieErr.message);
                report.errors.push(`${raw.title}: ${movieErr.message}`);
            }
        };

        // Process in small batches to stay well under TMDB rate limits
        for (let i = 0; i < candidates.length; i += ENRICH_BATCH_SIZE) {
            await Promise.all(candidates.slice(i, i + ENRICH_BATCH_SIZE).map((raw, j) => processMovie(raw, i + j)));
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
