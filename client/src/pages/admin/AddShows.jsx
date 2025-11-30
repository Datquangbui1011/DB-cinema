import React from 'react';
import { dummyShowsData } from '../../assets/assets';
import Title from '../../components/admin/Title';
import Loading from '../../components/Loading';
import { useEffect, useState } from 'react'
import { CheckIcon, StarIcon } from 'lucide-react';
import { kConverter } from '../../lib/kConverter';

const AddShows = () => {
    const currency = import.meta.env.VITE_CURRENCY
    const [nowPlayingMovies, setNowPlayingMovies] = useState([])
    const [selectedMovie, setSelectedMovie] = useState(null)
    const [dateTimeSelection, setDateTimeSelection] = useState({})
    const [dateTimeInput, setDateTimeInput] = useState("")
    const [showPrice, setShowPrice] = useState("")


    const fetchNowPlayingMovies = async () => {
        setNowPlayingMovies(dummyShowsData)
    };

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

    const handleSaveShows = () => {

    }

    useEffect(() => {
        fetchNowPlayingMovies()
    }, [])


    return nowPlayingMovies.length > 0 ? (
        <>
            <Title text1="Add" text2="Show" />
            <p className="mt-10 text-lg font-medium">Now Playing Movies</p>
            <div className='group flex flex-wrap gap-4 mt-4 w-max'>
                {nowPlayingMovies.map((movie) => (
                    <div key={movie._id} className={'relative max-w-40 cursor-pointer group-hover:not-hover:opacity-40 hover:-translate-y-1 transition duration-300'} onClick={() => setSelectedMovie(movie._id)}>
                        <div className="relative rounded-lg overflow-hidden">
                            <img src={movie.poster_path} alt='' className="w-full object-cover brightness-90" />
                            <div className="text-sm flex items-center justify-between p-2 bg-black/70 w-full absolute bottom-0 left-0">
                                <p className="flex items-center gap-1 text-gray-400">
                                    <StarIcon className="w-4 h-4 text-primary fill-primary" />
                                    {movie.vote_average.toFixed(1)}
                                </p>
                                <p className="text-gray-300">{kConverter(movie.vote_count)} Votes </p>
                            </div>
                        </div>
                        {selectedMovie === movie._id && (
                            <div className="absolute top-2 right-2 flex items-center justify-center bg-primary h-6 w-6 rounded">
                                <CheckIcon className="w-4 h-4 text-white" strokeWidth={2.5} />
                            </div>
                        )}
                        <p className="font-medium truncate">{movie.title}</p>
                        <p className="text-gray-400 text-sm">{movie.release_date}</p>
                    </div>
                ))}
            </div>
            {/* show price input */}
            <div className="mt-8">
                <label className="block text-sm font-medium mb-2">Show Price</label>
                <div className="inline-flex items-center gap-2 border border-gray-600 px-3 py-2 rounded-md" >
                    <p className="text-gray-400 text-sm">{currency}</p>
                    <input min={0} type="number" value={showPrice} onChange={(e) => setShowPrice(e.target.value)} placeholder="Enter show price" className="outline-none" />
                </div>
            </div>

            {/* show time input */}
            <div className="mt-8">
                <label className="block text-sm font-medium mb-2">Select Date and Time</label>
                <div className="inline-flex gap-5 border border-gray-600 p-1 pl-3 rounded-lg" >
                    <input type="datetime-local" value={dateTimeInput} onChange={(e) => setDateTimeInput(e.target.value)} className="outline-none rounded-md" />
                    <button onClick={handleDateTimeAdd} className="bg-primary/80 text-white px-3 py-2 text-sm rounded-lg hover:bg-primary cursor-pointer">Add Time</button>
                </div>
            </div>



            {/* Display selected times */}
            {Object.keys(dateTimeSelection).length > 0 && (
                <div className="mt-8">
                    <p className="text-lg font-medium">Selected Schedule</p>
                    <div className="flex flex-wrap gap-4">
                        {Object.entries(dateTimeSelection).map(([date, times]) => (
                            <div key={date} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                                <p className="font-medium text-primary mb-2">{date}</p>
                                <div className="flex flex-wrap gap-2">
                                    {times.map((time) => (
                                        <div key={time} className="flex items-center gap-2 bg-gray-700 px-3 py-1 rounded-full text-sm">
                                            <span>{time}</span>
                                            <button
                                                onClick={() => handleRemoveTime(date, time)}
                                                className="text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Save button */}
            <div className="mt-10">
                <button
                    onClick={handleSaveShows}
                    className="bg-primary text-white px-8 py-3 rounded-lg font-medium hover:bg-primary-dull transition duration-300 w-full sm:w-auto"
                >
                    Save Shows
                </button>
            </div>

        </>
    ) : <Loading />;

};

export default AddShows;
