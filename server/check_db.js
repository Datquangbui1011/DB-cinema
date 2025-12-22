import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Show from './models/Show.js';
import Movie from './models/Movie.js';

dotenv.config();

const checkDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const movieCount = await Movie.countDocuments();
        const showCount = await Show.countDocuments();

        console.log(`Movies in DB: ${movieCount}`);
        console.log(`Shows in DB: ${showCount}`);

        if (movieCount > 0) {
            const movies = await Movie.find().limit(5);
            console.log('Sample Movies:', movies.map(m => m.title));
        }

        if (showCount > 0) {
            const shows = await Show.find().limit(5).populate('movie');
            console.log('Sample Shows:', shows.map(s => ({
                movie: s.movie?.title,
                dateTime: s.showDateTime
            })));

            const upcomingShows = await Show.countDocuments({ showDateTime: { $gte: new Date() } });
            console.log(`Upcoming Shows: ${upcomingShows}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

checkDB();
