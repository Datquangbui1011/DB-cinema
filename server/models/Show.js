import mongoose from "mongoose";
import { THEATER_TYPES } from "../configs/theaterTypes.js";

const showSchema = new mongoose.Schema({
    movie: { type: String, required: true, ref: 'Movie' },
    showDateTime: { type: Date, required: true },
    showPrice: { type: Number, required: true },
    theaterType: { type: String, enum: THEATER_TYPES, default: 'Standard' },
    screen: { type: String, ref: 'Screen', default: null }, // older shows have no screen
    occupiedSeats: { type: Object, default: {} },
    // Set by an AI Advisor promotion: showPrice is lowered and originalPrice kept to restore it
    promotion: { type: Object, default: null },   // { percent, originalPrice, startedAt, endsAt, recommendationId }
}, { minimize: false })

showSchema.index({ showDateTime: 1 });                  // schedules and date ranges
showSchema.index({ movie: 1, showDateTime: 1 });        // a movie's showtimes
showSchema.index({ screen: 1, showDateTime: 1 });       // a screen's timeline and conflict checks
showSchema.index({ theaterType: 1, showDateTime: 1 });  // filtering by room type

const Show = mongoose.model("Show", showSchema);

export default Show;
