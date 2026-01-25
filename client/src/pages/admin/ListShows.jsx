import React from 'react';
import Title from '../../components/admin/Title.jsx';
import Loading from '../../components/Loading.jsx';
import { useState, useCallback, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { dateFormat, timeFormat } from '../../lib/utils.js';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';

const ListShows = () => {
    const currency = import.meta.env.VITE_CURRENCY
    const { axios, getToken } = useAppContext();
    const [shows, setShows] = useState([])
    const [loading, setLoading] = useState(true)

    const getAllshows = useCallback(async () => {
        try {
            const token = await getToken();
            const { data } = await axios.get("/api/admin/all-shows", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (data.success) {
                setShows(data.shows);
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error("Error fetching shows:", error);
            toast.error("Failed to fetch shows");
        } finally {
            setLoading(false);
        }
    }, [getToken, axios])

    useEffect(() => {
        getAllshows()
    }, [getAllshows])

    // Group shows by date
    const groupedShows = shows.reduce((acc, show) => {
        const dateKey = dateFormat(show.showDateTime);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(show);
        return acc;
    }, {});

    return !loading ? (
        <div className="max-w-7xl mx-auto">
            <Title text1="List" text2="Shows" />

            <div className="mt-10 space-y-12">
                {Object.entries(groupedShows).map(([date, dayShows]) => (
                    <div key={date} className="relative">
                        {/* Date Header */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl">
                                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                                    <Calendar className="w-5 h-5" />
                                    {date}
                                </h3>
                            </div>
                            <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent"></div>
                            <span className="text-sm text-beige/40 font-medium">{dayShows.length} Shows</span>
                        </div>

                        {/* Shows Table for the day */}
                        <div className="bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl overflow-hidden backdrop-blur-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-beige/10 bg-beige/5">
                                            <th className="px-6 py-4 text-sm font-semibold text-beige">Movie</th>
                                            <th className="px-6 py-4 text-sm font-semibold text-beige">Time</th>
                                            <th className="px-6 py-4 text-sm font-semibold text-beige">Type</th>
                                            <th className="px-6 py-4 text-sm font-semibold text-beige">Bookings</th>
                                            <th className="px-6 py-4 text-sm font-semibold text-beige">Revenue</th>
                                            <th className="px-6 py-4 text-sm font-semibold text-beige text-right">Price</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-beige/5">
                                        {dayShows.map((show, index) => (
                                            <tr key={show._id || index} className="group hover:bg-beige/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-14 rounded-md overflow-hidden bg-beige/10 hidden sm:block">
                                                            <img
                                                                src={import.meta.env.VITE_TMDB_IMAGE_BASE_URL + show.movie.poster_path}
                                                                alt={show.movie.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-beige group-hover:text-primary transition-colors">{show.movie.title}</p>
                                                            <p className="text-xs text-beige/40 sm:hidden">{timeFormat(show.showDateTime)}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-beige/70">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-4 h-4 text-primary" />
                                                        {timeFormat(show.showDateTime)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                                        show.theaterType === 'Premium' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
                                                        show.theaterType === 'IMAX' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                    }`}>
                                                        {show.theaterType || 'Standard'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-semibold border border-blue-500/20">
                                                        {Object.keys(show.occupiedSeats || {}).length} Booked
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-semibold text-green-500">
                                                    {currency}{Object.keys(show.occupiedSeats || {}).length * show.showPrice}
                                                </td>
                                                <td className="px-6 py-4 text-right text-beige/60 font-medium">
                                                    {currency}{show.showPrice}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ))}

                {Object.keys(groupedShows).length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-20 bg-beige/5 border border-beige/10 rounded-2xl">
                        <Calendar className="w-16 h-16 text-beige/20 mb-4" />
                        <p className="text-beige/60 text-lg">No shows found</p>
                    </div>
                )}
            </div>
        </div>

    ) : <Loading />;
};

export default ListShows;
