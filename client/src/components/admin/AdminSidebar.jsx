import { NavLink, Link } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';
import { ChevronsLeft, ChevronsRight, ExternalLink, LogOut, X } from 'lucide-react';
import { adminNavSections, ROLE_LABELS } from '../../lib/adminNav';
import { useAppContext } from '../../context/AppContext';
import logo1 from '../../assets/logo1.png';

const AdminSidebar = ({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }) => {
    const { user, adminRole } = useAppContext();
    const { signOut } = useClerk();

    const sections = adminNavSections
        .map(section => ({ ...section, items: section.items.filter(item => item.roles.includes(adminRole)) }))
        .filter(section => section.items.length > 0);

    const showLabels = !collapsed || mobileOpen;

    return (
        <>
            {/* Mobile backdrop */}
            {mobileOpen && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onCloseMobile} />}

            <aside
                className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200
                    md:static md:translate-x-0
                    ${mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'}
                    ${collapsed ? 'md:w-[68px]' : 'md:w-64'}`}
            >
                {/* Brand */}
                <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
                    <Link to="/admin" className="flex items-center gap-2 overflow-hidden">
                        <img src={logo1} alt="DB Cinema" className={`h-7 w-auto ${showLabels ? '' : 'md:hidden'}`} />
                        {!showLabels && <span className="hidden md:block text-lg font-bold text-primary">DB</span>}
                    </Link>
                    <button onClick={onCloseMobile} className="md:hidden rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close menu">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
                    {sections.map(section => (
                        <div key={section.label}>
                            {showLabels && (
                                <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{section.label}</p>
                            )}
                            <ul className="space-y-0.5">
                                {section.items.map(item => (
                                    <li key={item.path}>
                                        <NavLink
                                            to={item.path}
                                            end={item.path === '/admin'}
                                            onClick={onCloseMobile}
                                            title={showLabels ? undefined : item.name}
                                            className={({ isActive }) =>
                                                `flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${isActive
                                                    ? 'bg-zinc-800 text-zinc-50'
                                                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                                                } ${showLabels ? '' : 'md:justify-center'}`
                                            }
                                        >
                                            {({ isActive }) => (
                                                <>
                                                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary' : ''}`} />
                                                    {showLabels && <span className="truncate">{item.name}</span>}
                                                </>
                                            )}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div className="border-t border-zinc-800 p-3 space-y-1">
                    <Link
                        to="/"
                        className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 ${showLabels ? '' : 'md:justify-center'}`}
                        title="View site"
                    >
                        <ExternalLink className="w-4 h-4" />
                        {showLabels && 'View site'}
                    </Link>

                    <div className={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${showLabels ? '' : 'md:justify-center'}`}>
                        {user?.imageUrl
                            ? <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                            : <div className="w-7 h-7 rounded-full bg-zinc-800 flex-shrink-0" />}
                        {showLabels && (
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-zinc-100">{user?.fullName || 'Admin'}</p>
                                <p className="truncate text-xs text-zinc-500">{ROLE_LABELS[adminRole] || 'Loading…'}</p>
                            </div>
                        )}
                        {showLabels && (
                            <button onClick={() => signOut({ redirectUrl: '/' })} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400" title="Sign out" aria-label="Sign out">
                                <LogOut className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={onToggleCollapsed}
                        className="hidden md:flex w-full items-center justify-center rounded-lg py-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
                    </button>
                </div>
            </aside>
        </>
    );
};

export default AdminSidebar;
