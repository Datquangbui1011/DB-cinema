import express from "express";
import { createBooking, getOccupiedSeats, cancelBooking, verifyStripe, createPaymentSession } from "../controllers/bookingController.js";

const bookingRouter = express.Router();

bookingRouter.post("/create", createBooking);

bookingRouter.get("/seats/:showId", getOccupiedSeats);
bookingRouter.post("/cancel", cancelBooking);
bookingRouter.post("/verify", verifyStripe);
bookingRouter.post("/payment", createPaymentSession);

export default bookingRouter;
