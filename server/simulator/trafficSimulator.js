/**
 * Traffic simulator: makes the cinema look busy before real customers arrive.
 *
 * - Adds a batch of simulated customers each day.
 * - Books seats on upcoming shows for the time elapsed since the last run,
 *   at a realistic pace (busier evenings and weekends, sooner shows sell faster).
 *
 * Everything it creates has `isSimulated: true` and can be removed with
 * scripts/purgeSimulated.js. Only runs when SIMULATE_TRAFFIC=true.
 */
import User from '../models/User.js';
import Show from '../models/Show.js';
import Booking from '../models/Booking.js';
import SimulatorState from '../models/SimulatorState.js';
import { toCinemaDate, CINEMA_TIMEZONE } from '../configs/cinemaTime.js';
import { theaterPremiums, SEATS_PER_SHOW } from '../configs/theaterTypes.js';

const STATE_ID = 'traffic';
const HOUR = 3_600_000;
const DAILY_BOOKINGS = 650;                 // ~1,600 tickets a day across ~60 shows
const INITIAL_CUSTOMERS = 80;
const NEW_CUSTOMERS_PER_DAY = [6, 20];      // min, max
const MAX_CATCH_UP = 8 * HOUR;               // longer gaps are skipped, keeping page loads fast
const FIRST_RUN_BACKFILL = 6 * HOUR;
const MIN_INTERVAL_MS = 60_000;
const BOOKING_WINDOW = 14 * 24 * HOUR;      // matches the 14-day schedule
// Most bookings are for the next few days; a small, fading share are advance sales
const ADVANCE_INTEREST = 0.012;
const ABANDON_RATE = 0.06;                  // checkouts started but never paid

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = SEATS_PER_SHOW / ROWS.length;

// Share of the day's bookings made in each cinema-local hour (0-23)
const BOOKING_HOURS = [0.5, 0.2, 0.1, 0.1, 0.1, 0.2, 0.5, 1, 2, 3, 4, 5, 6, 6, 5, 5, 6, 7, 8, 7, 6, 4, 2, 1];
const BOOKING_HOURS_TOTAL = BOOKING_HOURS.reduce((a, b) => a + b, 0);

const ROOM_DEMAND = { 'Standard': 1, 'IMAX': 1.15, 'Dolby Cinema': 1.05, '4DX': 0.95, 'ScreenX': 0.9, 'VIP Recliner': 0.85, 'Premium': 0.7, 'Kids & Family': 1.1 };
const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Mia', 'Mason', 'Isabella', 'Ethan', 'Amelia', 'Logan', 'Harper', 'James', 'Evelyn', 'Aiden', 'Abigail', 'Jackson', 'Ella', 'Mateo', 'Chloe', 'Leo', 'Grace', 'Wyatt', 'Nora', 'Daniel', 'Lily', 'Henry', 'Zoe', 'Ryan', 'Layla', 'Owen', 'Aria', 'Caleb'];
const LAST = ['Nguyen', 'Smith', 'Garcia', 'Johnson', 'Brown', 'Martinez', 'Davis', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Lee', 'Perez', 'Tran', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Bui', 'Pham', 'Kim', 'Patel', 'Rivera'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const cinemaHour = (ms) => Number(new Date(ms).toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', hour12: false })) % 24;
const cinemaWeekday = (ms) => new Date(ms).toLocaleDateString('en-US', { timeZone: CINEMA_TIMEZONE, weekday: 'short' });

const showDemand = (hour) => hour < 12 ? 0.35 : hour < 17 ? 0.6 : hour < 21 ? 1 : 0.7;

const weightedPick = (items, weightOf) => {
    const weights = items.map(weightOf);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
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
export const runTrafficSimulation = async (now = new Date()) => {
    const nowMs = now.getTime();
    let state = await SimulatorState.findById(STATE_ID).lean();
    if (!state) {
        try {
            state = (await SimulatorState.create({ _id: STATE_ID, lastRunAt: new Date(nowMs - FIRST_RUN_BACKFILL) })).toObject();
        } catch {
            return null; // another request created it first
        }
    }

    const fromMs = Math.max(state.lastRunAt.getTime(), nowMs - MAX_CATCH_UP);
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

    // How many bookings this window should have, following the daily pattern
    let expected = 0;
    for (let t = fromMs; t < nowMs; t += HOUR) {
        const slice = Math.min(HOUR, nowMs - t) / HOUR;
        expected += DAILY_BOOKINGS * (BOOKING_HOURS[cinemaHour(t)] / BOOKING_HOURS_TOTAL) * slice;
    }
    const bookingCount = Math.max(0, Math.round(expected * (0.85 + Math.random() * 0.3)));

    const shows = (await Show.find({ showDateTime: { $gt: new Date(fromMs), $lt: new Date(nowMs + BOOKING_WINDOW) } })
        .select('showDateTime theaterType showPrice occupiedSeats').lean())
        // Work out each show's appeal once; timezone formatting is too slow to repeat per booking
        .map(s => {
            const start = s.showDateTime.getTime();
            const weekend = ['Fri', 'Sat'].includes(cinemaWeekday(start)) ? 1.3 : 1;
            return { ...s, start, appeal: showDemand(cinemaHour(start)) * (ROOM_DEMAND[s.theaterType] || 1) * weekend };
        });

    // Plan bookings in memory first (tracking seats taken within this batch)
    const planned = [];
    for (let i = 0; i < bookingCount; i++) {
        const createdAt = fromMs + Math.random() * (nowMs - fromMs);
        const show = weightedPick(shows, s => {
            const hoursUntil = (s.start - createdAt) / HOUR;
            if (hoursUntil < 0.25 || hoursUntil > BOOKING_WINDOW / HOUR) return 0;
            const free = SEATS_PER_SHOW - Object.keys(s.occupiedSeats || {}).length;
            if (free <= 0) return 0;
            return s.appeal * (Math.exp(-hoursUntil / 30) + ADVANCE_INTEREST * Math.exp(-hoursUntil / 200)) * (free / SEATS_PER_SHOW);
        });
        if (!show) continue;

        const seats = chooseSeats(show.occupiedSeats || {}, pick([1, 2, 2, 2, 2, 3, 3, 4, 4, 5]));
        if (!seats) continue;

        const user = pick(customers);
        const isPaid = Math.random() > ABANDON_RATE;
        if (isPaid) show.occupiedSeats = { ...(show.occupiedSeats || {}), ...Object.fromEntries(seats.map(s => [s, user])) };
        planned.push({ show, seats, user, isPaid, createdAt: new Date(createdAt) });
    }

    // Then write in parallel batches. Seats are only taken if still free,
    // so a real customer who booked in the meantime always wins.
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
            amount: (b.show.showPrice + (theaterPremiums[b.show.theaterType] || 0)) * b.seats.length,
            isPaid: b.isPaid,
            isSimulated: true,
            createdAt: b.createdAt,
            updatedAt: b.createdAt,
            __v: 0,
        })));
    }
    const bookings = confirmed.length;
    const tickets = confirmed.filter(b => b.isPaid).reduce((sum, b) => sum + b.seats.length, 0);

    const summary = { from: new Date(fromMs), to: now, newCustomers, bookings, tickets };
    console.log(`[Simulator] ${new Date(fromMs).toISOString()} → ${now.toISOString()}: +${newCustomers} customers, ${bookings} bookings, ${tickets} tickets`);
    return summary;
};

/**
 * One-off: give upcoming shows the presales they would have built up, from
 * about 20% sold a day ahead to about 2% at two weeks. Only tops up shows that
 * are below that level. Bookings are backdated and flagged isSimulated.
 */
export const backfillAdvanceSales = async (now = new Date(), { fromDays = 1 } = {}) => {
    const nowMs = now.getTime();
    const customers = (await User.find({ isSimulated: true }).select('_id').lean()).map(u => u._id);
    if (customers.length === 0) return { bookings: 0, tickets: 0 };

    const shows = await Show.find({ showDateTime: { $gt: new Date(nowMs + fromDays * 24 * HOUR), $lt: new Date(nowMs + BOOKING_WINDOW) } })
        .select('showDateTime theaterType showPrice occupiedSeats').lean();

    const planned = [];
    for (const show of shows) {
        const start = show.showDateTime.getTime();
        const daysOut = (start - nowMs) / (24 * HOUR);
        const weekend = ['Fri', 'Sat'].includes(cinemaWeekday(start)) ? 1.3 : 1;
        const appeal = showDemand(cinemaHour(start)) * (ROOM_DEMAND[show.theaterType] || 1) * weekend;
        const target = Math.round(SEATS_PER_SHOW * 0.12 * Math.exp(-(daysOut - 4) / 5.5) * appeal * (0.6 + Math.random() * 0.8));
        let sold = Object.keys(show.occupiedSeats || {}).length;

        while (sold < target) {
            const seats = chooseSeats(show.occupiedSeats || {}, Math.min(pick([1, 2, 2, 2, 3, 4]), target - sold));
            if (!seats) break;
            const user = pick(customers);
            show.occupiedSeats = { ...(show.occupiedSeats || {}), ...Object.fromEntries(seats.map(seat => [seat, user])) };
            sold += seats.length;
            planned.push({ show, seats, user, isPaid: true, createdAt: new Date(nowMs - Math.random() * Math.min(5, daysOut) * 24 * HOUR) });
        }
    }

    const confirmed = [];
    for (let i = 0; i < planned.length; i += 50) {
        await Promise.all(planned.slice(i, i + 50).map(async booking => {
            const free = Object.fromEntries(booking.seats.map(seat => [`occupiedSeats.${seat}`, { $exists: false }]));
            const set = Object.fromEntries(booking.seats.map(seat => [`occupiedSeats.${seat}`, booking.user]));
            const result = await Show.updateOne({ _id: booking.show._id, ...free }, { $set: set });
            if (result.modifiedCount) confirmed.push(booking);
        }));
    }
    if (confirmed.length) {
        await Booking.collection.insertMany(confirmed.map(b => ({
            user: b.user,
            show: String(b.show._id),
            bookedSeat: b.seats,
            amount: (b.show.showPrice + (theaterPremiums[b.show.theaterType] || 0)) * b.seats.length,
            isPaid: true,
            isSimulated: true,
            createdAt: b.createdAt,
            updatedAt: b.createdAt,
            __v: 0,
        })));
    }
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
