import mongoose from "mongoose";
import { THEATER_TYPES, SEATS_PER_SHOW } from "../configs/theaterTypes.js";

// A physical auditorium. Every show plays on exactly one screen.
const screenSchema = new mongoose.Schema({
    _id: { type: String, required: true },           // e.g. "screen-5"
    name: { type: String, required: true },          // e.g. "Screen 5"
    number: { type: Number, required: true },
    theaterType: { type: String, enum: THEATER_TYPES, required: true },
    capacity: { type: Number, default: SEATS_PER_SHOW },
    active: { type: Boolean, default: true },
}, { timestamps: true });

const Screen = mongoose.model("Screen", screenSchema);

export default Screen;
