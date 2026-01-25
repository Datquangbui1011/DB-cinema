import express from "express";
import { protectAdmin } from "../middleware/auth.js";
import { isAdmin, getDashboardData, getAllBookings, getAllShows, uploadHeroPoster, deleteHeroPoster, getHeroPosters } from "../controllers/adminControllers.js";
import upload from "../middleware/multer.js";


const adminRouter = express.Router();

adminRouter.get("/is-admin", isAdmin);
adminRouter.get("/dashboard", getDashboardData);
adminRouter.get("/all-shows", getAllShows);
adminRouter.get("/all-bookings", getAllBookings);
adminRouter.post("/upload-hero", upload.single('image'), uploadHeroPoster);
adminRouter.post("/delete-hero", deleteHeroPoster);
adminRouter.get("/hero-posters", getHeroPosters);

export default adminRouter;

// fix admin routes