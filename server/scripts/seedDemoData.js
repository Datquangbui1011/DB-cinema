/**
 * Fill a separate demo database with realistic sample customers, shows and
 * bookings so the admin dashboard and analytics can be previewed.
 *
 * Movies are copied (read-only) from the live database in MONGODB_URI.
 * Everything else is generated. The live database is never written to.
 *
 * Usage:  MONGODB_DB=demo_dbcinema node scripts/seedDemoData.js
 *    or:  MONGODB_DB=demo_dbcinema npm run seed:demo
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import { toCinemaDate, CINEMA_TIMEZONE } from '../configs/cinemaTime.js';
import { theaterPremiums, SEATS_PER_SHOW } from '../configs/theaterTypes.js';
import { planDay, toPlannerMovies } from '../scheduler/screenPlanner.js';
import { DEFAULT_SCREENS } from '../configs/screens.js';

const DEMO_DB = process.env.MONGODB_DB;
const DAYS_BACK = 60;
const DAYS_AHEAD = 3;
const MOVIES_PER_DAY = 20;
const CUSTOMERS = 180;
const BASE_PRICE = 12;
const DAY_MS = 86_400_000;
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SEATS_PER_ROW = SEATS_PER_SHOW / ROWS.length;

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

const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Mia', 'Mason', 'Isabella', 'Ethan', 'Amelia', 'Logan', 'Harper', 'James', 'Evelyn', 'Aiden', 'Abigail', 'Jackson', 'Ella', 'Mateo', 'Chloe', 'Leo', 'Grace', 'Wyatt', 'Nora', 'Daniel', 'Lily', 'Henry'];
const LAST = ['Nguyen', 'Smith', 'Garcia', 'Johnson', 'Brown', 'Martinez', 'Davis', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Lee', 'Perez', 'Tran', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright'];

// How full a showing gets by start hour (cinema-local), before randomness
const timeDemand = (hour) => hour < 12 ? 0.28 : hour < 17 ? 0.45 : hour < 21 ? 0.8 : 0.55;
const ROOM_DEMAND = { 'Standard': 1, 'IMAX': 1.15, 'Dolby Cinema': 1.05, '4DX': 0.95, 'ScreenX': 0.9, 'VIP Recliner': 0.85, 'Premium': 0.7, 'Kids & Family': 1.1 };

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const liveDb = mongoose.connection.db;
    if (liveDb.databaseName === DEMO_DB) throw new Error('Demo database must differ from the live database.');

    const movies = await liveDb.collection('movies').find({}).toArray();
    if (movies.length === 0) throw new Error('No movies found in the live database to copy.');
    console.log(`Copying ${movies.length} movies from "${liveDb.databaseName}" (read-only)`);

    const demo = mongoose.connection.useDb(DEMO_DB).db;
    await Promise.all(['movies', 'shows', 'bookings', 'users', 'screens'].map(c => demo.collection(c).deleteMany({})));
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
            weight: i < 25 ? 6 : i < 80 ? 2 : 1,
        };
    });
    await demo.collection('users').insertMany(users.map(({ weight, ...u }) => u));
    const weightedUsers = users.flatMap(u => Array(u.weight).fill(u._id));

    const moviePopularity = Object.fromEntries(movies.map(m => [String(m._id), 0.6 + random() * 0.8]));
    const now = new Date();
    const shows = [];
    const bookings = [];

    for (let offset = -DAYS_BACK; offset <= DAYS_AHEAD; offset++) {
        const dateStr = toCinemaDate(new Date(now.getTime() + offset * DAY_MS));
        const dayNumber = Math.floor(Date.parse(dateStr) / DAY_MS);
        const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
        const weekendBoost = weekday === 5 || weekday === 6 ? 1.3 : weekday === 0 ? 1.15 : 1;
        const growth = 0.85 + 0.3 * ((offset + DAYS_BACK) / (DAYS_BACK + DAYS_AHEAD));

        // Rotate which movies play each day, then pack them into the screens
        const todaysMovies = Array.from({ length: Math.min(MOVIES_PER_DAY, movies.length) }, (_, i) => movies[(dayNumber + i * 2) % movies.length]);
        const plannedShows = planDay(dateStr, DEFAULT_SCREENS, toPlannerMovies(todaysMovies));

        for (const planned of plannedShows) {
            const { movie: movieId, theaterType, showDateTime } = planned;
            const hour = Number(showDateTime.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, hour: '2-digit', hour12: false })) % 24;
            const showId = new mongoose.Types.ObjectId();
            const occupiedSeats = {};

            const isFuture = showDateTime > now;
            const presale = isFuture ? clamp(0.5 - (showDateTime - now) / (DAY_MS * 8), 0.1, 0.5) : 1;
            const target = clamp(
                timeDemand(hour) * ROOM_DEMAND[theaterType] * moviePopularity[movieId] * weekendBoost * growth * presale * (0.75 + random() * 0.5),
                0, 0.98,
            );
            const seatsToSell = Math.round(target * SEATS_PER_SHOW);
            const freeSeats = ROWS.flatMap(r => Array.from({ length: SEATS_PER_ROW }, (_, i) => `${r}${i + 1}`));

            let sold = 0;
            while (sold < seatsToSell && freeSeats.length) {
                const size = Math.min(pick([1, 2, 2, 2, 2, 3, 3, 4, 4, 5]), freeSeats.length, seatsToSell - sold);
                const start = Math.floor(random() * (freeSeats.length - size + 1));
                const seats = freeSeats.splice(start, size);
                const user = pick(weightedUsers);

                // Most people book within a few days of the show
                const leadDays = Math.min(random() ** 2 * 7, 13);
                let createdAt = new Date(showDateTime.getTime() - leadDays * DAY_MS - random() * 3_600_000);
                if (createdAt > now) createdAt = new Date(now.getTime() - random() * 6 * 3_600_000);

                const isPaid = random() > 0.08;
                if (isPaid) {
                    seats.forEach(seat => { occupiedSeats[seat] = user; });
                    sold += seats.length;
                }
                bookings.push({
                    user,
                    show: String(showId),
                    bookedSeat: seats,
                    amount: (BASE_PRICE + theaterPremiums[theaterType]) * seats.length,
                    isPaid,
                    createdAt,
                    updatedAt: createdAt,
                    __v: 0,
                });
            }

            shows.push({ ...planned, _id: showId, occupiedSeats, __v: 0 });
        }
    }

    await demo.collection('shows').insertMany(shows);
    for (let i = 0; i < bookings.length; i += 5000) {
        await demo.collection('bookings').insertMany(bookings.slice(i, i + 5000));
    }

    const paid = bookings.filter(b => b.isPaid);
    console.log(`Demo database "${DEMO_DB}" ready:`);
    console.log(`  ${movies.length} movies, ${users.length} customers, ${shows.length} shows`);
    console.log(`  ${bookings.length} bookings (${paid.length} paid), $${paid.reduce((s, b) => s + b.amount, 0).toLocaleString()} revenue`);
    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error('Seeding failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
});
