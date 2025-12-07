import { CircleDollarSignIcon, PlayCircleIcon, ChartLineIcon, UserIcon, TrendingUp, Calendar, Clock, Star } from 'lucide-react';
import React from 'react';
import Title from '../../components/admin/Title.jsx';
import Loading from '../../components/Loading';
import { useEffect, useState } from 'react'
import { StarIcon } from 'lucide-react';
import { dateFormat } from '../../lib/utils.js';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';

const DashBoard = () => {

    const currency = import.meta.env.VITE_CURRENCY
    const { axios, getToken, user, image_base_url } = useAppContext();

    const [dashboardData, setDashboardData] = useState({
        totalRevenue: 0,
        totalBookings: 0,
        totalUser: 0,
        activeShows: [],
    });


    const [loading, setLoading] = useState(true);

    const dashboardCards = [
        {
            title: "Total Bookings",
            value: dashboardData.totalBookings || 0,
            icon: ChartLineIcon,
            color: "from-primary/20 to-primary/5",
            iconBg: "bg-primary/20",
            iconColor: "text-primary"
        },
        {
            title: "Total Revenue",
            value: `${currency || '$'}${dashboardData.totalRevenue || 0}`,
            icon: CircleDollarSignIcon,
            color: "from-green-500/20 to-green-500/5",
            iconBg: "bg-green-500/20",
            iconColor: "text-green-500"
        },
        {
            title: "Active Shows",
            value: dashboardData.activeShows?.length || 0,
            icon: PlayCircleIcon,
            color: "from-blue-500/20 to-blue-500/5",
            iconBg: "bg-blue-500/20",
            iconColor: "text-blue-500"
        },
        {
            title: "Total Users",
            value: dashboardData.totalUser || 0,
            icon: UserIcon,
            color: "from-purple-500/20 to-purple-500/5",
            iconBg: "bg-purple-500/20",
            iconColor: "text-purple-500"
        },
    ]

    const fetchDashboardData = async () => {
        try {
            const token = await getToken();
            const { data } = await axios.get("/api/admin/dashboard", {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log("Dashboard API Response:", data);
            if (data.success) {
                console.log("Active Shows Count:", data.dashBoardData.activeShows?.length);
                console.log("Active Shows:", data.dashBoardData.activeShows);
                setDashboardData(data.dashBoardData);
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            toast.error("Failed to fetch dashboard data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchDashboardData();
        }
    }, [user]);

    return !loading ? (
        <div className="max-w-7xl mx-auto">
            <Title text1="Admin" text2="Dashboard" />

            {/* Stats Cards */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10'>
                {dashboardCards.map((card, index) => (
                    <div
                        key={index}
                        className={`group relative bg-gradient-to-br ${card.color} border border-beige/10 rounded-2xl p-6 hover:scale-105 transition-all duration-300 cursor-pointer overflow-hidden`}
                    >
                        {/* Background decoration */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full -mr-16 -mt-16"></div>

                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-4">
                                <div className={`${card.iconBg} p-3 rounded-xl`}>
                                    <card.icon className={`w-6 h-6 ${card.iconColor}`} />
                                </div>
                                <TrendingUp className="w-4 h-4 text-beige/40 group-hover:text-beige/60 transition-colors" />
                            </div>

                            <h3 className="text-sm text-beige/60 font-medium mb-2">{card.title}</h3>
                            <p className="text-3xl font-bold text-beige">{card.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Active Shows Section */}
            <div className="mt-16">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-beige flex items-center gap-3">
                            <PlayCircleIcon className="w-7 h-7 text-primary" />
                            Active Shows
                        </h2>
                        <p className="text-sm text-beige/60 mt-1">Currently screening movies</p>
                    </div>
                    <div className="bg-primary/10 border border-primary/20 px-4 py-2 rounded-full">
                        <span className="text-sm font-medium text-primary">{dashboardData.activeShows?.length || 0} Shows</span>
                    </div>
                </div>

                {dashboardData.activeShows?.length > 0 ? (
                    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
                        {dashboardData.activeShows.map((show) => (
                            <div
                                key={show._id}
                                className='group relative bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl overflow-hidden hover:scale-105 hover:border-primary/30 transition-all duration-300 cursor-pointer'
                            >
                                {/* Movie Poster */}
                                <div className="relative aspect-[2/3] overflow-hidden">
                                    <img
                                        src={image_base_url + show.movie.poster_path}
                                        alt={show.movie.title}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-80"></div>

                                    {/* Rating Badge */}
                                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-full">
                                        <Star className="w-4 h-4 text-primary fill-primary" />
                                        <span className="text-sm font-semibold">{show.movie.vote_average.toFixed(1)}</span>
                                    </div>

                                    {/* Price Badge */}
                                    <div className="absolute top-3 left-3 bg-primary/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                                        <span className="text-sm font-bold">{currency}{show.showPrice}</span>
                                    </div>
                                </div>

                                {/* Movie Info */}
                                <div className="p-4">
                                    <h3 className="font-semibold text-beige line-clamp-1 mb-3">{show.movie.title}</h3>

                                    <div className="flex items-center gap-2 text-xs text-beige/60">
                                        <Calendar className="w-3.5 h-3.5" />
                                        <span>{new Date(show.showDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-beige/60 mt-2">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>{new Date(show.showDateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-12 text-center">
                        <PlayCircleIcon className="w-16 h-16 text-beige/20 mx-auto mb-4" />
                        <p className="text-beige/60">No active shows at the moment</p>
                    </div>
                )}
            </div>
        </div>
    ) : <Loading />

};

export default DashBoard;
