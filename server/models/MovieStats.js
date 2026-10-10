import mongoose from "mongoose";

// One snapshot of a film's TMDB popularity per cinema-local day. TMDB only ever
// returns today's numbers, so keeping a dated history is what lets a future
// model use popularity without seeing the future: a forecast made on day D may
// only use snapshots taken before D (see scheduler/movieStats.js → statsAsOf).
const movieStatsSchema = new mongoose.Schema({
    movie: { type: String, required: true, ref: 'Movie' },
    date: { type: String, required: true },          // cinema-local YYYY-MM-DD the snapshot was taken
    popularity: { type: Number, default: null },
    voteAverage: { type: Number, default: null },
    voteCount: { type: Number, default: null },
    source: { type: String },                         // now_playing | upcoming | details
    capturedAt: { type: Date, required: true },
}, { timestamps: false });

movieStatsSchema.index({ movie: 1, date: 1 }, { unique: true });
movieStatsSchema.index({ date: 1 });

export default mongoose.model("MovieStats", movieStatsSchema);
