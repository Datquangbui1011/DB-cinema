import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    title: { type: String, required: true },
    overview: { type: String, required: true },
    poster_path: { type: String, required: true },
    backdrop_path: { type: String, required: true },
    trailer_path: { type: String },
    release_date: { type: String, required: true },
    original_language: { type: String },
    tagline: { type: String },
    genres: { type: Array, required: true },
    casts: { type: Array, required: true },
    vote_average: { type: Number, required: true },
    runtime: { type: Number, required: true },
    // Paused movies are skipped by the scheduler
    paused: { type: Boolean, default: false },
}, { timestamps: true })

const Movie = mongoose.model("Movie", movieSchema);

export default Movie 