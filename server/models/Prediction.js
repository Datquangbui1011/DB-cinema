import mongoose from "mongoose";

// The demand model's latest forecast for one show. Updated in place while the
// show is upcoming, frozen once it starts, then `actualSeats` is filled in so
// the admin can see how accurate the model was.
const predictionSchema = new mongoose.Schema({
    show: { type: String, required: true, ref: 'Show' },
    movie: { type: String, required: true, ref: 'Movie' },
    screen: { type: String, ref: 'Screen', default: null },
    theaterType: { type: String },
    showDateTime: { type: Date, required: true },
    capacity: { type: Number, required: true },
    seatsSoldAtPrediction: { type: Number, required: true },
    hoursUntilAtPrediction: { type: Number, required: true },
    predictedSeats: { type: Number, required: true },
    low: { type: Number, required: true },              // 10th percentile
    high: { type: Number, required: true },             // 90th percentile
    predictedOccupancy: { type: Number, required: true },
    ticketPrice: { type: Number, required: true },       // price when predicted (show price + room premium)
    revenueSoFar: { type: Number, default: 0 },
    predictedRevenue: { type: Number, required: true },  // revenue so far + remaining seats x ticket price
    actualSeats: { type: Number, default: null },        // filled after the show starts
    // The first forecast made 1-3 days ahead and within a day, kept for accuracy by horizon
    // (the fields above are overwritten until the show starts)
    forecast72h: { seats: Number, low: Number, high: Number, sold: Number, hoursAhead: Number, at: Date },
    forecast24h: { seats: Number, low: Number, high: Number, sold: Number, hoursAhead: Number, at: Date },
    predictedAt: { type: Date, required: true },
    modelVersion: { type: String, required: true },
}, { timestamps: true });

predictionSchema.index({ show: 1 }, { unique: true });
predictionSchema.index({ showDateTime: 1 });                 // upcoming forecasts and accuracy by date
predictionSchema.index({ actualSeats: 1, showDateTime: 1 }); // finished shows still waiting for actuals

export default mongoose.model("Prediction", predictionSchema);
