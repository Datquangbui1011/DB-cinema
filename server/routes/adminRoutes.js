import express from "express";
import { protectAdmin } from "../middleware/auth.js";
import { isAdmin, getDashboardData, getAllBookings, getAllShows, uploadHeroPoster, deleteHeroPoster, getHeroPosters, triggerMovieScheduler } from "../controllers/adminControllers.js";
import upload from "../middleware/multer.js";


const adminRouter = express.Router();

adminRouter.get("/is-admin", protectAdmin, isAdmin);
adminRouter.get("/dashboard", protectAdmin, getDashboardData);
adminRouter.get("/all-shows", protectAdmin, getAllShows);
adminRouter.get("/all-bookings", protectAdmin, getAllBookings);
adminRouter.post("/upload-hero", protectAdmin, upload.single('image'), uploadHeroPoster);
adminRouter.post("/delete-hero", protectAdmin, deleteHeroPoster);
adminRouter.get("/hero-posters", getHeroPosters);
adminRouter.post("/schedule-movies", protectAdmin, triggerMovieScheduler);

export default adminRouter;