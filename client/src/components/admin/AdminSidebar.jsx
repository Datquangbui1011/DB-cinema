import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboardIcon, ListIcon, PlusSquareIcon, ListCollapseIcon, LogOutIcon, ImagePlusIcon } from 'lucide-react';
import logo1 from '../../assets/logo1.png';

const AdminSidebar = () => {    
    const user = {
        firstName: "Admin",
        lastName: "User",
        imageUrl: logo1
    };

    const adminNavlinks = [
        { name: "Dashboard", path: "/admin", icon: LayoutDashboardIcon },
        { name: "Add Shows", path: "/admin/add-shows", icon: PlusSquareIcon },
        { name: "List Shows", path: "/admin/list-shows", icon: ListIcon },
        { name: "List Bookings", path: "/admin/list-bookings", icon: ListCollapseIcon },
        { name: "Manage Hero", path: "/admin/manage-hero", icon: ImagePlusIcon },
    ];

    return (
        <div className='h-[calc(100vh-64px)] w-20 md:w-72 bg-zinc-950 border-r border-zinc-900 flex flex-col py-6 transition-all duration-300'>
            {/* User Profile Section */}
            <div className='flex flex-col items-center mb-10 px-4'>
                <div className='relative group cursor-pointer'>
                    <div className='w-12 h-12 md:w-24 md:h-24 rounded-full p-[3px] bg-gradient-to-tr from-primary via-purple-500 to-blue-500 bg-[length:200%_200%] animate-gradient-xy'>
                        <img
                            className='w-full h-full rounded-full object-cover border-4 border-zinc-950 transition-transform duration-300 group-hover:scale-105'
                            src={user.imageUrl}
                            alt="profile"
                        />
                    </div>
                    <div className='absolute bottom-1 right-1 w-3 h-3 md:w-6 md:h-6 bg-green-500 border-4 border-zinc-950 rounded-full'></div>
                </div>
                <div className='mt-4 text-center hidden md:block'>
                    <p className='text-white font-bold text-xl tracking-tight'>{user.firstName} {user.lastName}</p>
                    <p className='text-zinc-500 text-xs uppercase tracking-widest font-semibold mt-1'>Administrator</p>
                </div>
            </div>

            {/* Navigation Links */}
            <div className='flex-1 flex flex-col gap-2 px-3'>
                {adminNavlinks.map((link, index) => (
                    <NavLink
                        key={index}
                        to={link.path}
                        end={link.path === "/admin"}
                        className={({ isActive }) =>
                            `flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden
                            ${isActive
                                ? 'bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg shadow-primary/25 translate-x-1'
                                : 'text-zinc-400 hover:bg-zinc-900 hover:text-white hover:translate-x-1'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <link.icon className={`w-6 h-6 md:w-5 md:h-5 transition-transform duration-300 ${!isActive && 'group-hover:scale-110 group-hover:rotate-3'}`} />
                                <span className='font-medium hidden md:block tracking-wide'>{link.name}</span>

                                {/* Shine Effect on Active */}
                                {isActive && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </div>

            {/* Logout Button */}
            <div className='px-3 mt-auto pt-6 border-t border-zinc-900'>
                <button className='w-full flex items-center justify-center md:justify-start gap-4 px-4 py-3.5 rounded-xl text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-all duration-300 group'>
                    <LogOutIcon className='w-6 h-6 md:w-5 md:h-5 transition-transform duration-300 group-hover:-translate-x-1' />
                    <span className='font-medium hidden md:block'>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default AdminSidebar;
