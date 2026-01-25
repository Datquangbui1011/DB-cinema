import { CircleDollarSignIcon, PlayCircleIcon, ChartLineIcon, UserIcon, TrendingUp, Calendar, Clock, Star, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import Title from '../../components/admin/Title.jsx';
import Loading from '../../components/Loading';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    AreaChart,
    Area
} from 'recharts';

const DashBoard = () => {

    const currency = import.meta.env.VITE_CURRENCY
    const { axios, getToken, user, image_base_url } = useAppContext();

    const [dashboardData, setDashboardData] = useState({
        totalRevenue: 0,
        totalBookings: 0,
        totalUser: 0,
        activeShows: [],
        revenueTrend: [],
        moviePopularity: []
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

    const fetchDashboardData = useCallback(async () => {
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
    }, [getToken, axios]);

    useEffect(() => {
        if (user) {
            fetchDashboardData();
        }
    }, [user, fetchDashboardData]);

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

            {/* Analytics Charts */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12'>
                {/* Revenue Trend Chart */}
                <div className="bg-zinc-900 border border-beige/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="bg-primary/20 p-2.5 rounded-xl">
                                <LineChartIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-beige">Revenue Trend</h3>
                                <p className="text-xs text-beige/40">Daily earnings over last 7 days</p>
                            </div>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dashboardData.revenueTrend}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ff4b2b" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ff4b2b" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#52525b"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#52525b"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${currency}${value}`}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid rgba(245, 245, 220, 0.1)',
                                        borderRadius: '12px',
                                        color: '#F5F5DC'
                                    }}
                                    itemStyle={{ color: '#ff4b2b' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#ff4b2b"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorRevenue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Movie Popularity Chart */}
                <div className="bg-zinc-900 border border-beige/10 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-500/20 p-2.5 rounded-xl">
                                <BarChart3 className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-beige">Movie Popularity</h3>
                                <p className="text-xs text-beige/40">Top 5 movies by booking volume</p>
                            </div>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dashboardData.moviePopularity} layout="vertical" margin={{ left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="title"
                                    type="category"
                                    stroke="#52525b"
                                    fontSize={11}
                                    width={100}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{
                                        backgroundColor: '#18181b',
                                        border: '1px solid rgba(245, 245, 220, 0.1)',
                                        borderRadius: '12px',
                                        color: '#F5F5DC'
                                    }}
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                                    {dashboardData.moviePopularity.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={index === 0 ? '#ff4b2b' : index === 1 ? '#3b82f6' : '#8b5cf6'}
                                            fillOpacity={0.8}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
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
