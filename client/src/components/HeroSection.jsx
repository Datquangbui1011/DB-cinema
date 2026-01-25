import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import hero1 from '../assets/hero1.jpg';
import hero2 from '../assets/hero2.jpg';
import hero3 from '../assets/hero3.jpg';
import hero4 from '../assets/hero4.jpg';

const HeroSection = () => {
  const defaultImages = [hero1, hero2, hero3, hero4];
  const [heroImages, setHeroImages] = useState(defaultImages);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchPosters = useCallback(async () => {
    try {
      const { data } = await axios.get("http://localhost:3000/api/admin/hero-posters");
      if (data.success && data.posters.length > 0) {
        setHeroImages(data.posters.map(p => p.imageUrl));
      }
    } catch (error) {
      console.error("Error fetching hero posters:", error);
    }
  }, []);

  useEffect(() => {
    fetchPosters();
  }, [fetchPosters]);

  useEffect(() => {
    if (heroImages.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [heroImages.length]);

  return (
    <div className='flex flex-col items-center justify-center w-full min-h-screen py-30 bg-gradient-to-b from-gray-900 to-black'>
      {/* Image Frame - Full Width */}
      <div className='relative w-full overflow-hidden shadow-2xl bg-black'>
        {heroImages.length > 0 && (
          <img
            src={heroImages[currentIndex]}
            alt={`Hero ${currentIndex + 1}`}
            className='w-full h-auto object-cover transition-all duration-1000'
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
      </div>

      {/* Dots Indicator */}
      <div className="flex gap-3 mt-8">
        {heroImages.map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${index === currentIndex ? 'bg-primary w-8' : 'bg-gray-400/20 w-2'
              }`}
            onClick={() => setCurrentIndex(index)}
          />
        ))}
      </div>
    </div>
  );
}

export default HeroSection;