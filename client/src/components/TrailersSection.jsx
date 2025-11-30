import React, { useState } from "react"
import { dummyTrailers } from '../assets/assets'
import { PlayCircleIcon } from "lucide-react";


const TrailersSection = () => {
    const [currentTrailer, setCurrentTrailer] = useState(dummyTrailers[0]);
    
    // Extract YouTube video ID from URL
    const getYouTubeId = (url) => {
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&]+)/);
        return match ? match[1] : '';
    };
    
    const handleTrailerChange = (trailer) => {
        setCurrentTrailer(trailer);
    };
    
    return (
        <div className='px-6 md:px-16 lg:px-24 xl:px-44 py-20 overflow-hidden '>
            <p className="text-gray-300 font-medium text-lg max-w-[960px] mx-auto mb-8">Trailers</p>

            <div className='relative mt-6 mx-auto max-w-[960px]'>
                {/* Outer glow effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-red-600 via-purple-600 to-blue-600 rounded-2xl blur-lg opacity-30"></div>
                
                {/* Main video container with enhanced styling */}
                <div className="relative bg-gradient-to-br from-gray-900 to-black p-2 rounded-2xl shadow-2xl">
                    <div className="relative w-full overflow-hidden rounded-xl shadow-inner" style={{ paddingBottom: '56.25%' }}>
                        <iframe
                            className="absolute top-0 left-0 w-full h-full"
                            src={`https://www.youtube.com/embed/${getYouTubeId(currentTrailer.videoUrl)}?rel=0&modestbranding=1`}
                            title="YouTube video player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>
                    
                    {/* Decorative corner accents */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-red-500 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-red-500 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-red-500 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-red-500 rounded-br-xl"></div>
                </div>
            </div>

            <div className='group grid grid-cols-4 gap-4 md:gap-8 mt-12 max-w-3xl mx-auto'>
                {dummyTrailers.map((trailer, index) => (
                    <div 
                        key={`${trailer.videoUrl}-${index}`}
                        className={`relative group-hover:not-hover:opacity-50 hover:-translate-y-1 hover:scale-105 duration-300 transition-all max-md:h-60 md:max-h-60 cursor-pointer ${
                            currentTrailer.videoUrl === trailer.videoUrl ? 'ring-4 ring-red-500 shadow-lg shadow-red-500/50 scale-105' : 'hover:ring-2 hover:ring-white/30'
                        }`}
                        onClick={() => handleTrailerChange(trailer)}
                    >
                        <img 
                            src={trailer.image} 
                            alt={`Trailer ${index + 1}`} 
                            className="rounded-lg w-full h-full object-cover brightness-75 hover:brightness-90 transition-all duration-300" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent rounded-lg"></div>
                        <PlayCircleIcon 
                            strokeWidth={1.6} 
                            className="absolute top-1/2 left-1/2 w-8 md:w-12 h-8 md:h-12 transform -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-lg" 
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}

export default TrailersSection;