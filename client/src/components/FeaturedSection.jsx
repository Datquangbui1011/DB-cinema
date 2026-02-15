import React from 'react';
import { ArrowRight, Film, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BlurCircle from './BlurCircle';           // assuming you still want to keep it
import MovieCard from './MovieCard';
import { useAppContext } from '../context/AppContext';

const FeaturedSection = () => {
    const navigate = useNavigate();
    const { shows } = useAppContext();

    return (
        <div className="px-5 sm:px-6 md:px-12 lg:px-16 xl:px-24 py-12 sm:py-16 md:py-20 overflow-hidden">
            {/* Section Header */}
            <div className="max-w-7xl mx-auto mb-8 sm:mb-10 md:mb-12">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                            <Film className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-beige">
                                Now Showing
                            </h2>
                        </div>
                        <p className="text-beige/70 text-sm sm:text-base">
                            Catch the latest movies in theaters
                        </p>
                    </div>

                    {/* "View All" visible on md+ */}
                    <button
                        onClick={() => {
                            navigate('/movies');
                            window.scrollTo(0, 0);
                        }}
                        className="hidden md:flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-beige/10 hover:bg-beige/20 border border-beige/20 rounded-xl transition-all group whitespace-nowrap"
                    >
                        <span className="text-beige font-semibold text-sm sm:text-base">View All</span>
                        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-primary group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Movies Grid – 2 columns on mobile */}
            <div className="max-w-7xl mx-auto">
                <div className="
                    grid grid-cols-2           /* mobile: 2 columns */
                    sm:grid-cols-2             /* ~640px+: still 2 (optional) */
                    md:grid-cols-3             /* ~768px+: 3 columns */
                    lg:grid-cols-4             /* ~1024px+: 4 columns */
                    xl:grid-cols-4             /* very wide: stay at 4 or increase if you want */
                    gap-4 sm:gap-5 md:gap-6 lg:gap-7 xl:gap-8
                ">
                    {shows.slice(0, 8).map((show) => (
                        <MovieCard 
                            key={show._id || show.id} 
                            movie={show} 
                        />
                    ))}
                </div>
            </div>

            {/* Show More / Explore Button */}
            <div className="flex justify-center mt-12 sm:mt-14 md:mt-16">
                <button
                    onClick={() => {
                        navigate('/movies');
                        window.scrollTo(0, 0);
                    }}
                    className="
                        flex items-center gap-2 sm:gap-3 
                        px-7 sm:px-9 md:px-10 py-3.5 sm:py-4 
                        bg-primary hover:bg-primary/90 active:bg-primary/80 
                        text-white font-semibold text-sm sm:text-base 
                        rounded-xl shadow-lg hover:shadow-xl hover:shadow-primary/30 
                        transition-all active:scale-95
                    "
                >
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                    Explore All Movies
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
            </div>
        </div>
    );
};

export default FeaturedSection;