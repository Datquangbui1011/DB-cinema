import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayCircleIcon, StarIcon, XIcon, Clock, Calendar, Film, Heart, Ticket, Users } from 'lucide-react';
import { useState } from 'react';
import { useEffect } from 'react';
import timeFormat from '../lib/timeFormat';
import DateSelect from './DateSelect';
import MovieCard from '../components/MovieCard';
import Loading from '../components/Loading';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';


const MovieDetails = () => {

    const navigate = useNavigate();
    const { id } = useParams();
    const [show, setShow] = useState(null);
    // const [selectedDate, setSelectedDate] = useState(null);
    // const [selectedTime, setSelectedTime] = useState(null);
    const [isTrailerOpen, setIsTrailerOpen] = useState(false);
    const { shows, axios, getToken, user, fetchFavoriteMovies, favoriteMovies, image_base_url } = useAppContext();

    const getShow = async () => {
        try {
            const { data } = await axios.get(`/api/shows/${id}`);
            if (data.success) {
                setShow(data);
            }
        } catch (error) {
            console.log(error);
        }

    }

    useEffect(() => {
        getShow();
    }, [id]);


    const handleFavorite = async () => {
        try {
            if (!user) return toast.error('Please login to add to favorite');
            const token = await getToken();
            const { data } = await axios.post(`/api/user/update-favorite`, { movieId: id }, { headers: { Authorization: `Bearer ${token}` } });
            if (data.success) {
                await fetchFavoriteMovies();
                toast.success('Added to favorite');
            }
        } catch (error) {
            console.log(error);
            toast.error('Failed to add to favorite');
        }
    }


    return show ? (
        <div className='min-h-screen'>
            {/* Hero Section with Backdrop */}
            <div className='relative h-[70vh] md:h-[80vh]'>
                {/* Backdrop Image */}
                <div className='absolute inset-0'>
                    <img
                        src={image_base_url + show.movie.backdrop_path}
                        alt={show.movie.title}
                        className='w-full h-full object-cover'
                    />
                    <div className='absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40'></div>
                    <div className='absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent'></div>
                </div>

                {/* Content */}
                <div className='relative h-full px-6 md:px-16 lg:px-40 flex items-end pb-16'>
                    <div className='flex flex-col md:flex-row gap-8 max-w-7xl w-full'>
                        {/* Poster */}
                        <div className='flex-shrink-0'>
                            <img
                                src={image_base_url + show.movie.poster_path}
                                alt={show.movie.title}
                                className='rounded-2xl h-80 md:h-96 w-auto object-cover shadow-2xl border-2 border-beige/20'
                            />
                        </div>

                        {/* Movie Info */}
                        <div className='flex flex-col justify-end flex-1'>
                            <div className='inline-flex items-center gap-2 bg-primary/20 border border-primary/40 px-3 py-1 rounded-full w-fit mb-4'>
                                <span className='text-primary text-sm font-semibold'>ENGLISH</span>
                            </div>

                            <h1 className='text-4xl md:text-6xl font-bold text-beige mb-4 leading-tight'>
                                {show.movie.title}
                            </h1>

                            {/* Meta Info */}
                            <div className='flex flex-wrap items-center gap-4 mb-6'>
                                <div className='flex items-center gap-2 bg-beige/10 backdrop-blur-sm px-4 py-2 rounded-full'>
                                    <StarIcon className="w-5 h-5 text-primary fill-primary" />
                                    <span className='font-semibold text-beige'>{show.movie.vote_average.toFixed(1)}</span>
                                    <span className='text-beige/60 text-sm'>Rating</span>
                                </div>

                                <div className='flex items-center gap-2 bg-beige/10 backdrop-blur-sm px-4 py-2 rounded-full'>
                                    <Clock className="w-5 h-5 text-beige/60" />
                                    <span className='text-beige'>{timeFormat(show.movie.runtime)}</span>
                                </div>

                                <div className='flex items-center gap-2 bg-beige/10 backdrop-blur-sm px-4 py-2 rounded-full'>
                                    <Calendar className="w-5 h-5 text-beige/60" />
                                    <span className='text-beige'>{show.movie.release_date.split('-')[0]}</span>
                                </div>
                            </div>

                            {/* Genres */}
                            <div className='flex flex-wrap gap-2 mb-6'>
                                {show.movie.genres.map((genre, index) => (
                                    <span key={index} className='px-3 py-1 bg-beige/5 border border-beige/20 rounded-full text-sm text-beige/80'>
                                        {genre.name}
                                    </span>
                                ))}
                            </div>

                            {/* Action Buttons */}
                            <div className='flex items-center flex-wrap gap-4'>
                                <a
                                    href="#dateSelect"
                                    className='flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary-dull transition rounded-xl font-semibold cursor-pointer shadow-lg shadow-primary/30 hover:shadow-primary/50'
                                >
                                    <Ticket className="w-5 h-5" />
                                    Buy Tickets
                                </a>

                                <button
                                    onClick={() => {
                                        if (show.movie.trailer_path) {
                                            setIsTrailerOpen(true);
                                        } else {
                                            toast.error("Trailer not available");
                                        }
                                    }}
                                    className='flex items-center gap-2 px-8 py-4 bg-beige/10 hover:bg-beige/20 backdrop-blur-sm border border-beige/20 transition rounded-xl font-semibold cursor-pointer'
                                >
                                    <PlayCircleIcon className="w-5 h-5" />
                                    Watch Trailer
                                </button>

                                <button
                                    onClick={handleFavorite}
                                    className='p-4 bg-beige/10 hover:bg-beige/20 backdrop-blur-sm border border-beige/20 rounded-xl transition cursor-pointer'
                                >
                                    <Heart className={`w-6 h-6 ${favoriteMovies.some(movie => movie._id === id) ? 'fill-primary text-primary' : 'text-beige'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className='px-6 md:px-16 lg:px-40 py-16'>
                {/* Overview Section */}
                <div className='max-w-7xl mx-auto mb-20'>
                    <div className='bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl p-8'>
                        <h2 className='text-2xl font-bold text-beige mb-4 flex items-center gap-3'>
                            <Film className="w-6 h-6 text-primary" />
                            Overview
                        </h2>
                        <p className='text-beige/80 leading-relaxed text-lg'>
                            {show.movie.overview}
                        </p>
                    </div>
                </div>

                {/* Cast Section */}
                <div className='max-w-7xl mx-auto mb-20'>
                    <h2 className='text-2xl font-bold text-beige mb-8 flex items-center gap-3'>
                        <Users className="w-6 h-6 text-primary" />
                        Featured Cast
                    </h2>
                    <div className='overflow-x-auto no-scrollbar pb-4'>
                        <div className='flex gap-6 w-max'>
                            {show.movie.casts.slice(0, 12).map((cast, index) => (
                                <div key={index} className='group flex flex-col items-center text-center w-32'>
                                    <div className='relative mb-3'>
                                        <img
                                            src={image_base_url + cast.profile_path}
                                            alt={cast.name}
                                            className='rounded-2xl h-32 w-32 object-cover border-2 border-beige/10 group-hover:border-primary/50 transition-all shadow-lg'
                                        />
                                        <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity'></div>
                                    </div>
                                    <p className='text-sm font-semibold text-beige line-clamp-2'>{cast.name}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Date Select */}
                <DateSelect dateTime={show.dateTime} id={id} />

                {/* Similar Movies */}
                <div className='max-w-7xl mx-auto mt-20'>
                    <h2 className='text-2xl font-bold text-beige mb-8'>You May Also Like</h2>
                    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
                        {shows.slice(0, 4).map((movie, index) => (
                            <MovieCard key={index} movie={movie} />
                        ))}
                    </div>
                    <div className='flex justify-center mt-12'>
                        <button
                            onClick={() => navigate('/movies')}
                            className='px-10 py-4 bg-primary hover:bg-primary-dull transition rounded-xl font-semibold cursor-pointer shadow-lg'
                        >
                            Explore More Movies
                        </button>
                    </div>
                </div>
            </div>

            {/* Trailer Modal */}
            {isTrailerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="relative w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl shadow-primary/30 border border-primary/20">
                        <button
                            onClick={() => setIsTrailerOpen(false)}
                            className="absolute top-4 right-4 text-white/70 hover:text-white z-10 bg-black/50 hover:bg-primary backdrop-blur-md rounded-full p-3 transition-all duration-300 group"
                        >
                            <XIcon className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                        <iframe
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${show.movie.trailer_path}?autoplay=1`}
                            title="Movie Trailer"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>
                </div>
            )}
        </div>
    ) : <Loading />
}

export default MovieDetails;