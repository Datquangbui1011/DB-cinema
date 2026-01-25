import React, { useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import Loading from "../components/Loading";
import { useAppContext } from "../context/AppContext";
import { toast } from "react-hot-toast";

const MyBookings = () => {
    const currency = import.meta.env.VITE_CURRENCY || "$";
    const [bookings, setBookings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    // const { shows, axios, getToken, fetchFavoriteMovies, favoriteMovies, image_base_url, user } = useAppContext();
    const { axios, getToken, image_base_url, user } = useAppContext();

    const getMyBookings = async () => {
        try {
            const token = await getToken();
            const { data } = await axios.get("/api/user/bookings", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (data.success) {
                console.log("Fetched bookings:", data.bookings);
                setBookings(data.bookings);
            } else {
                console.log("Failed to fetch bookings:", data.message);
            }
        } catch (error) {
            console.log("Error fetching bookings:", error);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        if (user) {
            getMyBookings();
        } else {
            setIsLoading(false);
        }
    }, [user]);

    const cancelBooking = async (bookingId) => {
        try {
            const token = await getToken();
            const { data } = await axios.post("/api/booking/cancel", { bookingId }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (data.success) {
                toast.success(data.message);
                getMyBookings();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    };
    const handlePayment = async (bookingId) => {
        try {
            const token = await getToken();
            const { data } = await axios.post("/api/booking/payment", { bookingId }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (data.success) {
                window.location.href = data.url;
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    };


    return !isLoading ? (
        <div className="min-h-screen px-6 md:px-24 lg:px-48 pt-32 pb-20">
            <h2 className="text-3xl font-bold mb-8">My Bookings</h2>

            <div className="flex flex-col gap-6">
                {bookings.length > 0 ? (
                    bookings.map((booking, index) => (
                        <div
                            key={index}
                            className="
                                flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-5
                                bg-zinc-900 rounded-xl border border-zinc-800
                                shadow-[0_0_35px_-10px_rgba(255,0,80,0.4)]
                                hover:shadow-[0_0_45px_-8px_rgba(255,0,80,0.55)]
                                transition-all duration-300 gap-6
                            "
                        >
                            {/* Left */}
                            <div className="flex items-center gap-5">
                                <img
                                    src={booking.show?.movie?.poster_path ? image_base_url + booking.show.movie.poster_path : "https://via.placeholder.com/150"}
                                    className="w-24 h-32 rounded-lg object-cover border border-white/10"
                                    alt=""
                                />

                                <div>
                                    <h3 className="text-xl font-semibold">
                                        {booking.show?.movie?.title || "Unknown Movie"}
                                    </h3>

                                    <p className="text-gray-400 text-sm mt-1">
                                        {booking.show?.movie?.runtime ? `${Math.floor(booking.show.movie.runtime / 60)}h ${booking.show.movie.runtime % 60}m` : "N/A"}
                                    </p>

                                    <p className="text-gray-300 text-sm mt-2 font-medium">
                                        {booking.show?.showDateTime ? new Date(booking.show.showDateTime).toLocaleString("en-US", {
                                            weekday: "short",
                                            month: "long",
                                            day: "numeric",
                                            hour: "numeric",
                                            minute: "numeric",
                                        }) : "Date N/A"}
                                    </p>

                                    <div className="mt-2 space-y-1">
                                        <p className="text-gray-400 text-xs uppercase tracking-wider">
                                            Seats: <span className="text-white font-bold">{booking.bookedSeat?.join(", ") || "N/A"}</span>
                                        </p>
                                        <p className="text-gray-400 text-xs uppercase tracking-wider">
                                            Count: <span className="text-white font-bold">{booking.bookedSeat?.length || 0}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Right */}
                            <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                                <p className="text-3xl font-bold text-white">
                                    {currency}{booking.amount}
                                </p>

                                <div className="flex gap-2">
                                    {!booking.isPaid && (
                                        <>
                                            <button
                                                onClick={() => handlePayment(booking._id)}
                                                className="px-6 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-primary/30 transition-all cursor-pointer"
                                            >
                                                Pay Now
                                            </button>
                                            <button
                                                onClick={() => cancelBooking(booking._id)}
                                                className="px-6 py-2 bg-white/5 text-white border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    )}
                                    {booking.isPaid && (
                                        <span className="px-4 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs font-bold uppercase tracking-widest">
                                            Paid
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                ) : user ? (
                    <div className='flex flex-col items-center justify-center min-h-[40vh] text-center bg-white/5 border border-white/5 rounded-3xl p-12'>
                        <div className='w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 border border-primary/20'>
                            <Ticket className='w-10 h-10 text-primary' />
                        </div>
                        <h3 className='text-2xl font-bold text-white mb-2'>No Bookings Found</h3>
                        <p className='text-gray-400 max-w-xs mx-auto'>You haven't booked any movies yet. Explore our current shows and grab your tickets!</p>
                    </div>
                ) : (
                    <div className='flex flex-col items-center justify-center min-h-[40vh] text-center bg-white/5 border border-white/5 rounded-3xl p-12'>
                        <p className='text-lg font-medium text-gray-400 italic'>Please sign in to view your bookings.</p>
                    </div>
                )}
            </div>
        </div>
    ) : (
        <Loading />
    );
};

export default MyBookings;
