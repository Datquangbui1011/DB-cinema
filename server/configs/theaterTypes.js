// Single source of truth for room types and their per-ticket price adjustment
// (added on top of a show's base price). Keep in sync with client/src/lib/theaterTypes.js
export const theaterPremiums = {
    'Standard': 0,
    'IMAX': 5,
    'Dolby Cinema': 6,
    '4DX': 8,
    'ScreenX': 4,
    'VIP Recliner': 10,
    'Premium': 15,
    'Kids & Family': -2,
};

export const THEATER_TYPES = Object.keys(theaterPremiums);

// Every room currently uses the same 10-row x 9-seat map (rows A-J)
export const SEATS_PER_SHOW = 90;
