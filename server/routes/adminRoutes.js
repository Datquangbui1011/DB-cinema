import express from "express";
import { protectAdmin } from "../middleware/auth.js";
import { isAdmin, getDashboardData, getAllBookings, getAllShows } from "../controllers/adminControllers.js";


const adminRouter = express.Router();

adminRouter.get("/is-admin", isAdmin);
adminRouter.get("/dashboard", getDashboardData);
adminRouter.get("/all-shows", getAllShows);
adminRouter.get("/all-bookings", getAllBookings);

export default adminRouter;

// fix admin routes