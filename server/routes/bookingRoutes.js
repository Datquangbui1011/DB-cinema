import express from "express";
import { createBooking, getOccupiedSeats, cancelBooking, verifyStripe, createPaymentSession } from "../controllers/bookingController.js";

const bookingRouter = express.Router();

// All routes use clerkMiddleware from server.js
// Authentication is checked manually in controller functions
bookingRouter.post("/create", createBooking);
bookingRouter.post("/cancel", cancelBooking);
bookingRouter.post("/payment", createPaymentSession);
bookingRouter.get("/seats/:showId", getOccupiedSeats);
bookingRouter.post("/verify", verifyStripe);

export default bookingRouter;
