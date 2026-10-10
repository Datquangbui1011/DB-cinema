import { CalendarPlus, Percent, Sparkles, XCircle } from 'lucide-react';

// AI Advisor recommendation types: label, icon and badge tone
export const REC_TYPES = {
    add_showtime: { label: 'Add showtime', icon: CalendarPlus, tone: 'success' },
    upgrade_room: { label: 'Upgrade room', icon: Sparkles, tone: 'info' },
    promotion: { label: 'Promotion', icon: Percent, tone: 'warning' },
    cancel: { label: 'Cancel', icon: XCircle, tone: 'danger' },
};
