// Showtimes are scheduled and grouped in cinema-local time; Vercel runs in UTC
export const CINEMA_TIMEZONE = 'America/Chicago';

// YYYY-MM-DD of a Date as seen in the cinema's timezone
export const toCinemaDate = (date) => date.toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE });

// Convert a wall-clock date (YYYY-MM-DD) + time (HH:MM) in CINEMA_TIMEZONE to a UTC Date
export const zonedTimeToUtc = (dateStr, time = '00:00') => {
    const asUtc = new Date(`${dateStr}T${time}:00Z`);
    const inZone = new Date(asUtc.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE }));
    const inUtc = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(asUtc.getTime() + (inUtc - inZone));
};

// Midnight (cinema-local) at the start of the day `daysAgo` days before `date`
export const startOfCinemaDay = (date = new Date(), daysAgo = 0) => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return zonedTimeToUtc(toCinemaDate(d));
};
