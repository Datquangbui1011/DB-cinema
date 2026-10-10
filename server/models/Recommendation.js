import mongoose from "mongoose";

const optionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
    impact: { revenue: Number, tickets: Number },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },   // what apply.js needs
}, { _id: false });

// One piece of advice from the AI Advisor about one show. Pending advice is
// regenerated on every advisor run; advice that no longer applies expires.
const recommendationSchema = new mongoose.Schema({
    show: { type: String, required: true, ref: 'Show' },
    movie: { type: String, ref: 'Movie' },
    showDateTime: { type: Date, required: true },
    type: { type: String, enum: ['add_showtime', 'upgrade_room', 'promotion', 'cancel'], required: true },
    priority: { type: String, enum: ['high', 'medium', 'low'], required: true },
    title: { type: String, required: true },
    reason: { type: String, required: true },
    assumptions: { type: [String], default: [] },
    options: { type: [optionSchema], default: [] },
    bestImpact: { type: Number, default: 0 },          // highest option revenue impact, for sorting
    status: { type: String, enum: ['pending', 'applied', 'dismissed', 'expired', 'undone'], default: 'pending' },
    chosenOption: { type: String, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },   // { before, after, createdShowIds }
    undo: { type: mongoose.Schema.Types.Mixed, default: null },     // how to reverse it
    appliedBy: { type: String, default: null },        // Clerk user id, or "autopilot"
    appliedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },           // when dismissed or expired
    closedBy: { type: String, default: null },         // who dismissed it
    applyingAt: { type: Date, default: null },         // set while an apply is in progress (prevents double applies)
    forecast: { seats: Number, low: Number, high: Number, occupancy: Number, sold: Number },
    modelVersion: { type: String },
}, { timestamps: true, minimize: false });

recommendationSchema.index({ status: 1, priority: 1 });
recommendationSchema.index({ show: 1, status: 1 });
// At most one pending recommendation per show and type, even if two runs overlap
recommendationSchema.index({ show: 1, type: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
recommendationSchema.index({ status: 1, appliedAt: -1 });

export default mongoose.model("Recommendation", recommendationSchema);
