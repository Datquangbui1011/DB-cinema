
import Booking from "../models/Booking.js";
import { clerkClient } from "@clerk/express";
import Movie from "../models/Movie.js";
//API controller function to get use bookings

export const getUserBookings = async (req, res) => {
    try {
        const user = req.auth().userId;
        const bookings = await Booking.find({ user }).populate({
            path: "show",
            populate: {
                path: "movie",
            }
        }).sort({ createdAt: -1 });
        res.json({ success: true, bookings })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: 'Something went wrong. Please try again.' })
    }
}


//API controller function to add favorite movie in CLerk uSER metadata
export const updateFavoriteMovie = async (req, res) => {
    try {
        const movieId = typeof req.body.movieId === 'string' || typeof req.body.movieId === 'number' ? String(req.body.movieId).slice(0, 20) : '';
        if (!/^\d+$/.test(movieId)) return res.json({ success: false, message: "Movie not found" });
        const userId = req.auth().userId;
        if (!userId) return res.json({ success: false, message: "Please sign in" });
        const user = await clerkClient.users.getUser(userId);
        const current = Array.isArray(user.privateMetadata?.favorites) ? user.privateMetadata.favorites : [];
        const favorites = current.includes(movieId) ? current.filter(item => item !== movieId) : [...current, movieId].slice(-200);
        // Merge only `favorites`: writing the whole privateMetadata back could restore a role
        // that an admin removed in the meantime
        await clerkClient.users.updateUserMetadata(userId, { privateMetadata: { favorites } });
        res.json({ success: true, message: "Favorite movie updated successfully" })

    } catch (error) {
        console.error('[Favorites]', error.message);
        res.json({ success: false, message: "Could not update favorites. Please try again." })
    }
}

export const getFavorite = async (req, res) => {
    try {
        const user = await clerkClient.users.getUser(req.auth().userId);
        const favorites = user.privateMetadata.favorites;

        //Getting movie from database
        const movies = await Movie.find({ _id: { $in: favorites } });
        res.json({ success: true, movies })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: 'Something went wrong. Please try again.' })
    }
}