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
        const { period = 'day' } = req.query; // Get period from query params, default to 'day'
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

        // Calculate Revenue Trend based on period
        let periods = [];
        let revenueMap = {};
        
        if (period === 'day') {
            // Last 7 Days
            periods = Array.from({ length: 7 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - i);
                return date.toISOString().split('T')[0];
            }).reverse();

            revenueMap = bookings.reduce((acc, booking) => {
                const date = new Date(booking.createdAt).toISOString().split('T')[0];
                acc[date] = (acc[date] || 0) + booking.amount;
                return acc;
            }, {});

            dashBoardData.revenueTrend = periods.map(date => ({
                date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                revenue: revenueMap[date] || 0
            }));
        } else if (period === 'month') {
            // Last 12 Months
            periods = Array.from({ length: 12 }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }).reverse();

            revenueMap = bookings.reduce((acc, booking) => {
                const date = new Date(booking.createdAt);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                acc[monthKey] = (acc[monthKey] || 0) + booking.amount;
                return acc;
            }, {});

            dashBoardData.revenueTrend = periods.map(monthKey => {
                const [year, month] = monthKey.split('-');
                const date = new Date(year, month - 1);
                return {
                    date: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                    revenue: revenueMap[monthKey] || 0
                };
            });
        } else if (period === 'year') {
            // Last 5 Years
            periods = Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return String(year);
            }).reverse();

            revenueMap = bookings.reduce((acc, booking) => {
                const year = String(new Date(booking.createdAt).getFullYear());
                acc[year] = (acc[year] || 0) + booking.amount;
                return acc;
            }, {});

            dashBoardData.revenueTrend = periods.map(year => ({
                date: year,
                revenue: revenueMap[year] || 0
            }));
        }

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
        const { deviceType } = req.body;

        if (!imageFile) {
            return res.json({ success: false, message: "No image provided" })
        }

        if (!process.env.CLOUDINARY_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            return res.json({ success: false, message: "Cloudinary credentials are missing." })
        }

        const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" });
        const imageUrl = imageUpload.secure_url;

        const newHeroPoster = new HeroPoster({
            imageUrl,
            publicId: imageUpload.public_id,
            deviceType: deviceType || 'desktop'
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
        console.log("Attempting to delete poster with ID:", id);
        
        const poster = await HeroPoster.findById(id);
        if (!poster) {
            console.log("Poster not found in DB");
            return res.json({ success: false, message: "Poster not found" })
        }

        // Try to delete from Cloudinary, but don't block DB deletion if it fails
        if (poster.publicId) {
            try {
                console.log("Deleting from Cloudinary...", poster.publicId);
                await cloudinary.uploader.destroy(poster.publicId);
                console.log("Deleted from Cloudinary");
            } catch (cloudError) {
                console.error("Failed to delete from Cloudinary:", cloudError);
                // Continue to delete from DB anyway
            }
        }

        await HeroPoster.findByIdAndDelete(id);
        console.log("Poster deleted from DB");

        res.json({ success: true, message: "Hero poster deleted successfully" })

    } catch (error) {
        console.log("Error in deleteHeroPoster:", error)
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


