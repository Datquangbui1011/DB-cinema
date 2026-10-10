import { LayoutDashboard, Radio, CalendarClock, BarChart3, Ticket, Users, Film, MonitorPlay, ImagePlus, Activity, UserCog } from 'lucide-react';

// Admin console navigation. `roles` lists who can open each page;
// the server enforces the same rules on every endpoint.
export const adminNavSections = [
    {
        label: 'Operations',
        items: [
            { name: 'Overview', path: '/admin', icon: LayoutDashboard, roles: ['admin', 'staff'] },
            { name: 'Live Operations', path: '/admin/live', icon: Radio, roles: ['admin', 'staff'] },
            { name: 'Shows', path: '/admin/shows', icon: CalendarClock, roles: ['admin', 'staff'] },
        ],
    },
    {
        label: 'Insights',
        items: [
            { name: 'Analytics', path: '/admin/analytics', icon: BarChart3, roles: ['admin', 'staff'] },
        ],
    },
    {
        label: 'Sales',
        items: [
            { name: 'Bookings', path: '/admin/bookings', icon: Ticket, roles: ['admin', 'staff'] },
            { name: 'Customers', path: '/admin/customers', icon: Users, roles: ['admin', 'staff'] },
        ],
    },
    {
        label: 'Catalog',
        items: [
            { name: 'Movies', path: '/admin/movies', icon: Film, roles: ['admin', 'staff'] },
            { name: 'Screens', path: '/admin/screens', icon: MonitorPlay, roles: ['admin', 'staff'] },
        ],
    },
    {
        label: 'Content',
        items: [
            { name: 'Hero Posters', path: '/admin/hero-posters', icon: ImagePlus, roles: ['admin'] },
        ],
    },
    {
        label: 'System',
        items: [
            { name: 'System Status', path: '/admin/system', icon: Activity, roles: ['admin'] },
            { name: 'Team', path: '/admin/team', icon: UserCog, roles: ['admin'] },
        ],
    },
];

export const ROLE_LABELS = { admin: 'Administrator', staff: 'Staff' };

const allItems = adminNavSections.flatMap(s => s.items);

export const findNavItem = (pathname) =>
    allItems.find(item => item.path === pathname) ||
    allItems.find(item => item.path !== '/admin' && pathname.startsWith(item.path));

export const canAccess = (pathname, role) => {
    const item = findNavItem(pathname);
    return !item || item.roles.includes(role);
};
