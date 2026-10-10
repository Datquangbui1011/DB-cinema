const currency = import.meta.env.VITE_CURRENCY || '$';
const CINEMA_TIMEZONE = 'America/Chicago';

export const formatMoney = (value = 0, { compact = false } = {}) => {
    if (compact && Math.abs(value) >= 1000) {
        return `${currency}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
    }
    // Whole amounts without cents ($12); otherwise always two decimals ($9.60, not $9.6)
    const cents = Math.round(Number(value) * 100) % 100 !== 0;
    return `${currency}${Number(value).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
};

export const formatNumber = (value = 0) => Number(value).toLocaleString('en-US');

export const formatPercent = (value = 0, digits = 0) => `${(value * 100).toFixed(digits)}%`;

// Times are shown in the cinema's timezone regardless of the viewer's
export const formatTime = (date) =>
    new Date(date).toLocaleTimeString('en-US', { timeZone: CINEMA_TIMEZONE, hour: 'numeric', minute: '2-digit' });

export const formatDateTime = (date) =>
    new Date(date).toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatRelative = (date, now = Date.now()) => {
    const seconds = Math.round((now - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
};

export const cinemaClock = (date = new Date()) =>
    date.toLocaleString('en-US', { timeZone: CINEMA_TIMEZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// TMDB paths are stored either as full URLs or as "/abc.jpg"
export const posterUrl = (path, size = 'w185') => {
    if (!path) return null;
    return path.startsWith('http') ? path : `https://image.tmdb.org/t/p/${size}${path}`;
};
