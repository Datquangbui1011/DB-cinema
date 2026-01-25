import React from 'react';
import MovieCard from '../components/MovieCard';
import { useAppContext } from '../context/AppContext';

const Favorite = () => {
    const { favoriteMovies } = useAppContext();
    return favoriteMovies.length > 0 ? (
        <div className='relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
            <h1 className='text-4xl font-medium my-4'>Favorite Movies</h1>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
                {favoriteMovies.map((movie) => (
                    <MovieCard movie={movie} key={movie._id} />
                ))}
            </div>
        </div>
    ) : (
        <div className='flex flex-col items-center justify-center h-screen'>
            <h1 className='text-4xl font-medium my-4'>No movie found</h1>
        </div>
    )
}

export default Favorite;