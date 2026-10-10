import mongoose from "mongoose";
import { THEATER_TYPES } from "../configs/theaterTypes.js";

const showSchema = new mongoose.Schema({
    movie: { type: String, required: true, ref: 'Movie' },
    showDateTime: { type: Date, required: true },
    showPrice: { type: Number, required: true },
    theaterType: { type: String, enum: THEATER_TYPES, default: 'Standard' },
    occupiedSeats: { type: Object, default: {} },
}, { minimize: false })

showSchema.index({ showDateTime: 1 });
showSchema.index({ movie: 1, showDateTime: 1 });

const Show = mongoose.model("Show", showSchema);

export default Show;
