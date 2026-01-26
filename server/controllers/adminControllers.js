import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import User from "../models/User.js";
import HeroPoster from "../models/HeroPoster.js";
import { v2 as cloudinary } from 'cloudinary';

// API to check if user is admin

export const isAdmin = async (req, res) => {
    res.json({ success: true, isAdmin: true })
}

//API to get dashboard data
export const getDashboardData = async (req, res) => {
    try {
        const bookings = await Booking.find({ isPaid: true });
        const activeShows = await Show.find({ showDateTime: { $gte: new Date() } }).populate("movie");
        const totalUser = await User.countDocuments();
        const dashBoardData = {
            totalBookings: bookings.length,
            totalRevenue: bookings.reduce((acc, booking) => acc + booking.amount, 0),
            activeShows,
            totalUser,
            revenueTrend: [],
            moviePopularity: []
        }

        // Calculate Revenue Trend (Last 7 Days)
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - i);
            return date.toISOString().split('T')[0];
        }).reverse();

        const revenueMap = bookings.reduce((acc, booking) => {
            const date = new Date(booking.createdAt).toISOString().split('T')[0];
            acc[date] = (acc[date] || 0) + booking.amount;
            return acc;
        }, {});

        dashBoardData.revenueTrend = last7Days.map(date => ({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: revenueMap[date] || 0
        }));

        // Calculate Movie Popularity
        // We need to populate bookings with movie info to get titles
        const bookingsWithMovie = await Booking.find({ isPaid: true }).populate({
            path: 'show',
            populate: { path: 'movie' }
        });

        const popularityMap = bookingsWithMovie.reduce((acc, booking) => {
            if (booking.show && booking.show.movie) {
                const title = booking.show.movie.title;
                acc[title] = (acc[title] || 0) + 1;
            }
            return acc;
        }, {});
        dashBoardData.moviePopularity = Object.entries(popularityMap)
            .map(([title, count]) => ({ title, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        res.json({ success: true, dashBoardData })
    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}

// API to upload hero poster
export const uploadHeroPoster = async (req, res) => {
    try {
        const imageFile = req.file;
        if (!imageFile) {
            return res.json({ success: false, message: "No image provided" })
        }

        if (!process.env.CLOUDINARY_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            return res.json({ success: false, message: "Cloudinary credentials are missing. Please add CLOUDINARY_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your .env file." })
        }

        const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" });
        const imageUrl = imageUpload.secure_url;

        const newHeroPoster = new HeroPoster({
            imageUrl,
            publicId: imageUpload.public_id,
        })

        await newHeroPoster.save();
        res.json({ success: true, message: "Hero poster uploaded successfully" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to delete hero poster
export const deleteHeroPoster = async (req, res) => {
    try {
        const { id } = req.body;
        const poster = await HeroPoster.findById(id);
        if (!poster) {
            return res.json({ success: false, message: "Poster not found" })
        }

        await cloudinary.uploader.destroy(poster.publicId);
        await HeroPoster.findByIdAndDelete(id);

        res.json({ success: true, message: "Hero poster deleted successfully" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to get all hero posters (for list and display)
export const getHeroPosters = async (req, res) => {
    try {
        const posters = await HeroPoster.find({ active: true }).sort({ createdAt: -1 });
        res.json({ success: true, posters })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}


//API to get all SHOWS
export const getAllShows = async (req, res) => {
    try {
        const shows = await Show.find({}).populate("movie").sort({ showDateTime: -1 });
        res.json({ success: true, shows })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

//API to get all BOOKINGS
export const getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({}).populate("user").populate({
            path: "show",
            populate: {
                path: "movie",
            }
        }).sort({ createdAt: -1 });
        res.json({ success: true, bookings })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}


