/**
 * Export training rows for the demand model to ml/data/training.csv.
 *
 * Every show that has already started becomes up to 4 rows, one per snapshot
 * taken 72h, 24h, 6h and 1h before it starts. Each row holds the features as
 * they were known at that moment (seats sold so far, history of earlier shows)
 * and the label: the show's final paid seats.
 *
 * Reads the simulated demo database by default; the live database needs --allow-live.
 *
 * Usage:  npm run ml:export
 *         node scripts/exportTrainingData.js [--db demo_dbcinema] [--out path/to/training.csv]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import 'dotenv/config';
import { buildFeatures, createHistory, FEATURE_NAMES } from '../ml/features.js';

const SNAPSHOT_HOURS = [72, 24, 6, 1];
const HOUR_MS = 3_600_000;

const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : undefined;
};
const dbName = arg('db') || process.env.MONGODB_DB || 'demo_dbcinema';
const outFile = path.resolve(arg('out') || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ml/data/training.csv'));

if (!dbName.startsWith('demo') && !process.argv.includes('--allow-live')) {
    console.error(`Refusing to export from "${dbName}": train on a demo database, or pass --allow-live.`);
    process.exit(1);
}

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URI, { dbName });
    const db = mongoose.connection.db;
    const now = new Date();

    const [movies, shows, bookings] = await Promise.all([
        db.collection('movies').find({}, { projection: { release_date: 1, runtime: 1, vote_average: 1, genres: 1 } }).toArray(),
        db.collection('shows').find({ showDateTime: { $lte: now } }, { projection: { occupiedSeats: 0 } }).toArray(),
        db.collection('bookings').find({ isPaid: true }, { projection: { show: 1, bookedSeat: 1, createdAt: 1 } }).toArray(),
    ]);
    const movieById = new Map(movies.map(m => [String(m._id), m]));

    // Paid bookings per show, oldest first
    const salesByShow = new Map();
    for (const b of bookings) {
        if (!salesByShow.has(b.show)) salesByShow.set(b.show, []);
        salesByShow.get(b.show).push({ at: b.createdAt.getTime(), seats: b.bookedSeat.length });
    }
    for (const list of salesByShow.values()) list.sort((a, b) => a.at - b.at);

    const played = shows
        .filter(s => movieById.has(String(s.movie)))
        .map(s => ({ ...s, seatsSold: (salesByShow.get(String(s._id)) || []).reduce((n, b) => n + b.seats, 0) }));
    const history = createHistory(played);

    const header = ['showId', 'showDateTime', 'snapshotHours', ...FEATURE_NAMES, 'finalSeats'];
    const lines = [header.join(',')];
    for (const show of played) {
        const sales = salesByShow.get(String(show._id)) || [];
        for (const hours of SNAPSHOT_HOURS) {
            const at = new Date(show.showDateTime.getTime() - hours * HOUR_MS);
            const seatsSoldNow = sales.reduce((n, b) => b.at < at.getTime() ? n + b.seats : n, 0);
            const features = buildFeatures({ show, movie: movieById.get(String(show.movie)), seatsSoldNow, at, history });
            lines.push([show._id, show.showDateTime.toISOString(), hours, ...features.map(v => Number.isInteger(v) ? v : v.toFixed(5)), show.seatsSold].join(','));
        }
    }

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, lines.join('\n') + '\n');
    console.log(`Exported ${lines.length - 1} rows (${played.length} shows x ${SNAPSHOT_HOURS.length} snapshots, ${FEATURE_NAMES.length} features) from "${dbName}" to ${outFile}`);
    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error('Export failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
});
