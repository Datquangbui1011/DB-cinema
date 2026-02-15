import React from 'react';
import MovieCard from '../components/MovieCard';
import { useAppContext } from '../context/AppContext';

const Movie = () => {
    const { shows } = useAppContext();

    if (shows.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-white">
                <h1 className="text-3xl sm:text-4xl font-medium my-4">No movies found</h1>
            </div>
        );
    }

    return (
        <div className="relative my-20 sm:my-28 md:my-32 mb-40 sm:mb-48 md:mb-60 px-4 sm:px-6 md:px-12 lg:px-16 xl:px-24 min-h-[80vh]">
            <h1 className="text-3xl sm:text-4xl md:text-4xl font-medium mb-6 sm:mb-8 md:mb-10">
                Now Showing
            </h1>

            {/* 
                grid-cols-2   → 2 columns on mobile 
                sm:grid-cols-3 → 3 columns from ~640px
                md:grid-cols-4 → 4 columns from ~768px
                lg:grid-cols-5 → 5 columns from ~1024px (adjust as needed)
            */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5 md:gap-6 lg:gap-7">
                {shows.map((movie) => (
                    <MovieCard movie={movie} key={movie._id} />
                ))}
            </div>
        </div>
    );
};

export default Movie;