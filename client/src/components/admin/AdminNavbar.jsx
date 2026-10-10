import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Clock, Menu } from 'lucide-react';
import { findNavItem, adminNavSections, ROLE_LABELS } from '../../lib/adminNav';
import { cinemaClock } from '../../lib/adminFormat';
import { useAppContext } from '../../context/AppContext';
import { Badge } from './ui';

const AdminNavbar = ({ onOpenMobile }) => {
    const { pathname } = useLocation();
    const { adminRole, simulationOn } = useAppContext();
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);

    const item = findNavItem(pathname);
    const section = adminNavSections.find(s => s.items.includes(item));

    return (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/90 px-4 backdrop-blur md:px-6">
            <div className="flex items-center gap-3 min-w-0">
                <button onClick={onOpenMobile} className="md:hidden rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Open menu">
                    <Menu className="w-5 h-5" />
                </button>
                <nav className="flex items-center gap-2 text-sm min-w-0">
                    <span className="hidden sm:inline text-zinc-500">{section?.label || 'Admin'}</span>
                    <span className="hidden sm:inline text-zinc-700">/</span>
                    <span className="truncate font-medium text-zinc-100">{item?.name || 'Admin'}</span>
                </nav>
            </div>
            <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    {cinemaClock(now)} CT
                </div>
                {simulationOn && (
                    <span title="Sample customers and bookings are being generated automatically (SIMULATE_TRAFFIC=true)">
                        <Badge tone="warning">Simulated traffic</Badge>
                    </span>
                )}
                {adminRole && <Badge tone={adminRole === 'admin' ? 'danger' : 'info'}>{ROLE_LABELS[adminRole]}</Badge>}
            </div>
        </header>
    );
};

export default AdminNavbar;
