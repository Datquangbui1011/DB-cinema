/**
 * One-off migration: replace upcoming shows that have no screen (from the old
 * fixed-slot scheduler) with a screen-based schedule for the same movies.
 *
 * - Only days from tomorrow onward are touched; today is left as is.
 * - Shows with any booked seat or booking are kept.
 * - Dry run by default; pass --apply to make changes.
 *
 * Usage:  node scripts/migrateToScreens.js [--apply]
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Show from '../models/Show.js';
import Movie from '../models/Movie.js';
import Booking from '../models/Booking.js';
import Screen from '../models/Screen.js';
import { ensureScreens, DEFAULT_SCREENS } from '../configs/screens.js';
import { toCinemaDate, startOfCinemaDay } from '../configs/cinemaTime.js';
import { planDay, toPlannerMovies } from '../scheduler/screenPlanner.js';

const apply = process.argv.includes('--apply');
const DAY_MS = 86_400_000;

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URI, process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {});
    console.log(`Database: ${mongoose.connection.db.databaseName}${apply ? '' : ' (dry run)'}`);

    const tomorrow = startOfCinemaDay(new Date(Date.now() + DAY_MS));
    const legacy = await Show.find({ screen: null, showDateTime: { $gte: tomorrow } }).lean();
    if (legacy.length === 0) {
        console.log('No upcoming shows without a screen. Nothing to migrate.');
        return mongoose.disconnect();
    }

    const bookedIds = new Set((await Booking.distinct('show', { show: { $in: legacy.map(s => String(s._id)) } })).map(String));
    const isBooked = s => bookedIds.has(String(s._id)) || Object.keys(s.occupiedSeats || {}).length > 0;

    // Keep the same movie line-up, in the order they currently appear
    const movieIds = [...new Set(legacy.map(s => s.movie))];
    const movieDocs = await Movie.find({ _id: { $in: movieIds } }).select('_id title runtime genres').lean();
    const movies = toPlannerMovies(movieIds.map(id => movieDocs.find(m => String(m._id) === id)).filter(Boolean));
    // Dry runs must not write, so preview with the default line-up if no screens exist yet
    const screens = apply || await Screen.estimatedDocumentCount() > 0 ? await ensureScreens() : DEFAULT_SCREENS;

    const days = [...new Set(legacy.map(s => toCinemaDate(s.showDateTime)))].sort();
    let totalDeleted = 0, totalKept = 0, totalCreated = 0;

    for (const day of days) {
        const dayShows = legacy.filter(s => toCinemaDate(s.showDateTime) === day);
        const kept = dayShows.filter(isBooked);
        const removable = dayShows.filter(s => !isBooked(s));
        const planned = planDay(day, screens, movies);

        console.log(`${day}: ${dayShows.length} old shows -> delete ${removable.length}, keep ${kept.length} (booked); create ${planned.length} screen shows`);
        totalDeleted += removable.length;
        totalKept += kept.length;
        totalCreated += planned.length;

        if (apply) {
            await Show.deleteMany({ _id: { $in: removable.map(s => s._id) }, occupiedSeats: {} });
            await Show.insertMany(planned);
        }
    }

    console.log(`\nTotal: delete ${totalDeleted}, keep ${totalKept}, create ${totalCreated} across ${movies.length} movies and ${screens.length} screens.`);
    console.log(apply ? 'Applied.' : 'Dry run only. Re-run with --apply to make these changes.');
    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error('Migration failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
});
