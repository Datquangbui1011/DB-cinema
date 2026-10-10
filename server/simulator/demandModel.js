/**
 * The single "true" demand process behind all simulated bookings. Both the
 * demo seeder (training data, scripts/seedDemoData.js) and the live traffic
 * simulator (production, simulator/trafficSimulator.js) use it, so the model
 * is trained on the same patterns it later forecasts.
 *
 * A show's final demand (share of seats people want) is:
 *   time of day x weekday x holiday x room x rating x movie buzz x opening-week
 *   hype x genre-by-time x promotion lift x per-show noise, capped at a full house.
 * Buzz and noise come from hashes of the movie / show, so the same show gets
 * the same demand wherever it is simulated.
 *
 * Booking timing: 30% of seats are bought in the last 6 hours, the rest earlier
 * (hyped films and weekends further ahead), up to 13.5 days before the show.
 */
import { toCinemaDate, CINEMA_TIMEZONE } from '../configs/cinemaTime.js';
import { holidayOn } from '../configs/holidays.js';
import { isFamilyFriendly, MATURE_GENRES } from '../scheduler/screenPlanner.js';

const DAY_MS = 86_400_000;
const HORROR = 27;
export const LAST_MINUTE_SHARE = 0.3;
const LAST_MINUTE_HOURS = [0.25, 6];
const MAX_LEAD_HOURS = 13.5 * 24;
export const PROMO_LIFT_PER_PERCENT = 0.015;   // 20% off -> +30% demand

const ROOM_DEMAND = { 'Standard': 1, 'IMAX': 1.15, 'Dolby Cinema': 1.05, '4DX': 0.95, 'ScreenX': 0.9, 'VIP Recliner': 0.85, 'Premium': 0.7, 'Kids & Family': 1.1 };
const timeDemand = (hour) => hour < 12 ? 0.3 : hour < 17 ? 0.48 : hour < 21 ? 0.82 : 0.58;
const weekdayDemand = (weekday) => [1.15, 0.8, 0.85, 0.9, 0.95, 1.3, 1.35][weekday];   // Sun..Sat
const ratingDemand = (vote) => 1 + 0.18 * Math.min(2, Math.max(-2, (vote || 6.5) - 6.5));
// Opening week is busiest, then interest fades (never to nothing); previews sell a little less
export const releaseHype = (daysSinceRelease) => daysSinceRelease < 0 ? 1.2 : Math.max(0.45, 1.5 * Math.exp(-daysSinceRelease / 18));

// Deterministic pseudo-random numbers from a string (FNV-1a + xorshift)
const hash = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
};
const seededRandom = (key) => {
    let s = hash(key) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};
const lognormalFrom = (rand, sigma) => {
    const g = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    return Math.exp(sigma * g - sigma * sigma / 2);   // mean 1
};

// Word of mouth the model never sees directly (only through the film's sales)
export const movieBuzz = (movieId) => lognormalFrom(seededRandom(`buzz:${movieId}`), 0.3);

const localHour = (date) => Number(date.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', hour12: false })) % 24;
const dayNumber = (dateStr) => Math.floor(Date.parse(`${dateStr}T12:00:00Z`) / DAY_MS);

const genreTimeDemand = (genreIds, family, hour, weekendLike) => {
    if (family) {
        if (hour < 17) return weekendLike ? 1.45 : 1.1;
        return hour >= 20 ? 0.55 : 0.9;
    }
    if (genreIds.includes(HORROR)) return hour >= 21 ? 1.3 : hour < 15 ? 0.6 : 1;
    if (genreIds.some(id => MATURE_GENRES.includes(id))) return hour >= 19 ? 1.1 : 0.85;
    return 1;
};

/**
 * Facts about a show that drive demand and booking timing.
 * @param {object} show   { showDateTime, theaterType, screen, promotion? }
 * @param {object} movie  { _id, release_date, vote_average, genres }
 */
export const showProfile = (show, movie) => {
    const start = new Date(show.showDateTime);
    const date = toCinemaDate(start);
    const hour = localHour(start);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const holiday = holidayOn(date);
    const weekendLike = weekday === 0 || weekday === 5 || weekday === 6 || !!holiday;
    const genreIds = (movie.genres || []).map(g => g.id);
    const days = movie.release_date ? dayNumber(date) - dayNumber(movie.release_date) : 30;
    return { start, hour, weekday, holiday, weekendLike, genreIds, family: isFamilyFriendly(genreIds), hype: releaseHype(days) };
};

/**
 * Share of the show's seats people want (before capping at a full house).
 * `promoPercent` defaults to the show's promotion; pass 0 for demand without it.
 * A promotion only lifts demand from when it starts (promotion.startedAt):
 * callers use the promoted demand for bookings after that moment.
 */
export const showDemand = (show, movie, profile = showProfile(show, movie), promoPercent = show.promotion?.percent || 0) => {
    const p = profile;
    const promo = promoPercent;
    const noise = lognormalFrom(seededRandom(`show:${show.screen}|${p.start.toISOString()}|${movie._id}`), 0.22);
    return timeDemand(p.hour) * weekdayDemand(p.weekday) * (p.holiday?.demoBoost || 1)
        * (ROOM_DEMAND[show.theaterType] || 1) * ratingDemand(movie.vote_average) * movieBuzz(String(movie._id))
        * p.hype * genreTimeDemand(p.genreIds, p.family, p.hour, p.weekendLike)
        * (1 + PROMO_LIFT_PER_PERCENT * promo) * noise;
};

// Average days ahead for the non-last-minute bookings
const meanLeadDays = (hype, weekendLike) => 0.8 + 1.8 * (hype - 0.45) + (weekendLike ? 0.6 : 0);

/**
 * Share of a show's final sales already made when `hoursUntil` hours remain.
 * Used by the live simulator: between two moments it sells
 * finalSeats x (bookedShare(later) - bookedShare(earlier)).
 */
export const bookedShare = (hoursUntil, { hype, weekendLike }) => {
    if (hoursUntil <= 0) return 1;
    // P(a booking's lead time > hoursUntil), for each of the two booking groups
    const [lo, hi] = LAST_MINUTE_HOURS;
    const lastMinute = hoursUntil < lo ? 1 : hoursUntil > hi ? 0 : (hi - hoursUntil) / (hi - lo);
    const advance = hoursUntil < 6 ? 1 : hoursUntil >= MAX_LEAD_HOURS ? 0 : Math.exp(-(hoursUntil - 6) / (meanLeadDays(hype, weekendLike) * 24));
    return LAST_MINUTE_SHARE * lastMinute + (1 - LAST_MINUTE_SHARE) * advance;
};

/** Hours before the show one booking is made (same distribution as bookedShare). */
export const sampleLeadHours = ({ hype, weekendLike }, rand = Math.random) => {
    if (rand() < LAST_MINUTE_SHARE) return LAST_MINUTE_HOURS[0] + rand() * (LAST_MINUTE_HOURS[1] - LAST_MINUTE_HOURS[0]);
    return Math.min(-Math.log(1 - rand()) * meanLeadDays(hype, weekendLike) * 24 + 6, MAX_LEAD_HOURS);
};
