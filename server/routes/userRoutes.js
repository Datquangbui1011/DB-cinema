import express from "express";
import { getUserBookings, updateFavoriteMovie, getFavorite } from "../controllers/userControllers.js";

const userRouter = express.Router();

userRouter.get("/bookings", getUserBookings);
userRouter.post("/update-favorite", updateFavoriteMovie);
userRouter.get("/favorites", getFavorite);
export default userRouter;