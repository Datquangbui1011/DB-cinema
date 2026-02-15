import React from 'react';
import MovieCard from '../components/MovieCard';
import { useAppContext } from '../context/AppContext';

const Favorite = () => {
    const { favoriteMovies } = useAppContext();
    return favoriteMovies.length > 0 ? (
        <div className='relative my-20 md:my-40 mb-40 md:mb-60 px-4 sm:px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
            <h1 className='text-2xl sm:text-3xl md:text-4xl font-medium my-4 md:my-6 text-white'>Favorite Movies</h1>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8'>
                {favoriteMovies.map((movie) => (
                    <MovieCard movie={movie} key={movie._id} />
                ))}
            </div>
        </div>
    ) : (
        <div className='flex flex-col items-center justify-center h-screen px-6'>
            <h1 className='text-2xl sm:text-3xl md:text-4xl font-medium my-4 text-white text-center'>No Favorite Movies</h1>
            <p className='text-gray-400 text-center mt-2'>Start adding movies to your favorites!</p>
        </div>
    )
}

export default Favorite;