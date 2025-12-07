import express from "express";
import { requireAuth } from "@clerk/express";
import { createBooking, getOccupiedSeats, cancelBooking, verifyStripe, createPaymentSession } from "../controllers/bookingController.js";

const bookingRouter = express.Router();

// Protected routes - require authentication
bookingRouter.post("/create", requireAuth(), createBooking);
bookingRouter.post("/cancel", requireAuth(), cancelBooking);
bookingRouter.post("/payment", requireAuth(), createPaymentSession);

// Public routes - no authentication required
bookingRouter.get("/seats/:showId", getOccupiedSeats);
bookingRouter.post("/verify", verifyStripe);

export default bookingRouter;
