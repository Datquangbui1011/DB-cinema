
import mongoose from "mongoose";
import 'dotenv/config';
import User from "../models/User.js";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";

// Mock Data Generators
const generateUsers = (count) => {
    const users = [];
    for (let i = 0; i < count; i++) {
        users.push({
            _id: `user_mock_${i}_${Math.random().toString(36).substr(2, 9)}`,
            name: `User ${i}`,
            email: `user${i}@example.com`,
            image: `https://i.pravatar.cc/150?u=user${i}`
        });
    }
    return users;
};

const mockMoviesData = [
    {
        _id: "550", // Fight Club
        title: "Fight Club",
        overview: "A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.",
        poster_path: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        backdrop_path: "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
        release_date: "1999-10-15",
        genres: [{ id: 18, name: "Drama" }],
        casts: [],
        vote_average: 8.4,
        runtime: 139,
        theaterPremiums: 0
    },
    {
        _id: "27205", // Inception
        title: "Inception",
        overview: "Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life as payment for a task considered to be impossible: \"inception\", the implantation of another person's idea into a target's subconscious.",
        poster_path: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
        backdrop_path: "/s3TBrRGB1jav7szbG0JhovUg164.jpg",
        release_date: "2010-07-15",
        genres: [{ id: 28, name: "Action" }, { id: 878, name: "Science Fiction" }, { id: 12, "name": "Adventure" }],
        casts: [],
        vote_average: 8.3,
        runtime: 148,
        theaterPremiums: 5
    },
    {
        _id: "157336", // Interstellar
        title: "Interstellar",
        overview: "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.",
        poster_path: "/gEU2QniL6E8ahMcafCUYA875DD.jpg",
        backdrop_path: "/xJHokMBLzbDYDLUb889L3thlCIU.jpg",
        release_date: "2014-11-05",
        genres: [{ id: 12, name: "Adventure" }, { id: 18, name: "Drama" }, { id: 878, name: "Science Fiction" }],
        casts: [],
        vote_average: 8.3,
        runtime: 169,
        theaterPremiums: 15
    },
    // Add copies to reach 20 if needed, or just loop these
];

const generateShows = (movies, count) => {
    const shows = [];
    const theaterTypes = ['Standard', 'IMAX', 'Premium'];
    const now = new Date();
    
    // Generate dates spanning last 12 months + next 1 month
    for (let i = 0; i < count; i++) {
        const movie = movies[i % movies.length];
        const daysOffset = Math.floor(Math.random() * 395) - 365; // -365 to +30
        const showDate = new Date(now);
        showDate.setDate(showDate.getDate() + daysOffset);
        showDate.setHours(10 + Math.floor(Math.random() * 12), 0, 0, 0); // 10 AM to 10 PM

        const theaterType = theaterTypes[Math.floor(Math.random() * theaterTypes.length)];
        let showPrice = 10;
        if (theaterType === 'IMAX') showPrice += 5;
        if (theaterType === 'Premium') showPrice += 15;

        shows.push({
            movie: movie._id,
            showDateTime: showDate,
            showPrice: showPrice,
            theaterType: theaterType,
            occupiedSeats: {} // Will be populated by bookings
        });
    }
    return shows;
};

const generateBookings = (users, shows, count) => {
    const bookings = [];
    for (let i = 0; i < count; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const show = shows[Math.floor(Math.random() * shows.length)];
        const seats = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'D1'];
        const bookedSeat = [seats[Math.floor(Math.random() * seats.length)]];
        
        // Randomize date logic: creation date should be before show date but within reasonable range
        const bookingDate = new Date(show.showDateTime);
        bookingDate.setHours(bookingDate.getHours() - Math.floor(Math.random() * 24 * 10)); // Booked 0-10 days before

        bookings.push({
            user: user._id,
            show: show._id,
            bookedSeat: bookedSeat,
            amount: show.showPrice * bookedSeat.length,
            isPaid: true,
            createdAt: bookingDate,
            updatedAt: bookingDate,
            paymentLink: `cs_test_${Math.random().toString(36).substr(2)}`
        });
        
        // Update show occupied seats (mock simplified)
        // In real app, we'd merge this, but for analytics, just need the booking record mostly
    }
    return bookings;
};

const seedDatabase = async () => {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected!");

        console.log("Clearing existing data...");
        // await User.deleteMany({});
        // await Movie.deleteMany({});
        // await Show.deleteMany({});
        // await Booking.deleteMany({});
        // Commented out delete to be safe, but can enable if user wants full reset. 
        // For now, let's just ADD new test data.
        
        // Actually, to test scalability properly, we might want a clean slate or explicit test data.
        // Let's create a prefix or specific set.
        
        console.log("Generating Data...");
        
        const users = generateUsers(50);
        // Only insert if they don't exist to avoid collision if run multiple times without delete
        // For bulk insert, deleteMany is cleaner for testing.
        // I will use deleteMany for this script as it is a specific seeding intent.
        
        await User.deleteMany({ _id: { $regex: /^user_mock_/ } }); 
        await User.insertMany(users);
        console.log(`Inserted ${users.length} Users`);

        // Upsert movies
        for (const m of mockMoviesData) {
            await Movie.findByIdAndUpdate(m._id, m, { upsert: true, new: true });
        }
        console.log(`Upserted ${mockMoviesData.length} Movies`);
        // Fetch all movies to get IDs
        const allMovies = await Movie.find({});

        const shows = generateShows(allMovies, 1000);
        const createdShows = await Show.insertMany(shows);
        console.log(`Inserted ${createdShows.length} Shows`);

        const bookings = generateBookings(users, createdShows, 5000);
        await Booking.insertMany(bookings);
        console.log(`Inserted ${bookings.length} Bookings`);

        console.log("Seeding Complete!");
        process.exit(0);

    } catch (error) {
        console.error("Seeding Error:", error);
        process.exit(1);
    }
};

seedDatabase();
