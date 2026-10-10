import SystemState from '../models/SystemState.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Run `fn` while holding a short lease stored in SystemState, so two advisor
 * runs (nightly cron, Refresh, apply, autopilot) never interleave. Waits up to
 * `waitMs` for another holder; a crashed holder's lease expires after `leaseMs`.
 */
export const withLock = async (id, fn, { leaseMs = 120_000, waitMs = 45_000 } = {}) => {
    const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const deadline = Date.now() + waitMs;
    for (;;) {
        const now = new Date();
        try {
            // Matches a free (or expired) lock; if it's held, the upsert collides on _id
            await SystemState.updateOne(
                { _id: id, $or: [{ 'data.until': { $lt: now } }, { 'data.until': { $exists: false } }] },
                { $set: { 'data.until': new Date(now.getTime() + leaseMs), 'data.owner': owner } },
                { upsert: true },
            );
            break;
        } catch (error) {
            if (error.code !== 11000) throw error;
            if (Date.now() > deadline) throw new Error('The advisor is busy with another run. Please try again in a minute.');
            await sleep(500);
        }
    }
    try {
        return await fn();
    } finally {
        await SystemState.updateOne({ _id: id, 'data.owner': owner }, { $set: { 'data.until': new Date(0) } });
    }
};
