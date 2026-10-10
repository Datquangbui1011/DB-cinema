import Screen from "../models/Screen.js";
import { SEATS_PER_SHOW } from "./theaterTypes.js";

// The cinema's auditoriums, created on first use
const DEFAULT_LINEUP = [
    'Standard', 'Standard', 'Standard', 'Standard',
    'IMAX', 'Dolby Cinema', '4DX', 'ScreenX',
    'VIP Recliner', 'VIP Recliner', 'Premium', 'Kids & Family',
];

export const DEFAULT_SCREENS = DEFAULT_LINEUP.map((theaterType, i) => ({
    _id: `screen-${i + 1}`,
    name: `Screen ${i + 1}`,
    number: i + 1,
    theaterType,
    capacity: SEATS_PER_SHOW,
    active: true,
}));

// Opening hours per room type, as cinema-local minutes after midnight.
// `lastStart` is the latest a show may begin.
const DEFAULT_HOURS = { open: 10 * 60, lastStart: 22 * 60 + 30 };
export const ROOM_HOURS = {
    'VIP Recliner': { open: 16 * 60, lastStart: 22 * 60 + 30 },   // 21+, evenings only
    'Kids & Family': { open: 10 * 60, lastStart: 18 * 60 + 30 },  // daytime only
};
export const hoursFor = (theaterType) => ROOM_HOURS[theaterType] || DEFAULT_HOURS;

// Minutes between one show ending and the next starting on the same screen
export const CLEANING_MINUTES = 30;

// Make sure the default screens exist; returns active screens in number order
export const ensureScreens = async () => {
    if (await Screen.estimatedDocumentCount() === 0) {
        await Screen.insertMany(DEFAULT_SCREENS);
        console.log(`[Screens] Created ${DEFAULT_SCREENS.length} default screens`);
    }
    return Screen.find({ active: true }).sort({ number: 1 }).lean();
};
