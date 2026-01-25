import React, { useEffect, useState, useCallback } from 'react';
import { User, Film, Calendar, Clock, Ticket, Mail } from 'lucide-react';
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { dateFormat, timeFormat } from '../../lib/utils.js';
import { useAppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';

const ListBookings = () => {
    const currency = import.meta.env.VITE_CURRENCY
    const { axios, getToken, image_base_url } = useAppContext();

    const [bookings, setBookings] = useState([])
    const [isLoading, setIsLoading] = useState(true)

    const getAllBookings = useCallback(async () => {
        try {
            const token = await getToken();
            const { data } = await axios.get("/api/admin/all-bookings", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (data.success) {
                setBookings(data.bookings);
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error("Error fetching bookings:", error);
            toast.error("Failed to fetch bookings");
        } finally {
            setIsLoading(false);
        }
    }, [getToken, axios]);

    useEffect(() => {
        getAllBookings()
    }, [getAllBookings])

    return !isLoading ? (
        <div className="max-w-7xl mx-auto">
            <Title text1="Detailed" text2="Bookings" />

            <div className="mt-10 bg-zinc-900/50 border border-beige/10 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-beige/10 bg-beige/5">
                                <th className="px-6 py-5 text-sm font-semibold text-beige">Customer</th>
                                <th className="px-6 py-5 text-sm font-semibold text-beige">Movie & Show</th>
                                <th className="px-6 py-5 text-sm font-semibold text-beige text-center">People (Seats)</th>
                                <th className="px-6 py-5 text-sm font-semibold text-beige text-center">Amount</th>
                                <th className="px-6 py-5 text-sm font-semibold text-beige text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-beige/5">
                            {bookings.map((booking, index) => (
                                <tr key={booking._id || index} className="group hover:bg-beige/5 transition-all duration-300">
                                    {/* Customer Account */}
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                                                <User className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-beige group-hover:text-primary transition-colors">{booking.user.name}</p>
                                                <div className="flex items-center gap-1.5 text-xs text-beige/40">
                                                    <Mail className="w-3 h-3" />
                                                    {booking.user.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Film & Show Information */}
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 shadow-lg border border-beige/10">
                                                <img 
                                                    src={image_base_url + booking.show.movie.poster_path} 
                                                    alt={booking.show.movie.title}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                />
                                            </div>
                                            <div>
                                                <p className="font-medium text-beige flex items-center gap-2 mb-1.5">
                                                    <Film className="w-4 h-4 text-primary" />
                                                    {booking.show.movie.title}
                                                </p>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                                    <div className="flex items-center gap-1.5 text-xs text-beige/50">
                                                        <Calendar className="w-3.5 h-3.5 text-beige/30" />
                                                        {dateFormat(booking.show.showDateTime)}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs text-beige/50">
                                                        <Clock className="w-3.5 h-3.5 text-beige/30" />
                                                        {timeFormat(booking.show.showDateTime)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Seats / Number of People */}
                                    <td className="px-6 py-5 text-center">
                                        <div className="inline-flex flex-col items-center">
                                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20 mb-1.5">
                                                {booking.bookedSeat?.length || 0} People
                                            </span>
                                            <div className="flex items-center justify-center gap-1.5 text-[10px] text-beige/30 font-medium">
                                                <Ticket className="w-3 h-3" />
                                                Seats: {booking.bookedSeat?.join(", ")}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Booking Amount */}
                                    <td className="px-6 py-5 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <p className="text-lg font-bold text-green-500">{currency}{booking.amount}</p>
                                            <p className="text-[10px] text-beige/30 uppercase tracking-wider font-semibold">Total Paid</p>
                                        </div>
                                    </td>

                                    {/* Payment Status Badge */}
                                    <td className="px-6 py-5 text-right">
                                        {booking.isPaid ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-500 text-xs font-bold border border-green-500/20 shadow-sm shadow-green-500/10">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                                Confimed
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold border border-amber-500/20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                                Pending
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {bookings.length === 0 && (
                    <div className="py-24 text-center">
                        <Ticket className="w-16 h-16 text-beige/10 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-beige/60">No bookings found</h3>
                        <p className="text-sm text-beige/30 mt-1">When customers book tickets, they will appear here</p>
                    </div>
                )}
            </div>
        </div>
    ) : <Loading />;
}

export default ListBookings;
