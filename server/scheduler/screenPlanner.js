import { zonedTimeToUtc } from '../configs/cinemaTime.js';
import { hoursFor, CLEANING_MINUTES } from '../configs/screens.js';

const BASE_PRICE = 12;
const DEFAULT_RUNTIME = 120;
const START_INTERVAL = 15;          // start times are rounded up to :00/:15/:30/:45
const MAX_SHOWS_PER_MOVIE = 4;
const MAX_SHOWS_PER_FAMILY_MOVIE = 6;
const SAME_MOVIE_GAP = 45;          // minutes between starts of the same movie on different screens

// TMDB genre IDs
const FAMILY = 10751;
const ANIMATION = 16;
const ACTION = 28;
export const MATURE_GENRES = [27, 53, 80, 10752]; // Horror, Thriller, Crime, War
export const FAMILY_GENRES = [ANIMATION, FAMILY];

/**
 * Kids & Family rooms only show films tagged Family, or animated films that
 * aren't action, and never horror, thrillers, crime or war films.
 */
export const isFamilyFriendly = (genreIds = [], adult = false) =>
    !adult &&
    (genreIds.includes(FAMILY) || (genreIds.includes(ANIMATION) && !genreIds.includes(ACTION))) &&
    !genreIds.some(id => MATURE_GENRES.includes(id));

const roundUp = (minutes) => Math.ceil(minutes / START_INTERVAL) * START_INTERVAL;
const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Which movies a room may play
const allowedIn = (theaterType, movie) => {
    if (theaterType === 'Kids & Family') return movie.family;
    if (theaterType === 'VIP Recliner') return !movie.family; // 21+ room
    return true;
};

/**
 * Plan one day of shows across all screens.
 *
 * Screens are filled back to back from opening time (show runtime plus
 * CLEANING_MINUTES), so a screen can never hold two shows at once. Each slot
 * goes to the eligible movie with the fewest showings so far that day,
 * rotating by day and screen so line-ups vary.
 *
 * @param {string} dateStr  cinema-local date, YYYY-MM-DD
 * @param {Array}  screens  [{ _id, theaterType }]
 * @param {Array}  movies   [{ _id, runtime, family }] in priority order
 * @param {Object} [options]
 * @param {number} [options.startAfter]  earliest start, in local minutes after midnight
 * @param {number} [options.lastStart]   later latest start for every screen except Kids & Family
 * @returns {Array} Show documents (without _id)
 */
export const planDay = (dateStr, screens, movies, { startAfter = 0, lastStart } = {}) => {
    if (movies.length === 0) return [];
    const dayNumber = Math.floor(Date.parse(dateStr) / 86_400_000);
    const counts = Object.fromEntries(movies.map(m => [m._id, 0]));
    const startsByMovie = Object.fromEntries(movies.map(m => [m._id, []]));
    const state = screens.map((screen, index) => ({
        screen,
        index,
        nextFree: Math.max(hoursFor(screen.theaterType).open, startAfter),
        // The Kids & Family room stays daytime-only even when late shows are allowed
        lastStart: lastStart !== undefined && screen.theaterType !== 'Kids & Family' ? lastStart : hoursFor(screen.theaterType).lastStart,
        previousMovie: null,
        closed: false,
    }));
    const shows = [];

    const choose = (slot, start) => {
        const eligible = movies.filter(m =>
            allowedIn(slot.screen.theaterType, m) &&
            counts[m._id] < (m.family ? MAX_SHOWS_PER_FAMILY_MOVIE : MAX_SHOWS_PER_MOVIE));
        if (eligible.length === 0) return null;

        // Prefer variety: not the film that just played here, and not starting
        // alongside the same film on another screen. Relax if nothing else fits.
        const spaced = eligible.filter(m => startsByMovie[m._id].every(t => Math.abs(t - start) >= SAME_MOVIE_GAP));
        const fresh = (spaced.length ? spaced : eligible).filter(m => m._id !== slot.previousMovie);
        const pool = fresh.length ? fresh : (spaced.length ? spaced : eligible);

        const rotation = (m) => (movies.indexOf(m) - dayNumber - slot.index * 3 + movies.length * 100) % movies.length;
        return pool.reduce((best, m) =>
            !best || counts[m._id] < counts[best._id] || (counts[m._id] === counts[best._id] && rotation(m) < rotation(best)) ? m : best,
        null);
    };

    for (;;) {
        const open = state.filter(s => !s.closed);
        if (open.length === 0) break;
        // Earliest free screen first; on ties, the Kids & Family room picks first
        // because it can only play family films
        const slot = open.reduce((a, b) =>
            b.nextFree < a.nextFree || (b.nextFree === a.nextFree && b.screen.theaterType === 'Kids & Family') ? b : a);
        const start = roundUp(slot.nextFree);
        if (start > slot.lastStart) { slot.closed = true; continue; }

        const movie = choose(slot, start);
        if (!movie) { slot.closed = true; continue; }

        shows.push({
            movie: movie._id,
            screen: slot.screen._id,
            theaterType: slot.screen.theaterType,
            showDateTime: zonedTimeToUtc(dateStr, hhmm(start)),
            showPrice: BASE_PRICE,
            occupiedSeats: {},
        });
        counts[movie._id] += 1;
        startsByMovie[movie._id].push(start);
        slot.previousMovie = movie._id;
        slot.nextFree = start + (movie.runtime || DEFAULT_RUNTIME) + CLEANING_MINUTES;
    }

    return shows.sort((a, b) => a.showDateTime - b.showDateTime);
};

// Shape Movie documents for planDay
export const toPlannerMovies = (movieDocs) => movieDocs.map(m => ({
    _id: String(m._id),
    runtime: m.runtime || DEFAULT_RUNTIME,
    family: isFamilyFriendly((m.genres || []).map(g => g.id)),
}));
