import React from 'react';
import { dummyShowsData } from '../assets/assets';
import MovieCard from '../components/MovieCard';

const Favorite = () => {
    return dummyShowsData.length > 0 ? (
        <div className='relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]'>
            <h1 className='text-4xl font-medium my-4'>Favorite Movies</h1>
            <div className='flex flex-wrap max-sm:justify-center gap-8'>
                {dummyShowsData.map((movie) => (
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