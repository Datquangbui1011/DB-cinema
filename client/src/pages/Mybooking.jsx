import React, { useEffect, useState } from "react";
import { dummyBookingData } from "../assets/assets";
import Loading from "../components/Loading";
import { useAppContext } from "../context/AppContext";
import { toast } from "react-hot-toast";

const MyBookings = () => {
    const currency = import.meta.env.VITE_CURRENCY || "$";
    const [bookings, setBookings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const { shows, axios, getToken, fetchFavoriteMovies, favoriteMovies, image_base_url, user } = useAppContext();

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



    return !isLoading ? (
        <div className="min-h-screen px-6 md:px-24 lg:px-48 pt-32 pb-20">
            <h2 className="text-3xl font-bold mb-8">My Bookings</h2>

            <div className="flex flex-col gap-6">
                {bookings.map((booking, index) => (
                    <div
                        key={index}
                        className="
                            flex items-center justify-between px-6 py-5
                            bg-zinc-900 rounded-xl border border-zinc-800
                            shadow-[0_0_35px_-10px_rgba(255,0,80,0.4)]
                            hover:shadow-[0_0_45px_-8px_rgba(255,0,80,0.55)]
                            transition-all duration-300
                        "
                    >
                        {/* Left */}
                        <div className="flex items-center gap-5">
                            <img
                                src={booking.show?.movie?.poster_path ? image_base_url + booking.show.movie.poster_path : "https://via.placeholder.com/150"}
                                className="w-24 h-32 rounded-lg object-cover"
                                alt=""
                            />

                            <div>
                                <h3 className="text-xl font-semibold">
                                    {booking.show?.movie?.title || "Unknown Movie"}
                                </h3>

                                <p className="text-gray-400 text-sm mt-1">
                                    {booking.show?.movie?.runtime ? `${Math.floor(booking.show.movie.runtime / 60)}h ${booking.show.movie.runtime % 60}m` : "N/A"}
                                </p>

                                <p className="text-gray-300 text-sm mt-2">
                                    {booking.show?.showDateTime ? new Date(booking.show.showDateTime).toLocaleString("en-US", {
                                        weekday: "short",
                                        month: "long",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "numeric",
                                    }) : "Date N/A"}
                                </p>

                                <p className="text-gray-300 text-sm mt-2">
                                    Total Tickets:
                                    <span className="font-semibold">
                                        {" "}
                                        {booking.bookedSeat?.length || 0}
                                    </span>
                                </p>

                                <p className="text-gray-300 text-sm">
                                    Seat Number:
                                    <span className="font-semibold">
                                        {" "}
                                        {booking.bookedSeat?.join(", ") || "N/A"}
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Right */}
                        <div className="flex flex-col items-end gap-3">
                            <p className="text-3xl font-bold">
                                {currency}
                                {booking.amount}
                            </p>

                            {!booking.isPaid && (
                                <button className="px-5 py-1.5 bg-red-500 text-white rounded-full text-sm font-semibold">
                                    Pay Now
                                </button>
                            )}

                            {/* CANCEL BUTTON */}
                            {!booking.isPaid && (
                                <button
                                    onClick={() => cancelBooking(booking._id)}
                                    className="px-5 py-1.5 bg-gray-600 text-white rounded-full text-sm font-semibold hover:bg-gray-500 relative z-10 cursor-pointer"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    ) : (
        <Loading />
    );
};

export default MyBookings;
