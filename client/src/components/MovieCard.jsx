import { StarIcon } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import timeFormat from "../lib/timeFormat";

import { useAppContext } from "../context/AppContext";

const MovieCard = ({ movie }) => {
    const navigate = useNavigate();
    const { image_base_url } = useAppContext();

    return (
        <div className='group flex flex-col justify-between bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl overflow-hidden hover:scale-105 hover:border-primary/30 transition-all duration-300'>
            {/* Image Container */}
            <div className='relative overflow-hidden'>
                <img
                    onClick={() => { navigate(`/movies/${movie.id || movie._id}`); scrollTo(0, 0); }}
                    src={movie.backdrop_path.startsWith('http') ? movie.backdrop_path : image_base_url + movie.backdrop_path}
                    alt={movie.title}
                    className='rounded-t-2xl h-52 w-full object-cover cursor-pointer group-hover:scale-110 transition-transform duration-500'
                />
                {/* Gradient overlay */}
                <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none'></div>
            </div>

            {/* Content */}
            <div className='p-4 flex flex-col flex-1'>
                <p className='font-bold text-beige text-lg truncate mb-2'>{movie.title}</p>

                <p className='text-sm text-beige/60 mb-4'>
                    {new Date(movie.release_date).getFullYear()} • {movie.genres.slice(0, 2).map(genre => genre.name).join(" | ")} • {timeFormat(movie.runtime)}
                </p>

                <div className='flex items-center justify-between mt-auto'>
                    <button
                        onClick={() => { navigate(`/movies/${movie.id || movie._id}`); scrollTo(0, 0) }}
                        className='px-5 py-2.5 text-sm bg-primary hover:bg-primary-dull transition-all rounded-xl font-semibold cursor-pointer shadow-md hover:shadow-lg'
                    >
                        Buy Tickets
                    </button>

                    <div className='flex items-center gap-1.5 bg-beige/10 px-3 py-2 rounded-full'>
                        <StarIcon className="w-4 h-4 text-primary fill-primary" />
                        <span className='text-sm font-semibold text-beige'>{movie.vote_average.toFixed(1)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MovieCard;
