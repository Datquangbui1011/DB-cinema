import cron from 'node-cron';
import { releaseExpiredHolds } from '../services/bookings.js';

// Local development only: on Vercel, expired holds are released when a show's
// seats are viewed or booked, by Stripe's "expired" webhook, and by the daily cron.
const initBookingScheduler = () => {
    cron.schedule('* * * * *', async () => {
        try {
            const { released } = await releaseExpiredHolds();
            if (released) console.log(`[Holds] Released ${released} expired seat hold(s)`);
        } catch (error) {
            console.error('[Holds] Release failed:', error.message);
        }
    });
    console.log("Booking scheduler initialized.");
};

export default initBookingScheduler;
