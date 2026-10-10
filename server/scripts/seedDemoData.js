/**
 * Fill a separate demo database with realistic sample customers, shows and
 * bookings so the admin dashboard, analytics and the AI Advisor's demand
 * model can be previewed and trained.
 *
 * Movies are copied (read-only) from the live database in MONGODB_URI.
 * Everything else is generated. The live database is never written to.
 *
 * Demand is deliberately driven by several learnable patterns plus noise:
 *   - start hour, weekday/weekend and holidays
 *   - room type, and ticket price (some shows run 10-30% promotions)
 *   - movie rating, plus a hidden "buzz" the model can only see through sales
 *   - opening-week hype that fades week by week
 *   - genre x time (family films sell in the daytime, horror late at night)
 *   - per-show randomness, with sell-outs capping demand at 90 seats
 * Hyped films and weekends are also booked further in advance.
 *
 * Each movie gets a staggered demo "release date" inside the simulated window
 * (stored in the demo copy only), so new releases open throughout it.
 *
 * Usage:  MONGODB_DB=demo_dbcinema node scripts/seedDemoData.js
 *    or:  MONGODB_DB=demo_dbcinema npm run seed:demo
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import { toCinemaDate, CINEMA_TIMEZONE } from '../configs/cinemaTime.js';
import { theaterPremiums, SEATS_PER_SHOW } from '../configs/theaterTypes.js';
import { planDay, toPlannerMovies, MATURE_GENRES } from '../scheduler/screenPlanner.js';
import { DEFAULT_SCREENS } from '../configs/screens.js';
import { holidayOn } from '../configs/holidays.js';

const DEMO_DB = process.env.MONGODB_DB;
const DAYS_BACK = 70;
const DAYS_AHEAD = 7;
const MOVIES_PER_DAY = 20;
const CUSTOMERS = 220;
const BASE_PRICE = 12;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = SEATS_PER_SHOW / ROWS.length;
const HORROR = 27;

// Demo release dates run from FIRST_RELEASE days before today to LAST_RELEASE after
const FIRST_RELEASE = -110;
const LAST_RELEASE = 5;

// Promotions: share of shows discounted, and how much a discount lifts demand
const PROMO_SHARE = 0.09;
const PROMO_LIFT_PER_PERCENT = 0.015;   // 20% off -> +30% demand

if (!DEMO_DB || !DEMO_DB.startsWith('demo')) {
    console.error('Refusing to run: set MONGODB_DB to a database name starting with "demo".');
    process.exit(1);
}

// Deterministic random numbers so every run produces the same data
let seed = 20261010;
const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const lognormal = (sigma) => Math.exp(sigma * gaussian() - sigma * sigma / 2);   // mean 1

const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Mia', 'Mason', 'Isabella', 'Ethan', 'Amelia', 'Logan', 'Harper', 'James', 'Evelyn', 'Aiden', 'Abigail', 'Jackson', 'Ella', 'Mateo', 'Chloe', 'Leo', 'Grace', 'Wyatt', 'Nora', 'Daniel', 'Lily', 'Henry'];
const LAST = ['Nguyen', 'Smith', 'Garcia', 'Johnson', 'Brown', 'Martinez', 'Davis', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Lee', 'Perez', 'Tran', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright'];

// How full a showing gets by start hour (cinema-local), before other factors
const timeDemand = (hour) => hour < 12 ? 0.3 : hour < 17 ? 0.48 : hour < 21 ? 0.82 : 0.58;
const ROOM_DEMAND = { 'Standard': 1, 'IMAX': 1.15, 'Dolby Cinema': 1.05, '4DX': 0.95, 'ScreenX': 0.9, 'VIP Recliner': 0.85, 'Premium': 0.7, 'Kids & Family': 1.1 };
const weekdayDemand = (weekday) => [1.15, 0.8, 0.85, 0.9, 0.95, 1.3, 1.35][weekday];   // Sun..Sat

// Higher-rated films sell better; unrated ones are treated as average
const ratingDemand = (vote) => 1 + 0.18 * clamp((vote || 6.5) - 6.5, -2, 2);

// Opening week is busiest, then interest fades (but never to nothing)
const releaseDemand = (daysSinceRelease) => Math.max(0.45, 1.5 * Math.exp(-daysSinceRelease / 18));

// Genre x time of day
const genreTimeDemand = (movie, hour, weekendLike) => {
    if (movie.family) {
        if (hour < 17) return weekendLike ? 1.45 : 1.1;
        return hour >= 20 ? 0.55 : 0.9;
    }
    if (movie.genreIds.includes(HORROR)) return hour >= 21 ? 1.3 : hour < 15 ? 0.6 : 1;
    if (movie.genreIds.some(id => MATURE_GENRES.includes(id))) return hour >= 19 ? 1.1 : 0.85;
    return 1;
};

// Days before the show each booking is made: some book on the day, the rest
// further ahead; hyped films and weekends are booked earlier
const bookingLeadHours = (hype, weekendLike) => {
    if (random() < 0.3) return 0.25 + random() * 6;
    const meanDays = 0.8 + 1.8 * (hype - 0.45) + (weekendLike ? 0.6 : 0);
    return Math.min(-Math.log(1 - random()) * meanDays * 24 + 6, 13.5 * 24);
};

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const liveDb = mongoose.connection.db;
    if (liveDb.databaseName === DEMO_DB) throw new Error('Demo database must differ from the live database.');

    const liveMovies = await liveDb.collection('movies').find({}).sort({ release_date: 1, _id: 1 }).toArray();
    if (liveMovies.length === 0) throw new Error('No movies found in the live database to copy.');
    console.log(`Copying ${liveMovies.length} movies from "${liveDb.databaseName}" (read-only)`);

    // Stagger releases across the window, keeping the real release order
    const now = new Date();
    const today = toCinemaDate(now);
    const dayNumberOf = (dateStr) => Math.floor(Date.parse(`${dateStr}T12:00:00Z`) / DAY_MS);
    const step = (LAST_RELEASE - FIRST_RELEASE) / Math.max(1, liveMovies.length - 1);
    const movies = liveMovies.map((m, i) => {
        const offset = Math.round(FIRST_RELEASE + i * step);
        return { ...m, real_release_date: m.release_date, release_date: toCinemaDate(new Date(now.getTime() + offset * DAY_MS)) };
    });

    const demo = mongoose.connection.useDb(DEMO_DB).db;
    await Promise.all(['movies', 'shows', 'bookings', 'users', 'screens', 'predictions', 'recommendations'].map(c => demo.collection(c).deleteMany({})));
    await demo.collection('movies').insertMany(movies);
    await demo.collection('screens').insertMany(DEFAULT_SCREENS.map(sc => ({ ...sc, createdAt: new Date(), updatedAt: new Date() })));

    // Customers: a few regulars book often, most book occasionally
    const users = Array.from({ length: CUSTOMERS }, (_, i) => {
        const name = `${pick(FIRST)} ${pick(LAST)}`;
        const n = String(i + 1).padStart(3, '0');
        return {
            _id: `demo_user_${n}`,
            name,
            email: `demo${n}@example.com`,
            image: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
            weight: i < 30 ? 6 : i < 100 ? 2 : 1,
        };
    });
    await demo.collection('users').insertMany(users.map(({ weight, ...u }) => u));
    const weightedUsers = users.flatMap(u => Array(u.weight).fill(u._id));

    // Per-movie traits; `buzz` is hidden word of mouth the model never sees directly
    const plannerMovies = toPlannerMovies(movies);
    const traits = Object.fromEntries(movies.map((m, i) => [String(m._id), {
        ...plannerMovies[i],
        genreIds: (m.genres || []).map(g => g.id),
        releaseNumber: dayNumberOf(m.release_date),
        rating: ratingDemand(m.vote_average),
        buzz: lognormal(0.3),
    }]));

    const shows = [];
    const bookings = [];
    const stats = { promos: 0, soldOut: 0 };

    for (let offset = -DAYS_BACK; offset <= DAYS_AHEAD; offset++) {
        const dateStr = toCinemaDate(new Date(now.getTime() + offset * DAY_MS));
        const dayNumber = dayNumberOf(dateStr);
        const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
        const holiday = holidayOn(dateStr);
        const weekendLike = weekday === 0 || weekday === 5 || weekday === 6 || !!holiday;
        const dayFactor = weekdayDemand(weekday) * (holiday?.demoBoost || 1);
        const growth = 0.9 + 0.2 * ((offset + DAYS_BACK) / (DAYS_BACK + DAYS_AHEAD));

        // Like the real scheduler: the newest released films, always including a family film
        const released = movies.filter(m => traits[String(m._id)].releaseNumber <= dayNumber);
        const todaysMovies = released.slice(-MOVIES_PER_DAY);
        if (!todaysMovies.some(m => traits[String(m._id)].family)) {
            const family = released.filter(m => traits[String(m._id)].family).at(-1);
            if (family) todaysMovies.splice(0, 1, family);
        }
        const plannedShows = planDay(dateStr, DEFAULT_SCREENS, toPlannerMovies(todaysMovies));

        for (const planned of plannedShows) {
            const { movie: movieId, theaterType, showDateTime } = planned;
            const movie = traits[movieId];
            const hour = Number(showDateTime.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', hour12: false })) % 24;
            const hype = releaseDemand(dayNumber - movie.releaseNumber);
            const showId = new mongoose.Types.ObjectId();

            // Promotions lean towards quieter slots, as a manager would choose
            const quietSlot = hour < 17 && !weekendLike;
            const promoPercent = random() < PROMO_SHARE * (quietSlot ? 1.6 : 0.6) ? pick([10, 20, 20, 30]) : 0;
            const showPrice = promoPercent ? Math.round(BASE_PRICE * (1 - promoPercent / 100) * 100) / 100 : BASE_PRICE;
            if (promoPercent) stats.promos += 1;

            const demand = timeDemand(hour) * ROOM_DEMAND[theaterType] * dayFactor * growth
                * movie.rating * movie.buzz * hype * genreTimeDemand(movie, hour, weekendLike)
                * (1 + PROMO_LIFT_PER_PERCENT * promoPercent)
                * lognormal(0.22);
            const seatsToSell = Math.round(clamp(demand, 0, 1) * SEATS_PER_SHOW);
            if (seatsToSell >= SEATS_PER_SHOW) stats.soldOut += 1;

            const occupiedSeats = {};
            const freeSeats = ROWS.flatMap(r => Array.from({ length: SEATS_PER_ROW }, (_, i) => `${r}${i + 1}`));
            const ticketPrice = showPrice + theaterPremiums[theaterType];

            let sold = 0;
            while (sold < seatsToSell && freeSeats.length) {
                const size = Math.min(pick([1, 2, 2, 2, 2, 3, 3, 4, 4, 5]), freeSeats.length, seatsToSell - sold);
                const start = Math.floor(random() * (freeSeats.length - size + 1));
                const seats = freeSeats.splice(start, size);
                const createdAt = new Date(showDateTime.getTime() - bookingLeadHours(hype, weekendLike) * HOUR_MS);

                // Only bookings already made by now exist; the rest are future sales
                if (createdAt > now) {
                    freeSeats.push(...seats);
                    sold += seats.length;
                    continue;
                }

                const user = pick(weightedUsers);
                const isPaid = random() > 0.08;
                if (isPaid) {
                    seats.forEach(seat => { occupiedSeats[seat] = user; });
                    sold += seats.length;
                } else {
                    freeSeats.push(...seats);   // abandoned checkout: seats stay free
                }
                bookings.push({
                    user,
                    show: String(showId),
                    bookedSeat: seats,
                    amount: Math.round(ticketPrice * seats.length * 100) / 100,
                    isPaid,
                    createdAt,
                    updatedAt: createdAt,
                    __v: 0,
                });
            }

            shows.push({
                ...planned,
                _id: showId,
                showPrice,
                promotion: promoPercent ? { percent: promoPercent, originalPrice: BASE_PRICE, endsAt: showDateTime, recommendationId: null } : null,
                occupiedSeats,
                __v: 0,
            });
        }
    }

    await demo.collection('shows').insertMany(shows);
    for (let i = 0; i < bookings.length; i += 5000) {
        await demo.collection('bookings').insertMany(bookings.slice(i, i + 5000));
    }

    const paid = bookings.filter(b => b.isPaid);
    const past = shows.filter(s => s.showDateTime <= now);
    const pastSeats = past.reduce((n, s) => n + Object.keys(s.occupiedSeats).length, 0);
    console.log(`Demo database "${DEMO_DB}" ready (releases staggered ${FIRST_RELEASE}..+${LAST_RELEASE} days, today ${today}):`);
    console.log(`  ${movies.length} movies, ${users.length} customers, ${shows.length} shows (${past.length} already played)`);
    console.log(`  ${bookings.length} bookings (${paid.length} paid), $${Math.round(paid.reduce((s, b) => s + b.amount, 0)).toLocaleString()} revenue`);
    console.log(`  Played shows ${Math.round(pastSeats / (past.length * SEATS_PER_SHOW) * 100)}% full on average, ${stats.soldOut} sell-outs, ${stats.promos} promotions`);
    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error('Seeding failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
});
