
import Booking from "../models/Booking.js";
import { clerkClient } from "@clerk/express";
import Movie from "../models/Movie.js";
//API controller function to get use bookings

export const getUserBookings = async (req, res) => {
    try {
        const user = req.auth().userId;
        console.log("Fetching bookings for user:", user);
        const bookings = await Booking.find({ user }).populate({
            path: "show",
            populate: {
                path: "movie",
            }
        }).sort({ createdAt: -1 });
        console.log("Found bookings:", bookings);
        res.json({ success: true, bookings })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}


//API controller function to add favorite movie in CLerk uSER metadata
export const updateFavoriteMovie = async (req, res) => {
    try {
        const { movieId } = req.body;
        const userId = req.auth().userId;
        const user = await clerkClient.users.getUser(userId);
        if (!user.privateMetadata.favorites) {
            user.privateMetadata.favorites = [];
        }
        if (!user.privateMetadata.favorites.includes(movieId)) {
            user.privateMetadata.favorites.push(movieId);
        } else {
            user.privateMetadata.favorites = user.privateMetadata.favorites.filter((item) => item !== movieId);
        }
        await clerkClient.users.updateUser(userId, { privateMetadata: user.privateMetadata });
        res.json({ success: true, message: "Favorite movie updated successfully" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
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
        res.json({ success: false, message: error.message })
    }
}