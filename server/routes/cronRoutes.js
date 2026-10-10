import express from "express";
import { runMovieScheduler } from "../scheduler/movieScheduler.js";
import { runTrafficSimulation, isSimulationEnabled } from "../simulator/trafficSimulator.js";
import { runAdvisor } from "../advisor/runAdvisor.js";
import { runAutopilot } from "../advisor/autopilot.js";

const cronRouter = express.Router();

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on every invocation
const verifyCron = (req, res, next) => {
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

cronRouter.get("/schedule-movies", verifyCron, async (req, res) => {
    try {
        console.log('[Cron] Running movie scheduler…');
        const report = await runMovieScheduler();
        // Keep simulated activity flowing even on days nobody opens the admin
        const simulation = isSimulationEnabled() ? await runTrafficSimulation() : null;
        // Forecast the new schedule and refresh the AI Advisor; a failure here shouldn't fail the scheduler
        let advisor = null;
        try {
            advisor = await runAdvisor({ trigger: 'cron' });
            advisor.autopilot = await runAutopilot({ trigger: 'cron' });
        } catch (error) {
            console.error('[Cron] AI Advisor error:', error.message);
            advisor = { error: error.message };
        }
        res.json({ success: true, report, simulation, advisor });
    } catch (error) {
        console.error('[Cron] Movie scheduler error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default cronRouter;
