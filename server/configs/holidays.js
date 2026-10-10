// Cinema-local dates that behave like holidays (busier daytime, long weekends).
// Used as an `isHoliday` model feature; the demand simulator uses `demoBoost`
// for the extra demand. Covers through New Year 2028; extend it before then.
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
    { date: '2027-01-18', name: 'Martin Luther King Jr. Day', demoBoost: 1.2 },
    { date: '2027-02-14', name: "Valentine's Day", demoBoost: 1.25 },
    { date: '2027-02-15', name: "Presidents' Day", demoBoost: 1.2 },
    { date: '2027-03-15', name: 'Spring break', demoBoost: 1.2 },
    { date: '2027-03-16', name: 'Spring break', demoBoost: 1.2 },
    { date: '2027-03-17', name: 'Spring break', demoBoost: 1.2 },
    { date: '2027-03-18', name: 'Spring break', demoBoost: 1.2 },
    { date: '2027-03-19', name: 'Spring break', demoBoost: 1.2 },
    { date: '2027-05-29', name: 'Memorial Day weekend', demoBoost: 1.2 },
    { date: '2027-05-30', name: 'Memorial Day weekend', demoBoost: 1.25 },
    { date: '2027-05-31', name: 'Memorial Day', demoBoost: 1.4 },
    { date: '2027-06-18', name: 'Juneteenth (observed)', demoBoost: 1.15 },
    { date: '2027-07-04', name: 'Independence Day', demoBoost: 0.85 },
    { date: '2027-07-05', name: 'Independence Day (observed)', demoBoost: 1.3 },
    { date: '2027-09-04', name: 'Labor Day weekend', demoBoost: 1.2 },
    { date: '2027-09-05', name: 'Labor Day weekend', demoBoost: 1.25 },
    { date: '2027-09-06', name: 'Labor Day', demoBoost: 1.4 },
    { date: '2027-10-11', name: "Indigenous Peoples' Day", demoBoost: 1.25 },
    { date: '2027-10-31', name: 'Halloween', demoBoost: 1.2 },
    { date: '2027-11-11', name: 'Veterans Day', demoBoost: 1.15 },
    { date: '2027-11-25', name: 'Thanksgiving', demoBoost: 1.3 },
    { date: '2027-11-26', name: 'Black Friday', demoBoost: 1.5 },
    { date: '2027-12-24', name: 'Christmas Eve', demoBoost: 0.8 },
    { date: '2027-12-25', name: 'Christmas Day', demoBoost: 1.5 },
    { date: '2027-12-26', name: 'Holiday break', demoBoost: 1.4 },
    { date: '2027-12-31', name: "New Year's Eve", demoBoost: 0.85 },
    { date: '2028-01-01', name: "New Year's Day", demoBoost: 1.35 },
];

const BY_DATE = new Map(HOLIDAYS.map(h => [h.date, h]));

// `dateStr` is a cinema-local YYYY-MM-DD (see toCinemaDate)
export const holidayOn = (dateStr) => BY_DATE.get(dateStr) || null;
export const isHoliday = (dateStr) => BY_DATE.has(dateStr);
