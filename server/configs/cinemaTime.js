// Showtimes are scheduled and grouped in cinema-local time; Vercel runs in UTC
export const CINEMA_TIMEZONE = 'America/Chicago';

// YYYY-MM-DD of a Date as seen in the cinema's timezone
export const toCinemaDate = (date) => date.toLocaleDateString('en-CA', { timeZone: CINEMA_TIMEZONE });
