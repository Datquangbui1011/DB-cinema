import express from "express";
import { protectAdmin, protectStaff } from "../middleware/auth.js";
import { isAdmin, getAllBookings, getAllShows, getScreens, uploadHeroPoster, deleteHeroPoster, getHeroPosters, triggerMovieScheduler } from "../controllers/adminControllers.js";
import { getOverview } from "../controllers/overviewController.js";
import upload from "../middleware/multer.js";


const adminRouter = express.Router();

// Read-only: admin and staff
adminRouter.get("/is-admin", protectStaff, isAdmin);
adminRouter.get("/overview", protectStaff, getOverview);
adminRouter.get("/all-shows", protectStaff, getAllShows);
adminRouter.get("/screens", protectStaff, getScreens);
adminRouter.get("/all-bookings", protectStaff, getAllBookings);

// Public: homepage slideshow
adminRouter.get("/hero-posters", getHeroPosters);

// Changes data: admin only
adminRouter.post("/upload-hero", protectAdmin, upload.single('image'), uploadHeroPoster);
adminRouter.post("/delete-hero", protectAdmin, deleteHeroPoster);
adminRouter.post("/schedule-movies", protectAdmin, triggerMovieScheduler);

export default adminRouter;
