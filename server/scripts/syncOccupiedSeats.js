import mongoose from "mongoose";
import 'dotenv/config';
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";

const syncOccupiedSeats = async () => {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected!");

        console.log("Fetching all bookings...");
        const bookings = await Booking.find({ isPaid: true });
        console.log(`Found ${bookings.length} paid bookings`);

        // Group bookings by show
        const showBookingsMap = new Map();
        
        bookings.forEach(booking => {
            const showId = booking.show.toString();
            if (!showBookingsMap.has(showId)) {
                showBookingsMap.set(showId, []);
            }
            showBookingsMap.get(showId).push(booking);
        });

        console.log(`Found bookings for ${showBookingsMap.size} unique shows`);
        console.log("Updating shows with occupied seats...");

        let updatedCount = 0;
        let errorCount = 0;

        for (const [showId, showBookings] of showBookingsMap.entries()) {
            try {
                const show = await Show.findById(showId);
                
                if (!show) {
                    console.log(`⚠️  Show ${showId} not found, skipping...`);
                    errorCount++;
                    continue;
                }

                // Build occupiedSeats object from all bookings for this show
                const occupiedSeats = {};
                showBookings.forEach(booking => {
                    booking.bookedSeat.forEach(seat => {
                        occupiedSeats[seat] = booking.user;
                    });
                });

                // Update the show
                show.occupiedSeats = occupiedSeats;
                show.markModified("occupiedSeats");
                await show.save();

                updatedCount++;
                console.log(`✅ Updated show ${showId} with ${Object.keys(occupiedSeats).length} occupied seats`);
            } catch (error) {
                console.error(`❌ Error updating show ${showId}:`, error.message);
                errorCount++;
            }
        }

        console.log("\n=== Sync Complete ===");
        console.log(`✅ Successfully updated: ${updatedCount} shows`);
        console.log(`❌ Errors: ${errorCount} shows`);
        console.log(`📊 Total seats synchronized: ${bookings.reduce((sum, b) => sum + b.bookedSeat.length, 0)}`);

        process.exit(0);

    } catch (error) {
        console.error("Sync Error:", error);
        process.exit(1);
    }
};

syncOccupiedSeats();
