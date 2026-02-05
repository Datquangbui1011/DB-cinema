import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayCircleIcon, StarIcon, XIcon, Clock, Calendar, Film, Heart, Ticket, Users, ChevronLeft } from 'lucide-react';
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
        // Scroll to top when loading new movie
        window.scrollTo(0, 0);
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
        <div className='min-h-screen bg-black text-white pb-24 md:pb-0'>
            {/* Mobile Back Button */}
            <button 
                onClick={() => navigate(-1)} 
                className="fixed top-4 left-4 z-[60] p-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 md:hidden text-white hover:bg-white/10 transition-colors"
            >
                <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Hero Section with Backdrop */}
            <div className='relative h-[60vh] md:h-[80vh] w-full'>
                {/* Backdrop Image */}
                <div className='absolute inset-0'>
                    <img
                        src={image_base_url + show.movie.backdrop_path}
                        alt={show.movie.title}
                        className='w-full h-full object-cover'
                    />
                    <div className='absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30 md:to-black/30'></div>
                    <div className='hidden md:block absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent'></div>
                </div>

                {/* Content */}
                <div className='relative h-full px-6 md:px-16 lg:px-40 flex items-end pb-8 md:pb-16'>
                    <div className='flex flex-col md:flex-row gap-6 md:gap-8 max-w-7xl w-full items-start md:items-end'>
                        {/* Poster - Hidden on small mobile, visible on larger */}
                        <div className='hidden md:block flex-shrink-0'>
                            <img
                                src={image_base_url + show.movie.poster_path}
                                alt={show.movie.title}
                                className='rounded-2xl h-80 md:h-96 w-auto object-cover shadow-2xl border-2 border-beige/20'
                            />
                        </div>

                        {/* Movie Info */}
                        <div className='flex flex-col justify-end flex-1 w-full'>
                            <div className='inline-flex items-center gap-2 bg-primary/20 border border-primary/40 px-3 py-1 rounded-full w-fit mb-3 md:mb-4'>
                                <span className='text-primary text-xs md:text-sm font-semibold tracking-wider'>ENGLISH</span>
                            </div>

                            <h1 className='text-3xl md:text-6xl font-bold text-white mb-2 md:mb-4 leading-tight drop-shadow-xl'>
                                {show.movie.title}
                            </h1>

                            {/* Meta Info */}
                            <div className='flex flex-wrap items-center gap-3 md:gap-4 mb-4 md:mb-6 text-sm md:text-base'>
                                <div className='flex items-center gap-1.5 md:gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10'>
                                    <StarIcon className="w-4 h-4 md:w-5 md:h-5 text-yellow-500 fill-yellow-500" />
                                    <span className='font-bold text-white'>{show.movie.vote_average.toFixed(1)}</span>
                                </div>

                                <div className='flex items-center gap-1.5 md:gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10'>
                                    <Clock className="w-4 h-4 md:w-5 md:h-5 text-gray-300" />
                                    <span className='text-gray-200'>{timeFormat(show.movie.runtime)}</span>
                                </div>

                                <div className='flex items-center gap-1.5 md:gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10'>
                                    <Calendar className="w-4 h-4 md:w-5 md:h-5 text-gray-300" />
                                    <span className='text-gray-200'>{show.movie.release_date.split('-')[0]}</span>
                                </div>
                            </div>

                            {/* Genres */}
                            <div className='flex flex-wrap gap-2 mb-6 md:mb-6'>
                                {show.movie.genres.map((genre, index) => (
                                    <span key={index} className='px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs md:text-sm text-gray-300'>
                                        {genre.name}
                                    </span>
                                ))}
                            </div>

                            {/* Desktop Action Buttons */}
                            <div className='hidden md:flex items-center flex-wrap gap-4'>
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
                                    className='flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 transition rounded-xl font-semibold cursor-pointer'
                                >
                                    <PlayCircleIcon className="w-5 h-5" />
                                    Watch Trailer
                                </button>

                                <button
                                    onClick={handleFavorite}
                                    className='p-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl transition cursor-pointer'
                                >
                                    <Heart className={`w-6 h-6 ${favoriteMovies.some(movie => movie._id === id) ? 'fill-primary text-primary' : 'text-white'}`} />
                                </button>
                            </div>

                             {/* Mobile Text Action Buttons (Trailer & Favorite) */}
                             <div className="flex md:hidden items-center gap-3 w-full">
                                <button
                                    onClick={() => {
                                        if (show.movie.trailer_path) {
                                            setIsTrailerOpen(true);
                                        } else {
                                            toast.error("Trailer not available");
                                        }
                                    }}
                                    className='flex-1 flex items-center justify-center gap-2 py-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-xl font-semibold text-sm'
                                >
                                    <PlayCircleIcon className="w-4 h-4" />
                                    Trailer
                                </button>
                                <button
                                    onClick={handleFavorite}
                                    className='flex-1 flex items-center justify-center gap-2 py-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-xl font-semibold text-sm'
                                >
                                    <Heart className={`w-4 h-4 ${favoriteMovies.some(movie => movie._id === id) ? 'fill-primary text-primary' : 'text-white'}`} />
                                    {favoriteMovies.some(movie => movie._id === id) ? 'Saved' : 'Favorite'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className='px-6 md:px-16 lg:px-40 py-8 md:py-16'>
                {/* Overview Section */}
                <div className='max-w-7xl mx-auto mb-10 md:mb-20'>
                    <div className='bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-sm'>
                        <h2 className='text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-3'>
                            <Film className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                            Overview
                        </h2>
                        <p className='text-gray-300 leading-relaxed text-sm md:text-lg'>
                            {show.movie.overview}
                        </p>
                    </div>
                </div>

                {/* Cast Section */}
                <div className='max-w-7xl mx-auto mb-10 md:mb-20'>
                    <h2 className='text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-3'>
                        <Users className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                        Featured Cast
                    </h2>
                    <div className='overflow-x-auto no-scrollbar pb-4 -mx-6 px-6 md:mx-0 md:px-0'>
                        <div className='flex gap-4 md:gap-6 w-max'>
                            {show.movie.casts.slice(0, 12).map((cast, index) => (
                                <div key={index} className='group flex flex-col items-center text-center w-24 md:w-32'>
                                    <div className='relative mb-3'>
                                        <img
                                            src={image_base_url + cast.profile_path}
                                            alt={cast.name}
                                            className='rounded-xl md:rounded-2xl h-24 w-24 md:h-32 md:w-32 object-cover border border-white/10 group-hover:border-primary/50 transition-all shadow-lg'
                                        />
                                        <div className='absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-xl md:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity'></div>
                                    </div>
                                    <p className='text-xs md:text-sm font-semibold text-gray-300 line-clamp-2'>{cast.name}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Date Select */}
                <div id="dateSelect" className="scroll-mt-24 md:scroll-mt-32">
                     <DateSelect dateTime={show.dateTime} id={id} />
                </div>

                {/* Similar Movies */}
                <div className='max-w-7xl mx-auto mt-16 md:mt-20'>
                    <h2 className='text-xl md:text-2xl font-bold text-white mb-6 md:mb-8'>You May Also Like</h2>
                    <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6'>
                        {shows.slice(0, 4).map((movie, index) => (
                            <MovieCard key={index} movie={movie} />
                        ))}
                    </div>
                    <div className='flex justify-center mt-12'>
                        <button
                            onClick={() => navigate('/movies')}
                            className='px-8 py-3 md:px-10 md:py-4 bg-white/10 hover:bg-primary transition rounded-xl font-semibold cursor-pointer border border-white/10'
                        >
                            Explore More Movies
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Sticky Buy Button */}
            <div className="fixed md:hidden bottom-20 left-4 right-4 z-40">
                <a 
                    href="#dateSelect"
                    className="flex justify-center items-center gap-2 w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-black/50 active:scale-95 transition-transform"
                    onClick={(e) => {
                         e.preventDefault();
                         document.getElementById('dateSelect').scrollIntoView({ behavior: 'smooth' });
                    }}
                >
                    <Ticket className="w-5 h-5" />
                    Book Tickets
                </a>
            </div>

            {/* Trailer Modal */}
            {isTrailerOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-fadeIn">
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