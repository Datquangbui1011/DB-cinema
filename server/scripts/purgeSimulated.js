/**
 * Remove everything the traffic simulator created: simulated bookings (and the
 * seats they hold), simulated customers, and the simulator's state.
 * Real customers and bookings are never touched.
 *
 * Dry run by default; pass --apply to delete.
 * Usage:  node scripts/purgeSimulated.js [--apply]
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Show from '../models/Show.js';
import SimulatorState from '../models/SimulatorState.js';

const apply = process.argv.includes('--apply');

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URI, process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {});
    console.log(`Database: ${mongoose.connection.db.databaseName}${apply ? '' : ' (dry run)'}`);

    const bookings = await Booking.find({ isSimulated: true }).select('show bookedSeat isPaid').lean();
    const users = await User.countDocuments({ isSimulated: true });
    const seats = bookings.filter(b => b.isPaid).reduce((sum, b) => sum + b.bookedSeat.length, 0);
    console.log(`Simulated: ${bookings.length} bookings holding ${seats} seats, ${users} customers`);

    if (apply) {
        // Free the seats on each show, then delete bookings and customers
        const seatsByShow = {};
        bookings.filter(b => b.isPaid).forEach(b => {
            seatsByShow[b.show] = [...(seatsByShow[b.show] || []), ...b.bookedSeat];
        });
        const ops = Object.entries(seatsByShow).map(([showId, showSeats]) => ({
            updateOne: {
                filter: { _id: showId },
                update: { $unset: Object.fromEntries(showSeats.map(s => [`occupiedSeats.${s}`, ''])) },
            },
        }));
        for (let i = 0; i < ops.length; i += 500) await Show.bulkWrite(ops.slice(i, i + 500));
        await Booking.deleteMany({ isSimulated: true });
        await User.deleteMany({ isSimulated: true });
        await SimulatorState.deleteMany({});
        console.log('Removed. Set SIMULATE_TRAFFIC=false (or remove it) so it does not start again.');
    } else {
        console.log('Dry run only. Re-run with --apply to remove them.');
    }
    await mongoose.disconnect();
};

main().catch(async (err) => {
    console.error('Purge failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
});
