import cron from 'node-cron';
import Booking from '../models/Booking.js';
import Show from '../models/Show.js';

const cancelUnpaidBookings = async () => {
    try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        // Find unpaid bookings older than 10 minutes
        const expiredBookings = await Booking.find({
            isPaid: false,
            createdAt: { $lt: tenMinutesAgo }
        });

        if (expiredBookings.length > 0) {
            console.log(`Found ${expiredBookings.length} expired bookings. Cancelling...`);

            for (const booking of expiredBookings) {
                try {
                    // Release seats
                    const showData = await Show.findById(booking.show);
                    if (showData) {
                        booking.bookedSeat.forEach(seat => {
                            delete showData.occupiedSeats[seat];
                        });
                        showData.markModified("occupiedSeats");
                        await showData.save();
                    }

                    // Delete booking
                    await Booking.findByIdAndDelete(booking._id);
                    console.log(`Cancelled booking ${booking._id}`);
                } catch (err) {
                    console.error(`Error cancelling booking ${booking._id}:`, err);
                }
            }
        }
    } catch (error) {
        console.error("Error in cancelUnpaidBookings job:", error);
    }
};

// Run every minute
const initBookingScheduler = () => {
    cron.schedule('* * * * *', cancelUnpaidBookings);
    console.log("Booking scheduler initialized.");
};

export default initBookingScheduler;
