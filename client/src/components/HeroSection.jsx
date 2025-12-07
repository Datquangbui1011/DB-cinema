import { useEffect, useState } from 'react';
import hero1 from '../assets/hero1.jpg';
import hero2 from '../assets/hero2.jpg';
import hero3 from '../assets/hero3.jpg';
import hero4 from '../assets/hero4.jpg';

const HeroSection = () => {
  const heroImages = [hero1, hero2, hero3, hero4];
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [heroImages.length]);

  return (
    <div className='flex flex-col items-center justify-center w-full min-h-screen py-30 px-6 md:px-16 lg:px-36 bg-gradient-to-b from-gray-900 to-black'>
      {/* Image Frame */}
      <div className='relative w-full max-w-6xl aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black'>
        <img
          src={heroImages[currentIndex]}
          alt={`Hero ${currentIndex + 1}`}
          className='w-full h-full object-contain transition-all duration-500'
        />
      </div>

      {/* Dots Indicator */}
      <div className="flex gap-3 mt-8">
        {heroImages.map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${index === currentIndex ? 'bg-primary w-8' : 'bg-gray-400 w-2'
              }`}
            onClick={() => setCurrentIndex(index)}
          />
        ))}
      </div>
    </div>
  );
}

export default HeroSection;