import { LayoutDashboard, Radio, CalendarClock, CalendarPlus, Ticket, ImagePlus } from 'lucide-react';

// Admin console navigation. `roles` lists who can open each page;
// the server enforces the same rules on every endpoint.
export const adminNavSections = [
    {
        label: 'Operations',
        items: [
            { name: 'Overview', path: '/admin', icon: LayoutDashboard, roles: ['admin', 'staff'] },
            { name: 'Live Operations', path: '/admin/live', icon: Radio, roles: ['admin', 'staff'] },
            { name: 'Shows', path: '/admin/list-shows', icon: CalendarClock, roles: ['admin', 'staff'] },
            { name: 'Add Shows', path: '/admin/add-shows', icon: CalendarPlus, roles: ['admin'] },
        ],
    },
    {
        label: 'Sales',
        items: [
            { name: 'Bookings', path: '/admin/list-bookings', icon: Ticket, roles: ['admin', 'staff'] },
        ],
    },
    {
        label: 'Content',
        items: [
            { name: 'Hero Posters', path: '/admin/manage-hero', icon: ImagePlus, roles: ['admin'] },
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
