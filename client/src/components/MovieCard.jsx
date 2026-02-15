import { StarIcon, Clock, Calendar, Ticket } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import timeFormat from "../lib/timeFormat";
import { useAppContext } from "../context/AppContext";

const MovieCard = ({ movie }) => {
    const navigate = useNavigate();
    const { image_base_url } = useAppContext();

    const handleNavigate = () => {
        navigate(`/movies/${movie.id || movie._id}`);
        window.scrollTo(0, 0);
    };

    return (
        <div className='group relative flex flex-col bg-white/5 rounded-lg sm:rounded-xl md:rounded-2xl overflow-hidden border border-white/10 hover:border-primary/50 transition-all duration-300 hover:scale-[1.02] sm:hover:scale-[1.03] md:hover:scale-105 hover:shadow-lg sm:hover:shadow-xl md:hover:shadow-2xl hover:shadow-primary/20'>
            
            {/* Poster Image - Responsive Aspect Ratio */}
            <div 
                onClick={handleNavigate}
                className='relative aspect-[3/4] sm:aspect-[2/3] md:aspect-[2/3] overflow-hidden bg-gray-900 cursor-pointer'
            >
                <img
                    src={movie.backdrop_path?.startsWith('http') 
                        ? movie.backdrop_path 
                        : image_base_url + movie.backdrop_path
                    }
                    alt={movie.title}
                    className='w-full h-full object-cover group-hover:scale-105 sm:group-hover:scale-110 transition-transform duration-500'
                    loading="lazy"
                />
                
                {/* Gradient Overlay - Responsive Opacity */}
                <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent sm:from-black/70 sm:via-black/20 md:from-black/60 opacity-70 group-hover:opacity-90 transition-opacity duration-300'></div>
                
                {/* Rating Badge - Responsive Size & Position */}
                <div className='absolute top-1.5 right-1.5 sm:top-2 sm:right-2 md:top-3 md:right-3 flex items-center gap-0.5 sm:gap-1 bg-black/90 backdrop-blur-sm px-1.5 py-0.5 sm:px-2 sm:py-1 md:px-2.5 md:py-1.5 rounded-md sm:rounded-lg border border-yellow-500/30'>
                    <StarIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-yellow-500 fill-yellow-500" />
                    <span className='text-white font-bold text-[10px] sm:text-xs md:text-sm'>
                        {movie.vote_average.toFixed(1)}
                    </span>
                </div>

                {/* Hover Play Icon - Desktop Only */}
                <div className='hidden lg:flex absolute inset-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                    <div className='bg-primary/90 backdrop-blur-sm rounded-full p-3 md:p-4 transform scale-90 group-hover:scale-100 transition-transform duration-300'>
                        <Ticket className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </div>
                </div>
            </div>

            {/* Movie Info - Responsive Padding */}
            <div className='p-2.5 sm:p-3 md:p-4 flex-1 flex flex-col'>
                
                {/* Title - Responsive Font Size */}
                <h3 
                    onClick={handleNavigate}
                    className='text-white font-bold text-xs sm:text-sm md:text-base lg:text-lg mb-1 sm:mb-1.5 md:mb-2 line-clamp-2 cursor-pointer group-hover:text-primary transition-colors leading-tight'
                >
                    {movie.title}
                </h3>
                
                {/* Meta Info - Responsive Sizing */}
                <div className='flex flex-wrap items-center gap-1 sm:gap-1.5 md:gap-2 text-gray-400 text-[10px] sm:text-xs md:text-sm mb-2 sm:mb-2.5 md:mb-3'>
                    {/* Year */}
                    <div className='flex items-center gap-0.5 sm:gap-1'>
                        <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5" />
                        <span>{new Date(movie.release_date).getFullYear()}</span>
                    </div>
                    
                    {/* Separator */}
                    <span className='text-gray-600 hidden xs:inline'>•</span>
                    
                    {/* Runtime */}
                    <div className='flex items-center gap-0.5 sm:gap-1'>
                        <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5" />
                        <span className='hidden xs:inline'>{timeFormat(movie.runtime)}</span>
                        <span className='xs:hidden'>{movie.runtime}m</span>
                    </div>
                </div>

                {/* Genres - Show on Tablet & Desktop Only */}
                <div className='hidden sm:flex flex-wrap gap-1 md:gap-1.5 mb-2 md:mb-3 lg:mb-4'>
                    {movie.genres.slice(0, 2).map((genre, index) => (
                        <span 
                            key={index}
                            className='text-[10px] sm:text-xs bg-white/5 border border-white/10 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-gray-400 truncate'
                        >
                            {genre.name}
                        </span>
                    ))}
                </div>

                {/* Single Genre Badge - Mobile Only */}
                <div className='flex sm:hidden mb-2'>
                    {movie.genres.slice(0, 1).map((genre, index) => (
                        <span 
                            key={index}
                            className='text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-400'
                        >
                            {genre.name}
                        </span>
                    ))}
                </div>
                
                {/* Button - Fully Responsive */}
                <button
                    onClick={handleNavigate}
                    className='mt-auto w-full flex items-center justify-center gap-1 sm:gap-1.5 md:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-2.5 lg:py-3 bg-primary hover:bg-primary-dull transition-all rounded-md sm:rounded-lg md:rounded-xl font-semibold text-white text-[11px] sm:text-xs md:text-sm lg:text-base cursor-pointer shadow-md hover:shadow-lg hover:shadow-primary/30 active:scale-95'
                >
                    <Ticket className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" />
                    <span className='hidden xs:inline'>Book Now</span>
                    <span className='xs:hidden'>Book</span>
                </button>
            </div>
        </div>
    );
};

export default MovieCard;