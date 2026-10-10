import cron from 'node-cron';
import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';
import { toCinemaDate, zonedTimeToUtc } from '../configs/cinemaTime.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;
const MOVIES_PER_RUN = 20;
const DAYS_AHEAD = 3;
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

    const pool = Array.from(allMap.values())
        .filter(m => m.release_date && new Date(m.release_date) <= latestRelease)
        .sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
    const latest = pool.slice(0, MOVIES_PER_RUN);

    if (!latest.some(m => isFamilyFriendly(m.genre_ids, m.adult))) {
        const family = pool.find(m => isFamilyFriendly(m.genre_ids, m.adult)) || await fetchNewestFamilyMovie();
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

// Rotated across movies so every room type gets showtimes; Kids & Family is reserved for family films
const AFTERNOON_ROOMS = ['ScreenX', '4DX', 'Dolby Cinema'];
const EVENING_ROOMS = ['IMAX', 'Dolby Cinema', 'VIP Recliner', '4DX', 'Premium', 'ScreenX'];

// TMDB genre IDs
const FAMILY = 10751;
const ANIMATION = 16;
const ACTION = 28;
const MATURE_GENRES = [27, 53, 80, 10752]; // Horror, Thriller, Crime, War
const FAMILY_GENRES = [ANIMATION, FAMILY];

/**
 * Kids & Family rooms only show films tagged Family, or animated films that
 * aren't action, and never horror, thrillers, crime or war films.
 */
export const isFamilyFriendly = (genreIds = [], adult = false) =>
    !adult &&
    (genreIds.includes(FAMILY) || (genreIds.includes(ANIMATION) && !genreIds.includes(ACTION))) &&
    !genreIds.some(id => MATURE_GENRES.includes(id));

/**
 * Pick the afternoon and evening rooms for one movie on one day,
 * never using the same room twice in a day. Family films always get the
 * Kids & Family room in the afternoon.
 */
export const pickRooms = (rotation, familyFriendly) => {
    const afternoon = familyFriendly ? 'Kids & Family' : AFTERNOON_ROOMS[rotation % AFTERNOON_ROOMS.length];
    let evening = EVENING_ROOMS[rotation % EVENING_ROOMS.length];
    if (evening === afternoon) evening = EVENING_ROOMS[(rotation + 1) % EVENING_ROOMS.length];
    return { afternoon, evening };
};

/**
 * Build Show documents for a movie for each of the next DAYS_AHEAD days
 * (starting tomorrow, in cinema-local time). Afternoon and evening rooms
 * rotate by both `movieIndex` and calendar day, so each movie's rooms change
 * day to day and a given date always gets the same rooms.
 */
const buildTimeslots = (movieId, movieIndex, familyFriendly) => {
    const shows = [];
    for (let day = 1; day <= DAYS_AHEAD; day++) {
        const date = new Date();
        date.setDate(date.getDate() + day);
        const dateStr = toCinemaDate(date);
        const rotation = movieIndex + Math.floor(Date.parse(dateStr) / 86_400_000);
        const { afternoon, evening } = pickRooms(rotation, familyFriendly);

        const slots = [
            { time: '10:00', theaterType: 'Standard', price: 12.00 },
            { time: '14:00', theaterType: afternoon, price: 12.00 },
            { time: '19:30', theaterType: evening, price: 12.00 },
        ];

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
                const shows = buildTimeslots(movieId, movieIndex, isFamilyFriendly(raw.genre_ids, raw.adult));
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
