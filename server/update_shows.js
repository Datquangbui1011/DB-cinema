import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Show from './models/Show.js';

dotenv.config();

const updateShows = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const now = new Date();
        const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

        const result = await Show.updateMany(
            {},
            { $set: { showDateTime: futureDate } }
        );

        console.log(`Updated ${result.modifiedCount} shows to ${futureDate}`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

updateShows();
