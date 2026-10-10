import mongoose from "mongoose";

// One counter per caller per time window; MongoDB deletes them once they expire
const rateLimitSchema = new mongoose.Schema({
    _id: { type: String, required: true },     // "<name>:<caller>:<window start>"
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
}, { versionKey: false });

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RateLimit", rateLimitSchema);
