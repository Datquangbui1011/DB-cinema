/**
 * Traffic simulator: makes the cinema look busy before real customers arrive.
 *
 * - Adds a batch of simulated customers each day.
 * - Books seats on upcoming shows for the time elapsed since the last run.
 *   Each show's final demand and booking pace come from simulator/demandModel.js,
 *   the same model the training data was generated with, so promotions, film,
 *   rating, opening week, holidays and time of day all matter. Between two runs a
 *   show sells finalSeats x (share booked by now - share booked by the last run).
 *
 * Everything it creates has `isSimulated: true` and can be removed with
 * scripts/purgeSimulated.js. Only runs when SIMULATE_TRAFFIC=true.
 */
import User from '../models/User.js';
import Show from '../models/Show.js';
import Booking from '../models/Booking.js';
import SimulatorState from '../models/SimulatorState.js';
import '../models/Movie.js';   // registers the model used by populate('movie')
import { toCinemaDate } from '../configs/cinemaTime.js';
import { theaterPremiums, SEATS_PER_SHOW } from '../configs/theaterTypes.js';
import { showProfile, showDemand, bookedShare } from './demandModel.js';

const STATE_ID = 'traffic';
const HOUR = 3_600_000;
const INITIAL_CUSTOMERS = 80;
const NEW_CUSTOMERS_PER_DAY = [6, 20];      // min, max
const MAX_CATCH_UP = 8 * HOUR;               // admin page loads catch up at most this much (kept fast)
export const CRON_CATCH_UP = 26 * HOUR;     // the nightly run covers a whole day
const FIRST_RUN_BACKFILL = 6 * HOUR;
const MIN_INTERVAL_MS = 60_000;
const BOOKING_WINDOW = 14 * 24 * HOUR;      // matches the 14-day schedule
const ABANDON_RATE = 0.06;                  // checkouts started but never paid

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = SEATS_PER_SHOW / ROWS.length;

const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Mia', 'Mason', 'Isabella', 'Ethan', 'Amelia', 'Logan', 'Harper', 'James', 'Evelyn', 'Aiden', 'Abigail', 'Jackson', 'Ella', 'Mateo', 'Chloe', 'Leo', 'Grace', 'Wyatt', 'Nora', 'Daniel', 'Lily', 'Henry', 'Zoe', 'Ryan', 'Layla', 'Owen', 'Aria', 'Caleb'];
const LAST = ['Nguyen', 'Smith', 'Garcia', 'Johnson', 'Brown', 'Martinez', 'Davis', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Lee', 'Perez', 'Tran', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Bui', 'Pham', 'Kim', 'Patel', 'Rivera'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const GROUP_SIZES = [1, 2, 2, 2, 2, 3, 3, 4, 4, 5];
const money = (n) => Math.round(n * 100) / 100;

// Upcoming shows with what demandModel needs; shows whose movie is gone are skipped
const loadShows = async (from, to) => (await Show.find({ showDateTime: { $gt: from, $lt: to } })
    .select('movie screen showDateTime theaterType showPrice promotion occupiedSeats')
    .populate('movie', 'release_date vote_average genres').lean())
    .filter(s => s.movie)
    .map(s => {
        const profile = showProfile(s, s.movie);
        return { ...s, profile, finalSeats: Math.min(1, showDemand(s, s.movie, profile)) * SEATS_PER_SHOW };
    });

// Split `count` seats into booking groups
const groupSizes = (count) => {
    const sizes = [];
    while (count > 0) { const n = Math.min(pick(GROUP_SIZES), count); sizes.push(n); count -= n; }
    return sizes;
};

// Write planned bookings; seats are only taken if still free, so real customers always win
const writeBookings = async (planned) => {
    const confirmed = [];
    for (let i = 0; i < planned.length; i += 50) {
        await Promise.all(planned.slice(i, i + 50).map(async booking => {
            if (booking.isPaid) {
                const free = Object.fromEntries(booking.seats.map(s => [`occupiedSeats.${s}`, { $exists: false }]));
                const set = Object.fromEntries(booking.seats.map(s => [`occupiedSeats.${s}`, booking.user]));
                const result = await Show.updateOne({ _id: booking.show._id, ...free }, { $set: set });
                if (result.modifiedCount === 0) return;
            }
            confirmed.push(booking);
        }));
    }
    // Inserted directly so the backdated createdAt isn't replaced by "now"
    if (confirmed.length) {
        await Booking.collection.insertMany(confirmed.map(b => ({
            user: b.user,
            show: String(b.show._id),
            bookedSeat: b.seats,
            amount: money((b.show.showPrice + (theaterPremiums[b.show.theaterType] || 0)) * b.seats.length),
            isPaid: b.isPaid,
            isSimulated: true,
            createdAt: b.createdAt,
            updatedAt: b.createdAt,
            __v: 0,
        })));
    }
    return confirmed;
};

const createCustomers = async (count, createdAt) => {
    const stamp = createdAt.getTime().toString(36);
    const users = Array.from({ length: count }, (_, i) => {
        const name = `${pick(FIRST)} ${pick(LAST)}`;
        const id = `sim_${stamp}_${i}`;
        return {
            _id: id,
            name,
            email: `${id}@simulated.dbcinema.test`,
            image: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
            isSimulated: true,
            createdAt,
        };
    });
    await User.insertMany(users);
    return users.length;
};

// Contiguous seats in one row when possible, otherwise any free seats
const chooseSeats = (taken, size) => {
    const rows = [...ROWS].sort(() => Math.random() - 0.5);
    for (const row of rows) {
        const free = Array.from({ length: SEATS_PER_ROW }, (_, i) => `${row}${i + 1}`).filter(s => !taken[s]);
        for (let start = 0; start + size <= free.length; start++) {
            const run = free.slice(start, start + size);
            const consecutive = run.every((s, i) => i === 0 || Number(s.slice(1)) === Number(run[i - 1].slice(1)) + 1);
            if (consecutive && Math.random() < 0.6) return run;
        }
    }
    const allFree = ROWS.flatMap(r => Array.from({ length: SEATS_PER_ROW }, (_, i) => `${r}${i + 1}`)).filter(s => !taken[s]);
    return allFree.length >= size ? allFree.sort(() => Math.random() - 0.5).slice(0, size) : null;
};

/**
 * Simulate customer activity between the last run and now.
 * Returns a summary, or null if nothing ran.
 */
export const runTrafficSimulation = async (now = new Date(), { maxCatchUp = MAX_CATCH_UP } = {}) => {
    const nowMs = now.getTime();
    let state = await SimulatorState.findById(STATE_ID).lean();
    if (!state) {
        try {
            state = (await SimulatorState.create({ _id: STATE_ID, lastRunAt: new Date(nowMs - FIRST_RUN_BACKFILL) })).toObject();
        } catch {
            return null; // another request created it first
        }
    }

    const fromMs = Math.max(state.lastRunAt.getTime(), nowMs - maxCatchUp);
    if (nowMs - fromMs < MIN_INTERVAL_MS) return null;

    // Claim this window so concurrent requests don't simulate it twice
    const claimed = await SimulatorState.findOneAndUpdate(
        { _id: STATE_ID, lastRunAt: state.lastRunAt },
        { $set: { lastRunAt: now } },
    );
    if (!claimed) return null;

    // New customers once per cinema-local day
    let newCustomers = 0;
    const today = toCinemaDate(now);
    if (state.lastUserDay !== today) {
        const isFirstDay = !state.lastUserDay && !(await User.exists({ isSimulated: true }));
        const [min, max] = NEW_CUSTOMERS_PER_DAY;
        newCustomers = await createCustomers(isFirstDay ? INITIAL_CUSTOMERS : min + Math.floor(Math.random() * (max - min + 1)), now);
        await SimulatorState.updateOne({ _id: STATE_ID }, { $set: { lastUserDay: today } });
    }

    const customers = (await User.find({ isSimulated: true }).select('_id').lean()).map(u => u._id);
    if (customers.length === 0) return { from: new Date(fromMs), to: now, newCustomers, bookings: 0, tickets: 0 };

    // Each show sells the part of its demand that falls in this window
    const shows = await loadShows(new Date(fromMs), new Date(nowMs + BOOKING_WINDOW));
    const planned = [];
    for (const show of shows) {
        const start = show.showDateTime.getTime();
        const share = bookedShare((start - nowMs) / HOUR, show.profile) - bookedShare((start - fromMs) / HOUR, show.profile);
        const free = SEATS_PER_SHOW - Object.keys(show.occupiedSeats || {}).length;
        const seats = Math.min(free, Math.floor(show.finalSeats * share + Math.random()));
        const latest = Math.min(nowMs, start - 0.25 * HOUR);
        if (seats <= 0 || latest <= fromMs) continue;

        for (const size of groupSizes(seats)) {
            const chosen = chooseSeats(show.occupiedSeats || {}, size);
            if (!chosen) break;
            const user = pick(customers);
            const createdAt = new Date(fromMs + Math.random() * (latest - fromMs));
            show.occupiedSeats = { ...(show.occupiedSeats || {}), ...Object.fromEntries(chosen.map(s => [s, user])) };
            planned.push({ show, seats: chosen, user, isPaid: true, createdAt });
            // Some people start a checkout and never pay (their seats are not held)
            if (Math.random() < ABANDON_RATE) planned.push({ show, seats: chosen, user: pick(customers), isPaid: false, createdAt });
        }
    }

    const confirmed = await writeBookings(planned);
    const bookings = confirmed.length;
    const tickets = confirmed.filter(b => b.isPaid).reduce((sum, b) => sum + b.seats.length, 0);

    const summary = { from: new Date(fromMs), to: now, newCustomers, bookings, tickets };
    console.log(`[Simulator] ${new Date(fromMs).toISOString()} → ${now.toISOString()}: +${newCustomers} customers, ${bookings} bookings, ${tickets} tickets`);
    return summary;
};

/**
 * One-off: give upcoming shows the presales they would have built up by now
 * under the demand model. Only tops up shows that are below that level.
 * Bookings are backdated and flagged isSimulated.
 */
export const backfillAdvanceSales = async (now = new Date(), { fromDays = 1 } = {}) => {
    const nowMs = now.getTime();
    const customers = (await User.find({ isSimulated: true }).select('_id').lean()).map(u => u._id);
    if (customers.length === 0) return { bookings: 0, tickets: 0 };

    const shows = await loadShows(new Date(nowMs + fromDays * 24 * HOUR), new Date(nowMs + BOOKING_WINDOW));
    const planned = [];
    for (const show of shows) {
        const hoursOut = (show.showDateTime.getTime() - nowMs) / HOUR;
        const target = Math.round(show.finalSeats * bookedShare(hoursOut, show.profile));
        let sold = Object.keys(show.occupiedSeats || {}).length;
        for (const size of groupSizes(Math.max(0, target - sold))) {
            const chosen = chooseSeats(show.occupiedSeats || {}, size);
            if (!chosen) break;
            const user = pick(customers);
            show.occupiedSeats = { ...(show.occupiedSeats || {}), ...Object.fromEntries(chosen.map(seat => [seat, user])) };
            sold += chosen.length;
            planned.push({ show, seats: chosen, user, isPaid: true, createdAt: new Date(nowMs - Math.random() * Math.min(5 * 24, hoursOut) * HOUR) });
        }
    }
    const confirmed = await writeBookings(planned);
    return { shows: shows.length, bookings: confirmed.length, tickets: confirmed.reduce((sum, b) => sum + b.seats.length, 0) };
};

export const isSimulationEnabled = () => process.env.SIMULATE_TRAFFIC === 'true';

let lastAttempt = 0;

// Express middleware: catch the simulation up (at most every couple of minutes) before admin pages load
export const simulateTraffic = async (req, res, next) => {
    if (isSimulationEnabled() && Date.now() - lastAttempt > 2 * MIN_INTERVAL_MS) {
        lastAttempt = Date.now();
        try {
            await runTrafficSimulation();
        } catch (error) {
            console.error('[Simulator]', error.message);
        }
    }
    next();
};
