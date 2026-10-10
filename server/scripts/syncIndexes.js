/**
 * Make each collection's indexes match the schema definitions: create missing
 * ones and drop ones no longer defined (e.g. single-field indexes now covered
 * by a compound index). Dry run by default; pass --apply to change them.
 *
 * Usage:  node scripts/syncIndexes.js [--apply]
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Booking from '../models/Booking.js';
import Show from '../models/Show.js';
import User from '../models/User.js';
import Movie from '../models/Movie.js';
import Screen from '../models/Screen.js';

const apply = process.argv.includes('--apply');

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URI, process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {});
    console.log(`Database: ${mongoose.connection.db.databaseName}${apply ? '' : ' (dry run)'}`);

    for (const model of [Booking, Show, User, Movie, Screen]) {
        const { toCreate, toDrop } = await model.diffIndexes();
        const name = model.collection.collectionName;
        if (!toCreate.length && !toDrop.length) {
            console.log(`${name}: up to date`);
            continue;
        }
        console.log(`${name}: create ${JSON.stringify(toCreate)} drop ${JSON.stringify(toDrop)}`);
        if (apply) await model.syncIndexes();
    }
    console.log(apply ? 'Indexes synced.' : 'Dry run only. Re-run with --apply to change indexes.');
    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error('Index sync failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
});
