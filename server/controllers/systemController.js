import mongoose from "mongoose";
import axios from "axios";
import Stripe from "stripe";
import { v2 as cloudinary } from "cloudinary";
import { clerkClient } from "@clerk/express";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import SystemState from "../models/SystemState.js";
import SimulatorState from "../models/SimulatorState.js";
import { toCinemaDate } from "../configs/cinemaTime.js";
import { ROLES } from "../middleware/auth.js";
import { isSimulationEnabled, runTrafficSimulation } from "../simulator/trafficSimulator.js";

const CHECK_TIMEOUT_MS = 4000;
const CRON_HOUR_UTC = 5; // matches the "0 5 * * *" schedule in vercel.json

// Run one health check with a time limit; never throws
const check = async (name, fn) => {
    const started = Date.now();
    try {
        const detail = await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`No response after ${CHECK_TIMEOUT_MS / 1000}s`)), CHECK_TIMEOUT_MS)),
        ]);
        return { name, status: 'ok', detail, latencyMs: Date.now() - started };
    } catch (error) {
        return { name, status: 'error', detail: error.message, latencyMs: Date.now() - started };
    }
};

const nextCronRun = (now = new Date()) => {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CRON_HOUR_UTC));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
};

// GET /api/admin/system — service health, background jobs and data volumes
export const getSystemStatus = async (req, res) => {
    try {
        const stripeKey = process.env.STRIPE_SECRET_KEY || '';
        const services = await Promise.all([
            check('Database', async () => {
                await mongoose.connection.db.admin().ping();
                const diffs = await Promise.all([Booking, Show, User].map(m => m.diffIndexes()));
                const pending = diffs.reduce((n, d) => n + d.toCreate.length + d.toDrop.length, 0);
                return `${mongoose.connection.db.databaseName} · ${pending ? `${pending} index change(s) pending, run npm run sync:indexes` : 'indexes up to date'}`;
            }),
            check('TMDB (movie data)', async () => {
                if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not set');
                await axios.get('https://api.themoviedb.org/3/configuration', {
                    headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
                    timeout: CHECK_TIMEOUT_MS,
                });
                return 'Reachable';
            }),
            check('Stripe (payments)', async () => {
                if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');
                await new Stripe(stripeKey, { timeout: CHECK_TIMEOUT_MS }).balance.retrieve();
                return stripeKey.startsWith('sk_live') ? 'Live mode' : 'Test mode';
            }),
            check('Clerk (sign-in)', async () => {
                const count = await clerkClient.users.getCount();
                return `${count} account${count === 1 ? '' : 's'}`;
            }),
            check('Cloudinary (images)', async () => {
                await cloudinary.api.ping();
                return 'Reachable';
            }),
            check('Email (Resend)', async () => {
                if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');
                return 'Configured';
            }),
        ]);

        const now = new Date();
        const [schedulerState, simulatorState, lastShow, counts, simulated] = await Promise.all([
            SystemState.findById('scheduler').lean(),
            SimulatorState.findById('traffic').lean(),
            Show.findOne({}).sort({ showDateTime: -1 }).select('showDateTime').lean(),
            Promise.all([Movie, Show, Booking, User].map(m => m.estimatedDocumentCount())),
            Promise.all([User.countDocuments({ isSimulated: true }), Booking.countDocuments({ isSimulated: true })]),
        ]);
        const report = schedulerState?.data?.report;
        const lastDate = lastShow ? toCinemaDate(lastShow.showDateTime) : null;

        res.json({
            success: true,
            checkedAt: now,
            services,
            scheduler: {
                lastRunAt: schedulerState?.data?.lastRunAt || null,
                lastResult: report ? {
                    newMovies: report.added?.length || 0,
                    daysScheduled: (report.days || []).filter(d => !d.skipped).length,
                    showsCreated: (report.days || []).reduce((n, d) => n + (d.shows || 0), 0),
                    errors: report.errors || [],
                } : null,
                nextRunAt: nextCronRun(now),
                scheduledThrough: lastDate,
                daysAhead: lastDate ? Math.round((new Date(`${lastDate}T12:00:00Z`) - new Date(`${toCinemaDate(now)}T12:00:00Z`)) / 86_400_000) : 0,
            },
            simulator: {
                enabled: isSimulationEnabled(),
                lastRunAt: simulatorState?.lastRunAt || null,
                customers: simulated[0],
                bookings: simulated[1],
            },
            data: { movies: counts[0], shows: counts[1], bookings: counts[2], customers: counts[3] },
            environment: {
                node: process.version,
                region: process.env.VERCEL_REGION || 'local',
                commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
            },
        });
    } catch (error) {
        console.error('[System]', error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/admin/simulator/run — catch the traffic simulator up now
export const runSimulatorNow = async (req, res) => {
    try {
        if (!isSimulationEnabled()) return res.json({ success: false, message: 'The traffic simulator is off (SIMULATE_TRAFFIC is not true)' });
        const result = await runTrafficSimulation();
        res.json({
            success: true,
            message: result
                ? `Simulated ${result.bookings} booking${result.bookings === 1 ? '' : 's'} and ${result.newCustomers} new customer${result.newCustomers === 1 ? '' : 's'}`
                : 'Already up to date: the simulator ran less than a minute ago',
        });
    } catch (error) {
        console.error('[RunSimulator]', error);
        res.json({ success: false, message: error.message });
    }
};

// ---------------- Team ----------------

const toMember = (user) => ({
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'No name',
    email: user.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress || '',
    image: user.imageUrl,
    role: user.privateMetadata?.role || null,
    lastSignInAt: user.lastSignInAt || null,
});

// Clerk returns { data, totalCount } in current SDKs and a plain array in older ones
const listClerkUsers = async (params) => {
    const result = await clerkClient.users.getUserList(params);
    return Array.isArray(result) ? result : result.data;
};

const adminCount = async () => (await listClerkUsers({ limit: 500 })).filter(u => u.privateMetadata?.role === 'admin').length;

// GET /api/admin/team — everyone with an admin or staff role
export const listTeam = async (req, res) => {
    try {
        const users = await listClerkUsers({ limit: 500 });
        const members = users.filter(u => ROLES.includes(u.privateMetadata?.role)).map(toMember);
        res.json({ success: true, currentUserId: req.auth().userId, members });
    } catch (error) {
        console.error('[Team]', error);
        res.json({ success: false, message: error.message });
    }
};

// POST /api/admin/team — body: { email, role }. The person must already have an account.
export const addTeamMember = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const { role } = req.body;
        if (!/^\S+@\S+\.\S+$/.test(email)) return res.json({ success: false, message: 'Enter a valid email address' });
        if (!ROLES.includes(role)) return res.json({ success: false, message: 'Choose admin or staff' });

        const [user] = await listClerkUsers({ emailAddress: [email], limit: 1 });
        if (!user) {
            return res.json({ success: false, message: `No account uses ${email}. Ask them to sign up on the site first, then add them here.` });
        }
        if (user.id === req.auth().userId) return res.json({ success: false, message: "You can't change your own role" });

        await clerkClient.users.updateUserMetadata(user.id, { privateMetadata: { role } });
        res.json({ success: true, message: `${toMember(user).name} is now ${role === 'admin' ? 'an admin' : 'staff'}` });
    } catch (error) {
        console.error('[AddTeamMember]', error);
        res.json({ success: false, message: error.message });
    }
};

// PATCH /api/admin/team/:userId — body: { role: 'admin' | 'staff' | null } (null removes access)
export const updateTeamMember = async (req, res) => {
    try {
        const { userId } = req.params;
        const role = req.body.role ?? null;
        if (role !== null && !ROLES.includes(role)) return res.json({ success: false, message: 'Choose admin, staff, or remove access' });
        if (userId === req.auth().userId) return res.json({ success: false, message: "You can't change your own role" });

        const user = await clerkClient.users.getUser(userId);
        if (user.privateMetadata?.role === 'admin' && role !== 'admin' && await adminCount() <= 1) {
            return res.json({ success: false, message: 'There must be at least one admin' });
        }

        await clerkClient.users.updateUserMetadata(userId, { privateMetadata: { role } });
        const name = toMember(user).name;
        res.json({ success: true, message: role ? `${name} is now ${role === 'admin' ? 'an admin' : 'staff'}` : `${name} no longer has admin access` });
    } catch (error) {
        console.error('[UpdateTeamMember]', error);
        res.json({ success: false, message: error.message });
    }
};
