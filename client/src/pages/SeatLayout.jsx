import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClockIcon } from 'lucide-react';
import { useState } from 'react';
import { useEffect } from 'react';
import { dummyShowsData, dummyDateTimeData, assets } from '../assets/assets';
import Loading from '../components/Loading';
import isoTimeFormat from '../lib/isoTimeFormat';
import toast from 'react-hot-toast';
import { ArrowRightIcon } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

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
                    return (
                        <button key={seatId} onClick={() => handleSeatClick(seatId)}
                            className={`h-8 w-8 rounded border border-primary/60 cursor-pointer ${selectedSeat.includes(seatId) && "bg-primary text-white"} ${occupiedSeats.includes(seatId) ? "opacity-50 cursor-not-allowed bg-gray-600" : ""}`}>
                            {seatId}
                        </button>
                    );
                })}

            </div>
        </div>

    )

    const getOccupiedSeats = async () => {
        try {
            // selectedTime contains the showId for the chosen time slot
            const showId = selectedTime?.showId || id;
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
        <div className='flex flex-col md:flex-row px-6 md:px-16 lg:px-16 lg:px-40 py-30 md:pt-50'>
            {/* Available Timmings*/}
            <div className='w-60 bg-primary/10 border border-primary/20 rounded-lg py-10 h-max md:sticky md:top-30'>
                <p className='text-lg font-semibold px-6'>Available Timmings</p>
                <div>
                    {show.dateTime[date].map((item) => (
                        <div key={item.time} onClick={() => setSelectedTime(item)} className={`flex items-center gap-2 px-6 py-2 w-max rounded-r-md cursor-pointer transition ${selectedTime?.time === item.time ? 'bg-primary text-white' : 'hover:bg-primary/10'}`}>
                            <ClockIcon className="w-4 h-4" />
                            <p className='text-sm'>{isoTimeFormat(item.time)}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Seat layout */}
            <div className='relative flex-1 flex flex-col items-center max-md:mt-16'>
                <h1 className='text-2xl font-semibold mb-4'>
                    Select your seat
                </h1>
                <img src={assets.screenImage} about='screen' />
                <p className='text-gray-400 text-sm mb-6'>SCREEN SIDE</p>
                <div className='flex flex-col items-center mt-10 text-xs text-gray-300'>
                    <div className='grid grid-cols-2 md:grid-cols-1 gap-8 md:gap-2 mb-6'>
                        {groupRows[0].map(row => renderSeats(row))}
                    </div>
                    <div className='grid grid-cols-2 gap-11'>
                        {groupRows.slice(1).map((group, idx) => (
                            <div key={idx} >
                                {group.map((row) => renderSeats(row))}
                            </div>
                        ))}

                    </div>
                </div>

                <button
                    onClick={bookTickets}
                    className="
                                flex items-center gap-2 mt-20 px-8 py-3
                                text-sm font-semibold
                                bg-primary text-white 
                                hover:bg-primary-dull 
                                transition-all duration-200
                                rounded-full shadow-md 
                                hover:shadow-lg 
                                active:scale-95
                            "
                >
                    Proceed to Checkout
                    <ArrowRightIcon className="w-4 h-4" strokeWidth={3} />
                </button>

            </div>
        </div>
    ) : <Loading />;
}

export default SeatLayout;