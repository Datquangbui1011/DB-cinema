/**
 * Model inputs for the showtime demand model. The same code builds training
 * rows (scripts/exportTrainingData.js) and live predictions, so the model
 * always sees features computed exactly the way it was trained on.
 *
 * Nothing here may look past the snapshot time `at`: seats sold are counted up
 * to `at`, and history only includes shows that started before `at`.
 */
import { toCinemaDate, CINEMA_TIMEZONE } from '../configs/cinemaTime.js';
import { theaterPremiums, THEATER_TYPES, SEATS_PER_SHOW } from '../configs/theaterTypes.js';
import { isHoliday } from '../configs/holidays.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MOVIE_HISTORY_DAYS = 7;
const SLOT_HISTORY_DAYS = 28;
const MIN_SLOT_SHOWS = 3;           // fewer than this falls back to a broader slot
const DEFAULT_RATING = 6.5;
const DEFAULT_RUNTIME = 120;
export const NO_HISTORY = -1;       // a movie with no finished shows yet (trees split on it)

// TMDB genre IDs used as multi-hot columns; anything else is ignored
export const GENRES = {
    action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80, drama: 18, family: 10751,
    fantasy: 14, horror: 27, mystery: 9648, romance: 10749, scifi: 878, thriller: 53,
};

const roomKey = (type) => `room_${type.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_$/, '')}`;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Fixed column order shared with Python (ml/train.py) and the exported model
export const FEATURE_NAMES = [
    'hoursUntil', 'seatsSoldNow', 'occupancyNow',
    ...THEATER_TYPES.map(roomKey), 'roomPremium',
    ...WEEKDAYS.map(d => `dow_${d}`), 'startHour', 'isWeekend', 'isHoliday',
    'daysSinceRelease', 'runtime', 'voteAverage',
    ...Object.keys(GENRES).map(g => `genre_${g}`),
    'ticketPrice', 'discountPercent',
    'movieAvgOccupancy7d', 'movieShows7d', 'slotAvgOccupancy',
];

const cinemaHour = (date) => Number(date.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', hour12: false })) % 24;
const dayNumber = (dateStr) => Math.floor(Date.parse(`${dateStr}T12:00:00Z`) / DAY_MS);
const weekdayOf = (dateStr) => new Date(`${dateStr}T12:00:00Z`).getUTCDay();
const hourBucket = (hour) => hour < 12 ? 0 : hour < 17 ? 1 : hour < 21 ? 2 : 3;

// The time slot a show belongs to, used for "how does this slot usually sell"
export const slotOf = (show) => {
    const date = toCinemaDate(show.showDateTime);
    const weekday = weekdayOf(date);
    return { theaterType: show.theaterType, hour: cinemaHour(show.showDateTime), weekday, weekend: weekday === 0 || weekday >= 5 };
};

// Index of time-sorted values with prefix sums, for fast averages over a time window
const timeline = () => ({ times: [], sums: [0] });
const pushPoint = (t, time, value) => { t.times.push(time); t.sums.push(t.sums.at(-1) + value); };
const lowerBound = (arr, x) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; arr[mid] < x ? lo = mid + 1 : hi = mid; }
    return lo;
};
const windowStats = (t, from, to) => {
    if (!t) return { count: 0, avg: null };
    const a = lowerBound(t.times, from), b = lowerBound(t.times, to);
    return { count: b - a, avg: b > a ? (t.sums[b] - t.sums[a]) / (b - a) : null };
};

/**
 * Past occupancy, for the rolling features.
 * @param {Array<{ movie, theaterType, showDateTime, seatsSold }>} finishedShows
 *        shows whose final sales are known; any order
 */
export const createHistory = (finishedShows) => {
    const byMovie = new Map(), bySlot = new Map();
    const add = (map, key, time, value) => {
        if (!map.has(key)) map.set(key, timeline());
        pushPoint(map.get(key), time, value);
    };
    const sorted = [...finishedShows].sort((a, b) => a.showDateTime - b.showDateTime);
    for (const show of sorted) {
        const time = show.showDateTime.getTime();
        const occupancy = show.seatsSold / SEATS_PER_SHOW;
        const slot = slotOf(show);
        add(byMovie, String(show.movie), time, occupancy);
        add(bySlot, `${slot.theaterType}|${slot.hour}|${slot.weekday}`, time, occupancy);
        add(bySlot, `${slot.theaterType}|b${hourBucket(slot.hour)}|${slot.weekend}`, time, occupancy);
        add(bySlot, `b${hourBucket(slot.hour)}|${slot.weekend}`, time, occupancy);
        add(bySlot, 'all', time, occupancy);
    }

    return {
        // Average occupancy of this movie's shows in the 7 days before `at`
        movie(movieId, at) {
            const { count, avg } = windowStats(byMovie.get(String(movieId)), at.getTime() - MOVIE_HISTORY_DAYS * DAY_MS, at.getTime());
            return { count, avg: avg ?? NO_HISTORY };
        },
        // How this room x start hour x weekday sold over the last 28 days, widening if too few shows
        slot(slot, at) {
            const from = at.getTime() - SLOT_HISTORY_DAYS * DAY_MS, to = at.getTime();
            const keys = [
                `${slot.theaterType}|${slot.hour}|${slot.weekday}`,
                `${slot.theaterType}|b${hourBucket(slot.hour)}|${slot.weekend}`,
                `b${hourBucket(slot.hour)}|${slot.weekend}`,
                'all',
            ];
            for (const key of keys) {
                const { count, avg } = windowStats(bySlot.get(key), from, to);
                if (count >= MIN_SLOT_SHOWS || (key === 'all' && count > 0)) return avg;
            }
            return NO_HISTORY;
        },
    };
};

/**
 * One feature row as an array in FEATURE_NAMES order.
 * @param {object} p
 * @param {object} p.show         Show: showDateTime, theaterType, showPrice, promotion?
 * @param {object} p.movie        Movie: release_date, runtime, vote_average, genres
 * @param {number} p.seatsSoldNow paid seats sold before `at`
 * @param {Date}   p.at           the moment the prediction is made
 * @param {object} p.history      from createHistory, containing only shows started before `at`
 */
export const buildFeatures = ({ show, movie, seatsSoldNow, at, history }) => {
    const slot = slotOf(show);
    const showDate = toCinemaDate(show.showDateTime);
    const genreIds = new Set((movie.genres || []).map(g => g.id));
    const premium = theaterPremiums[show.theaterType] ?? 0;
    const movieHistory = history.movie(movie._id, at);

    const values = {
        hoursUntil: (show.showDateTime - at) / HOUR_MS,
        seatsSoldNow,
        occupancyNow: seatsSoldNow / SEATS_PER_SHOW,
        ...Object.fromEntries(THEATER_TYPES.map(t => [roomKey(t), t === show.theaterType ? 1 : 0])),
        roomPremium: premium,
        ...Object.fromEntries(WEEKDAYS.map((d, i) => [`dow_${d}`, i === slot.weekday ? 1 : 0])),
        startHour: slot.hour,
        isWeekend: slot.weekend ? 1 : 0,
        isHoliday: isHoliday(showDate) ? 1 : 0,
        daysSinceRelease: movie.release_date ? dayNumber(showDate) - dayNumber(movie.release_date) : 0,
        runtime: movie.runtime || DEFAULT_RUNTIME,
        voteAverage: movie.vote_average || DEFAULT_RATING,
        ...Object.fromEntries(Object.entries(GENRES).map(([name, id]) => [`genre_${name}`, genreIds.has(id) ? 1 : 0])),
        ticketPrice: show.showPrice + premium,
        discountPercent: show.promotion?.percent || 0,
        movieAvgOccupancy7d: movieHistory.avg,
        movieShows7d: movieHistory.count,
        slotAvgOccupancy: history.slot(slot, at),
    };
    return FEATURE_NAMES.map(name => values[name]);
};
