// Cinema-local dates that behave like holidays (busier daytime, long weekends).
// Used as an `isHoliday` model feature; the demo seeder also uses `demoBoost`
// to simulate the extra demand. Add future dates here as the calendar moves on.
export const HOLIDAYS = [
    { date: '2026-09-05', name: 'Labor Day weekend', demoBoost: 1.2 },
    { date: '2026-09-06', name: 'Labor Day weekend', demoBoost: 1.25 },
    { date: '2026-09-07', name: 'Labor Day', demoBoost: 1.4 },
    { date: '2026-10-12', name: "Indigenous Peoples' Day", demoBoost: 1.25 },
    { date: '2026-10-31', name: 'Halloween', demoBoost: 1.2 },
    { date: '2026-11-11', name: 'Veterans Day', demoBoost: 1.15 },
    { date: '2026-11-26', name: 'Thanksgiving', demoBoost: 1.3 },
    { date: '2026-11-27', name: 'Black Friday', demoBoost: 1.5 },
    { date: '2026-12-24', name: 'Christmas Eve', demoBoost: 0.8 },
    { date: '2026-12-25', name: 'Christmas Day', demoBoost: 1.5 },
    { date: '2026-12-26', name: 'Holiday break', demoBoost: 1.4 },
    { date: '2026-12-31', name: "New Year's Eve", demoBoost: 0.85 },
    { date: '2027-01-01', name: "New Year's Day", demoBoost: 1.35 },
];

const BY_DATE = new Map(HOLIDAYS.map(h => [h.date, h]));

// `dateStr` is a cinema-local YYYY-MM-DD (see toCinemaDate)
export const holidayOn = (dateStr) => BY_DATE.get(dateStr) || null;
export const isHoliday = (dateStr) => BY_DATE.has(dateStr);
