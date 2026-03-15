/**
 * Standalone script to run the Movie Scheduler once.
 * Usage:  node scripts/runMovieScheduler.js
 *    or:  npm run schedule-movies
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import { runMovieScheduler } from '../scheduler/movieScheduler.js';

const main = async () => {
    try {
        console.log('Connecting to MongoDB…');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected!\n');

        const report = await runMovieScheduler();

        console.log('\n═══ Final Report ═══');
        console.log(JSON.stringify(report, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Script failed:', err);
        process.exit(1);
    }
};

main();
