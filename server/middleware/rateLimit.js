import RateLimit from '../models/RateLimit.js';

// Caller identity: the signed-in user, else the client IP (Vercel sets x-forwarded-for)
const callerOf = (req) => {
    const userId = req.auth?.()?.userId;
    if (userId) return { key: `user:${userId}`, signedIn: true };
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    return { key: `ip:${ip}`, signedIn: false };
};

/**
 * Fixed-window rate limit stored in MongoDB, so it holds across serverless
 * instances. Signed-in users get `signedInLimit`, anonymous callers `limit`.
 * If the counter can't be updated the request is let through (fail open), so
 * a database hiccup never takes the feature down.
 */
export const rateLimit = ({ name, windowMs, limit, signedInLimit = limit, message = 'Too many requests. Please wait a moment and try again.' }) =>
    async (req, res, next) => {
        const { key, signedIn } = callerOf(req);
        const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
        try {
            const { count } = await RateLimit.findOneAndUpdate(
                { _id: `${name}:${key}:${windowStart}` },
                { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } },
                { upsert: true, new: true },
            ).lean();
            const max = signedIn ? signedInLimit : limit;
            res.setHeader('RateLimit-Limit', String(max));
            res.setHeader('RateLimit-Remaining', String(Math.max(0, max - count)));
            if (count > max) {
                res.setHeader('Retry-After', String(Math.ceil((windowStart + windowMs - Date.now()) / 1000)));
                return res.status(429).json({ success: false, message });
            }
        } catch (error) {
            console.error(`[RateLimit] ${name}:`, error.message);
        }
        next();
    };
