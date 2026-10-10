import mongoose from "mongoose";

// AI Advisor autopilot: which low-risk recommendations the nightly run may
// apply without a click. Adding showtimes and room changes always need a person.
const advisorSettingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'advisor' },
    autopilot: {
        promotion: { type: Boolean, default: false },
        cancel: { type: Boolean, default: false },
    },
    maxAutoActionsPerDay: { type: Number, default: 5, min: 0, max: 20 },
    maxAutoDiscountPercent: { type: Number, enum: [10, 20, 30], default: 20 },
    updatedBy: { type: String, default: null },
}, { timestamps: true });

const AdvisorSettings = mongoose.model("AdvisorSettings", advisorSettingsSchema);

export const getAdvisorSettings = async () =>
    (await AdvisorSettings.findById('advisor').lean()) || new AdvisorSettings().toObject();

export default AdvisorSettings;
