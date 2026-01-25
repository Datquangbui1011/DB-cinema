import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClockIcon, Calendar, Film, Users, Armchair, Check, X, Star, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useEffect } from 'react';
import { assets } from '../assets/assets';
import Loading from '../components/Loading';
import isoTimeFormat from '../lib/isoTimeFormat';
import toast from 'react-hot-toast';
import { useAppContext } from '../context/AppContext';

const theaterPremiums = {
    'Standard': 0,
    'IMAX': 5,
    'Premium': 15
};

const SeatLayout = () => {

    const groupRows = [["A", "B"], ["C", "D"], ["E", "F"], ["G", "H"], ["I", "J"]]
    const { id, date } = useParams()
    const [selectedSeat, setSelectedSeat] = useState([])
    const [selectedTime, setSelectedTime] = useState(null)
    const [show, setShow] = useState(null)
    const navigate = useNavigate()
    const [occupiedSeats, setOccupiedSeats] = useState([])
    const { axios, getToken, image_base_url, user } = useAppContext()

    const getShow = async () => {
        try {
            const token = getToken();
            const { data } = await axios.get(`/api/shows/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (data.success) {
                setShow({ movie: data.movie, dateTime: data.dateTime });
            }
        } catch (error) {
            console.log(error);
        }
    }


    // seat map

    const renderSeats = (row, count = 9) => (
        <div key={row} className="flex gap-2 mt-2">
            <div className="flex flex-warp items-center justify-center gap-2">
                {Array.from({ length: count }, (_, i) => {
                    const seatId = `${row}${i + 1}`;
                    const isSelected = selectedSeat.includes(seatId);
                    const isOccupied = occupiedSeats.includes(seatId);

                    return (
                        <button
                            key={seatId}
                            onClick={() => handleSeatClick(seatId)}
                            disabled={isOccupied}
                            className={`
                                relative h-10 w-10 rounded-lg transition-all duration-200
                                ${isOccupied
                                    ? 'bg-gray-700 cursor-not-allowed opacity-50'
                                    : isSelected
                                        ? 'bg-primary border-2 border-primary shadow-lg shadow-primary/50 scale-110'
                                        : 'bg-beige/10 border-2 border-beige/20 hover:border-primary/50 hover:bg-beige/20'
                                }
                            `}
                        >
                            <Armchair className={`w-5 h-5 mx-auto ${isSelected ? 'text-white' : isOccupied ? 'text-gray-500' : 'text-beige/60'}`} />
                            <span className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] ${isSelected ? 'text-primary font-semibold' : 'text-beige/40'}`}>
                                {seatId}
                            </span>
                        </button>
                    );
                })}

            </div>
        </div>

    )

    const getOccupiedSeats = async () => {
        try {
            // selectedTime contains the showId for the chosen time slot
            const { data } = await axios.get(`/api/booking/seats/${selectedTime.showId}`);
            if (data.success) {
                setOccupiedSeats(data.occupiedSeats || []);
            } else {
                toast.error(data.message || "Failed to fetch occupied seats");
            }
        } catch (error) {
            console.log("Error fetching occupied seats:", error);
        }
    }




    const handleSeatClick = (seatId) => {
        if (!selectedTime) {
            toast.error('Please select a time');
            return;
        }

        if (occupiedSeats.includes(seatId)) {
            toast.error('Seat already occupied');
            return;
        }

        // Prevent selecting more than 5 seats
        if (!selectedSeat.includes(seatId) && selectedSeat.length >= 5) {
            toast.error('You can only select 5 seats');
            return;
        }

        setSelectedSeat(prev =>
            prev.includes(seatId)
                ? prev.filter(seat => seat !== seatId) // unselect
                : [...prev, seatId] // select
        );
    };

    useEffect(() => {
        getShow()
    }, [])

    useEffect(() => {
        if (selectedTime) {
            getOccupiedSeats();
            setSelectedSeat([]); // Clear selected seats when time changes
        }
    }, [selectedTime])

    const bookTickets = async () => {
        try {
            if (!user) {
                toast.error("Please login to book tickets");
                return;
            }
            if (!selectedTime || !selectedSeat.length) {
                toast.error("Please select at least one seat to book");
                return;
            }

            const token = await getToken();
            const { data } = await axios.post('/api/booking/create', {
                showId: selectedTime.showId || id,
                selectedSeats: selectedSeat
            }, { headers: { Authorization: `Bearer ${token}` } });

            if (data.success) {
                // redirect to My Bookings
                toast.success('Booking successful');
                navigate('/my-bookings');
            } else {
                toast.error(data.message || "Failed to book tickets");
            }
        } catch (error) {
            console.log("Error booking tickets:", error);
            toast.error('Error booking tickets');
        }
    }


    return show ? (
        <div className='min-h-screen py-32 px-6 md:px-16 lg:px-40'>
            {/* Movie Info Header */}
            <div className='bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-6 mb-8'>
                <div className='flex items-center gap-6'>
                    <img
                        src={image_base_url + show.movie.poster_path}
                        alt={show.movie.title}
                        className='w-24 h-36 object-cover rounded-xl border-2 border-beige/20'
                    />
                    <div className='flex-1'>
                        <h1 className='text-3xl font-bold text-beige mb-2'>{show.movie.title}</h1>
                        <div className='flex flex-wrap items-center gap-4 text-sm text-beige/60'>
                            <div className='flex items-center gap-2'>
                                <Star className='w-4 h-4 text-primary fill-primary' />
                                <span>{show.movie.vote_average.toFixed(1)}</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <Film className='w-4 h-4' />
                                <span>{show.movie.genres.slice(0, 2).map(g => g.name).join(', ')}</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <Calendar className='w-4 h-4' />
                                <span>{new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className='flex flex-col lg:flex-row gap-8'>
                {/* Time Selection Sidebar */}
                <div className='lg:w-80'>
                    <div className='bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-6 lg:sticky lg:top-32'>
                        <h2 className='text-xl font-bold text-beige mb-6 flex items-center gap-2'>
                            <ClockIcon className='w-5 h-5 text-primary' />
                            Select Showtime
                        </h2>
                        <div className='space-y-2'>
                            {show.dateTime[date] ? show.dateTime[date].map((item) => (
                                <button
                                    key={item.time}
                                    onClick={() => setSelectedTime(item)}
                                    className={`
                                        w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                                        ${selectedTime?.time === item.time
                                            ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                            : 'bg-beige/5 border border-beige/20 hover:bg-beige/10 text-beige'
                                        }
                                    `}
                                >
                                    <ClockIcon className="w-4 h-4" />
                                    <div className='flex flex-col items-start'>
                                        <span className='font-bold'>{isoTimeFormat(item.time)}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-wider ${
                                            item.theaterType === 'Premium' ? 'text-yellow-400' : 
                                            item.theaterType === 'IMAX' ? 'text-purple-400' : 'text-blue-400'
                                        }`}>
                                            {item.theaterType}
                                        </span>
                                    </div>
                                    {selectedTime?.time === item.time && <Check className='w-4 h-4 ml-auto' />}
                                </button>
                            )) : (
                                <p className='text-sm text-beige/40 p-4 border border-beige/10 rounded-xl bg-black/20'>
                                    No showtimes available for this date.
                                </p>
                            )}
                        </div>

                        {/* Booking Summary */}
                        {selectedTime && selectedSeat.length > 0 && (
                            <div className='mt-6 pt-6 border-t border-beige/10'>
                                <h3 className='text-sm font-semibold text-beige/60 mb-3'>Booking Summary</h3>
                                <div className='space-y-2 text-sm'>
                                    <div className='flex justify-between text-beige'>
                                        <span>Selected Seats:</span>
                                        <span className='font-semibold'>{selectedSeat.join(', ')}</span>
                                    </div>
                                    <div className='flex justify-between text-beige'>
                                        <span>Total Seats:</span>
                                        <span className='font-semibold'>{selectedSeat.length}</span>
                                    </div>
                                    <div className='border-t border-white/5 my-2 pt-2 space-y-1'>
                                        <div className='flex justify-between text-xs text-beige/50'>
                                            <span>Base Price ({selectedSeat.length}x):</span>
                                            <span>${(selectedTime.showPrice * selectedSeat.length).toFixed(2)}</span>
                                        </div>
                                        {(theaterPremiums[selectedTime.theaterType] || 0) > 0 && (
                                            <div className='flex justify-between text-xs text-primary/70'>
                                                <span>{selectedTime.theaterType} Premium:</span>
                                                <span>+${(theaterPremiums[selectedTime.theaterType] * selectedSeat.length).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className='flex justify-between text-lg font-black text-white mt-2'>
                                            <span>Total:</span>
                                            <span>${((selectedTime.showPrice + (theaterPremiums[selectedTime.theaterType] || 0)) * selectedSeat.length).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Seat Selection Area */}
                <div className='flex-1'>
                    <div className='bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-8'>
                        {/* Screen */}
                        <div className='flex flex-col items-center mb-12'>
                            <div className='w-full max-w-2xl'>
                                <img src={assets.screenImage} alt='screen' className='w-full' />
                                <p className='text-center text-beige/40 text-sm mt-2 tracking-widest'>SCREEN</p>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className='flex flex-wrap justify-center gap-6 mb-8 pb-8 border-b border-beige/10'>
                            <div className='flex items-center gap-2'>
                                <div className='w-8 h-8 bg-beige/10 border-2 border-beige/20 rounded-lg flex items-center justify-center'>
                                    <Armchair className='w-4 h-4 text-beige/60' />
                                </div>
                                <span className='text-sm text-beige/60'>Available</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <div className='w-8 h-8 bg-primary border-2 border-primary rounded-lg flex items-center justify-center'>
                                    <Armchair className='w-4 h-4 text-white' />
                                </div>
                                <span className='text-sm text-beige/60'>Selected</span>
                            </div>
                            <div className='flex items-center gap-2'>
                                <div className='w-8 h-8 bg-gray-700 opacity-50 rounded-lg flex items-center justify-center'>
                                    <Armchair className='w-4 h-4 text-gray-500' />
                                </div>
                                <span className='text-sm text-beige/60'>Occupied</span>
                            </div>
                        </div>

                        {/* Seats Grid */}
                        <div className='flex flex-col items-center'>
                            <div className='space-y-8'>
                                {/* Front Rows */}
                                <div className='flex justify-center gap-4'>
                                    {groupRows[0].map(row => renderSeats(row))}
                                </div>

                                {/* Main Rows */}
                                <div className='grid grid-cols-2 gap-12'>
                                    {groupRows.slice(1).map((group, idx) => (
                                        <div key={idx} className='space-y-2'>
                                            {group.map((row) => renderSeats(row))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Checkout Button */}
                        <div className='flex justify-center mt-16'>
                            <button
                                onClick={bookTickets}
                                disabled={!selectedTime || selectedSeat.length === 0}
                                className="
                                    flex items-center gap-3 px-10 py-4
                                    text-base font-bold
                                    bg-primary text-white 
                                    hover:bg-primary-dull 
                                    disabled:bg-beige/20 disabled:cursor-not-allowed
                                    transition-all duration-200
                                    rounded-xl shadow-lg 
                                    hover:shadow-xl hover:shadow-primary/30
                                    active:scale-95
                                "
                            >
                                <Users className='w-5 h-5' />
                                {selectedTime ? (
                                    <>Proceed to Checkout (${((selectedTime.showPrice + (theaterPremiums[selectedTime.theaterType] || 0)) * selectedSeat.length).toFixed(2)})</>
                                ) : (
                                    <>Select Showtime & Seats</>
                                )}
                                <ArrowRight className="w-5 h-5" strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ) : <Loading />;
}

export default SeatLayout;