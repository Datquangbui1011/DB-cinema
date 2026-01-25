import React, { useCallback, useEffect, useState } from 'react';
import { CheckIcon, StarIcon, Calendar, Clock, DollarSign, Film, X, Users, Monitor, Sparkles } from 'lucide-react';
import Title from '../../components/admin/Title';
import Loading from '../../components/Loading';
import { useAppContext } from '../../context/AppContext';
import { toast } from 'react-hot-toast';

const AddShows = () => {
    const { axios, getToken, user, fetchShows } = useAppContext();
    const currency = import.meta.env.VITE_CURRENCY
    const [nowPlayingMovies, setNowPlayingMovies] = useState([])
    const [selectedMovie, setSelectedMovie] = useState(null)
    const [dateTimeSelection, setDateTimeSelection] = useState({})
    const [dateTimeInput, setDateTimeInput] = useState("")
    const [showPrice, setShowPrice] = useState("")
    const [theaterType, setTheaterType] = useState("Standard")
    const [addingShow, setAddingShow] = useState(false)


    const fetchNowPlayingMovies = useCallback(async () => {
        try {
            const token = await getToken();
            const { data } = await axios.get("/api/shows/now-playing", { headers: { Authorization: `Bearer ${token}` } });
            if (data.success) {
                setNowPlayingMovies(data.movies)
            }
        } catch (error) {
            console.log("Error fetching now playing movies:", error);
            toast.error("Error fetching movies");
        }
    }, [getToken, axios])

    const handleDateTimeAdd = () => {
        if (!dateTimeInput) return;
        const [date, time] = dateTimeInput.split("T");
        if (!date || !time) return;

        setDateTimeSelection((prev) => {
            const times = prev[date] || [];
            if (!times.includes(time)) {
                return {
                    ...prev,
                    [date]: [...times, time]
                }
            }
            return prev
        })

    }

    const handleRemoveTime = (date, time) => {
        setDateTimeSelection((prev) => {
            const filteredTimes = prev[date].filter((t) => t !== time);
            if (filteredTimes.length === 0) {
                const { [date]: _, ...rest } = prev;
                return rest;
            }
            return {
                ...prev,
                [date]: filteredTimes
            }
        })
    }

    const handleSubmit = async () => {
        try {
            if (!selectedMovie || Object.keys(dateTimeSelection).length === 0 || !showPrice) {
                return toast.error("Please fill all fields");
            }

            setAddingShow(true);

            const showInput = Object.entries(dateTimeSelection).map(([date, times]) => ({ date, time: times }));

            const payload = {
                movieId: selectedMovie,
                showInput,
                showPrice: Number(showPrice),
                theaterType
            };

            const { data } = await axios.post("/api/shows/add", payload, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) {
                toast.success(data.message)
                setSelectedMovie(null)
                setDateTimeSelection({})
                setShowPrice("")
                fetchShows()
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.log("Submission error:", error);
            toast.error("An error occurred while adding the show");
        }
        setAddingShow(false);
    }

    useEffect(() => {
        if (user) {
            fetchNowPlayingMovies()
        }
    }, [user, fetchNowPlayingMovies])


    return nowPlayingMovies.length > 0 ? (
        <div className="max-w-7xl mx-auto">
            <Title text1="Add" text2="Show" />

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mt-10 mb-12">
                <div className={`flex items-center gap-2 ${selectedMovie ? 'text-primary' : 'text-beige/50'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${selectedMovie ? 'border-primary bg-primary/20' : 'border-beige/30'}`}>
                        <Film className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Select Movie</span>
                </div>
                <div className={`h-0.5 w-16 ${showPrice ? 'bg-primary' : 'bg-beige/30'}`}></div>
                <div className={`flex items-center gap-2 ${showPrice ? 'text-primary' : 'text-beige/50'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${showPrice ? 'border-primary bg-primary/20' : 'border-beige/30'}`}>
                        <DollarSign className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Set Price</span>
                </div>
                <div className={`h-0.5 w-16 ${Object.keys(dateTimeSelection).length > 0 ? 'bg-primary' : 'bg-beige/30'}`}></div>
                <div className={`flex items-center gap-2 ${Object.keys(dateTimeSelection).length > 0 ? 'text-primary' : 'text-beige/50'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${Object.keys(dateTimeSelection).length > 0 ? 'border-primary bg-primary/20' : 'border-beige/30'}`}>
                        <Calendar className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Schedule</span>
                </div>
            </div>

            {/* Movie Selection Section */}
            <div className="bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-8 mb-8">
                <div className="flex items-center gap-3 mb-6">
                    <Film className="w-6 h-6 text-primary" />
                    <h2 className="text-xl font-semibold text-beige">Step 1: Select Movie</h2>
                </div>
                <p className="text-sm text-beige/60 mb-6">Choose from currently playing movies</p>

                <div className='flex flex-wrap gap-6'>
                    {nowPlayingMovies.map((movie) => (
                        <div
                            key={movie._id}
                            className={`relative w-40 cursor-pointer transition-all duration-300 ${selectedMovie === movie._id
                                ? 'scale-105 ring-2 ring-primary ring-offset-2 ring-offset-black rounded-lg'
                                : 'hover:scale-105 opacity-80 hover:opacity-100'
                                }`}
                            onClick={() => setSelectedMovie(movie._id)}
                        >
                            <div className="relative rounded-lg overflow-hidden shadow-xl">
                                <img src={movie.poster_path} alt={movie.title} className="w-full aspect-[2/3] object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>

                                {/* Rating Badge */}
                                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-full">
                                    <StarIcon className="w-3 h-3 text-primary fill-primary" />
                                    <span className="text-xs font-medium">{movie.vote_average.toFixed(1)}</span>
                                </div>

                                {/* Check Icon */}
                                {selectedMovie === movie._id && (
                                    <div className="absolute top-2 right-2 flex items-center justify-center bg-primary h-7 w-7 rounded-full shadow-lg">
                                        <CheckIcon className="w-4 h-4 text-white" strokeWidth={3} />
                                    </div>
                                )}

                                {/* Movie Info */}
                                <div className="absolute bottom-0 left-0 right-0 p-3">
                                    <p className="font-semibold text-sm line-clamp-2 mb-1">{movie.title}</p>
                                    <p className="text-beige/70 text-xs">{movie.release_date}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Price and Schedule Section */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
                {/* Show Price */}
                <div className="bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <DollarSign className="w-6 h-6 text-primary" />
                        <h2 className="text-xl font-semibold text-beige">Step 2: Set Price</h2>
                    </div>
                    <p className="text-sm text-beige/60 mb-6">Enter the ticket price for this show</p>

                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-beige/50 font-medium">
                            {currency}
                        </div>
                        <input
                            min={0}
                            type="number"
                            value={showPrice}
                            onChange={(e) => setShowPrice(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-black/30 border border-beige/20 rounded-xl px-4 pl-12 py-4 text-lg font-medium outline-none focus:border-primary transition-colors"
                        />
                    </div>
                </div>

                {/* Theater Type Selection */}
                <div className="bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <Users className="w-6 h-6 text-primary" />
                        <h2 className="text-xl font-semibold text-beige">Step 2.5: Theater Level</h2>
                    </div>
                    <p className="text-sm text-beige/60 mb-6">Select the theater category</p>

                    <div className="flex gap-4">
                        {[
                            { name: 'Standard', icon: <Monitor className="w-4 h-4" /> },
                            { name: 'IMAX', icon: <Sparkles className="w-4 h-4" /> },
                            { name: 'Premium', icon: <StarIcon className="w-4 h-4 text-yellow-500 fill-yellow-500" /> }
                        ].map((type) => (
                            <button
                                key={type.name}
                                onClick={() => setTheaterType(type.name)}
                                className={`flex-1 py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2 ${theaterType === type.name
                                    ? 'bg-primary/20 border-primary text-primary shadow-lg shadow-primary/20'
                                    : 'bg-black/30 border-beige/10 text-beige/50 hover:border-beige/30'
                                    }`}
                            >
                                {type.icon}
                                {type.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Date Time Selection */}
                <div className="bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <Calendar className="w-6 h-6 text-primary" />
                        <h2 className="text-xl font-semibold text-beige">Step 3: Add Schedule</h2>
                    </div>
                    <p className="text-sm text-beige/60 mb-6">Select date and time for showings</p>

                    <div className="flex gap-3">
                        <input
                            type="datetime-local"
                            value={dateTimeInput}
                            onChange={(e) => setDateTimeInput(e.target.value)}
                            className="flex-1 bg-black/30 border border-beige/20 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors"
                        />
                        <button
                            onClick={handleDateTimeAdd}
                            className="bg-primary hover:bg-primary-dull text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2"
                        >
                            <Clock className="w-4 h-4" />
                            Add
                        </button>
                    </div>
                </div>
            </div>

            {/* Selected Schedule Display */}
            {Object.keys(dateTimeSelection).length > 0 && (
                <div className="bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 rounded-2xl p-8 mb-8">
                    <h3 className="text-lg font-semibold text-beige mb-6 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        Selected Schedule ({Object.values(dateTimeSelection).flat().length} showtimes)
                    </h3>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(dateTimeSelection).map(([date, times]) => (
                            <div key={date} className="bg-black/30 backdrop-blur-sm border border-beige/10 rounded-xl p-5">
                                <p className="font-semibold text-primary mb-4 flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {times.map((time) => (
                                        <div key={time} className="group flex items-center gap-2 bg-beige/10 hover:bg-primary/20 border border-beige/20 px-3 py-2 rounded-lg text-sm transition-all">
                                            <Clock className="w-3 h-3 text-beige/60" />
                                            <span className="font-medium">{time}</span>
                                            <button
                                                onClick={() => handleRemoveTime(date, time)}
                                                className="ml-1 text-beige/40 hover:text-primary transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSubmit}
                    disabled={addingShow || !selectedMovie || !showPrice || Object.keys(dateTimeSelection).length === 0}
                    className="bg-primary hover:bg-primary-dull disabled:bg-beige/20 disabled:cursor-not-allowed text-white px-10 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-3 shadow-lg hover:shadow-primary/50"
                >
                    {addingShow ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Adding Shows...
                        </>
                    ) : (
                        <>
                            <CheckIcon className="w-5 h-5" />
                            Save Shows
                        </>
                    )}
                </button>
            </div>

        </div>
    ) : <Loading />;

};

export default AddShows;
