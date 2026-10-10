import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import User from "../models/User.js";
import HeroPoster from "../models/HeroPoster.js";
import { v2 as cloudinary } from 'cloudinary';
import { runMovieScheduler } from "../scheduler/movieScheduler.js";
import { ensureScreens } from "../configs/screens.js";

// API to check if user is admin

// Admin-area access check; `role` is set by protectStaff
export const isAdmin = async (req, res) => {
    res.json({ success: true, isAdmin: true, role: req.role })
}

// API to upload hero poster
export const uploadHeroPoster = async (req, res) => {
    try {
        const imageFile = req.file;
        const { deviceType } = req.body;

        if (!imageFile) {
            return res.json({ success: false, message: "No image provided" })
        }

        console.log("Starting Cloudinary upload for hero poster...");
        console.log("Cloudinary state:", cloudinary.config().cloud_name ? "Configured" : "NOT Configured");

        const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" });
        console.log("Upload successful:", imageUpload.secure_url);
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

// API to list active screens (creates the default line-up on first use)
export const getScreens = async (req, res) => {
    try {
        res.json({ success: true, screens: await ensureScreens() })
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

// API to trigger movie scheduler manually
export const triggerMovieScheduler = async (req, res) => {
    try {
        console.log('[Admin] Manually triggering movie scheduler…');
        const report = await runMovieScheduler();
        res.json({ success: true, report });
    } catch (error) {
        console.error('[Admin] Movie scheduler error:', error.message);
        res.json({ success: false, message: error.message });
    }
};
