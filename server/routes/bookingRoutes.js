import express from "express";
import { createBooking, getOccupiedSeats, cancelBooking } from "../controllers/bookingController.js";

const bookingRouter = express.Router();

bookingRouter.post("/create", createBooking);

bookingRouter.get("/seats/:showId", getOccupiedSeats);
bookingRouter.post("/cancel", cancelBooking);

export default bookingRouter;
