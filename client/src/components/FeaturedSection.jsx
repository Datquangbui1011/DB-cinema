import React from 'react';
import { ArrowRight, Film, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BlurCircle from './BlurCircle';
import MovieCard from './MovieCard';
import { useAppContext } from '../context/AppContext';

const FeaturedSection = () => {
    const navigate = useNavigate();
    const { shows } = useAppContext();

    return (
        <div className='px-6 md:px-16 lg:px-40 py-20 overflow-hidden'>
            {/* Section Header */}
            <div className='max-w-7xl mx-auto mb-12'>
                <div className='flex items-center justify-between'>
                    <div>
                        <div className='flex items-center gap-3 mb-2'>
                            <Film className='w-6 h-6 text-primary' />
                            <h2 className='text-3xl md:text-4xl font-bold text-beige'>Now Showing</h2>
                        </div>
                        <p className='text-beige/60'>Catch the latest movies in theaters</p>
                    </div>
                    <button
                        onClick={() => { navigate('/movies'); scrollTo(0, 0); }}
                        className='hidden md:flex items-center gap-2 px-6 py-3 bg-beige/10 hover:bg-beige/20 border border-beige/20 rounded-xl transition-all group'
                    >
                        <span className='text-beige font-semibold'>View All</span>
                        <ArrowRight className='w-5 h-5 text-primary group-hover:translate-x-1 transition-transform' />
                    </button>
                </div>
            </div>

            {/* Movies Grid */}
            <div className='max-w-7xl mx-auto'>
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
                    {shows.slice(0, 8).map((show) => (
                        <MovieCard key={show.id || show._id} movie={show} />
                    ))}
                </div>
            </div>

            {/* Show More Button */}
            <div className='flex justify-center mt-16'>
                <button
                    onClick={() => { navigate('/movies'); scrollTo(0, 0); }}
                    className='flex items-center gap-3 px-10 py-4 bg-primary hover:bg-primary-dull transition-all rounded-xl font-semibold shadow-lg hover:shadow-xl hover:shadow-primary/30 active:scale-95'
                >
                    <Sparkles className='w-5 h-5' />
                    Explore All Movies
                    <ArrowRight className='w-5 h-5' />
                </button>
            </div>
        </div>
    );
};

export default FeaturedSection;