import { runAdvisor } from '../advisor/runAdvisor.js';

// POST /api/admin/advisor/refresh — re-forecast every upcoming show now
export const refreshAdvisor = async (req, res) => {
    try {
        const report = await runAdvisor({ trigger: 'manual' });
        res.json({
            success: true,
            message: `Forecast updated for ${report.predicted} upcoming show${report.predicted === 1 ? '' : 's'}`,
            report,
        });
    } catch (error) {
        console.error('[Advisor] Refresh failed:', error);
        res.json({ success: false, message: error.message });
    }
};
