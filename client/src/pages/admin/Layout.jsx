import { useEffect, useState } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import AdminNavbar from '../../components/admin/AdminNavbar';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { useAppContext } from "../../context/AppContext";
import { canAccess } from "../../lib/adminNav";
import Loading from '../../components/Loading';

const COLLAPSED_KEY = 'admin.sidebarCollapsed';

const readCollapsed = () => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
};

const Layout = () => {
    const { isAdmin, adminRole, fetchIsAdmin } = useAppContext();
    const { pathname } = useLocation();
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        fetchIsAdmin();
    }, []);

    const toggleCollapsed = () => {
        setCollapsed(c => {
            try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
            return !c;
        });
    };

    if (!isAdmin || !adminRole) return <Loading />;

    // Staff opening an admin-only page land on the overview instead
    if (!canAccess(pathname, adminRole)) return <Navigate to="/admin" replace />;

    return (
        <div className="flex h-screen bg-zinc-950 text-zinc-100">
            <AdminSidebar
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                mobileOpen={mobileOpen}
                onCloseMobile={() => setMobileOpen(false)}
            />
            <div className="flex flex-1 flex-col min-w-0">
                <AdminNavbar onOpenMobile={() => setMobileOpen(true)} />
                <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
                    <div className="mx-auto max-w-[1400px]">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Layout;
