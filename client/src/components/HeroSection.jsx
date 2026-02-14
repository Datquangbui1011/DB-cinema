import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const defaultImages = []; // Removed local assets import if not needed, or keep them if they exist

const HeroSection = () => {
  const [heroImages, setHeroImages] = useState(defaultImages);
  const [mobileImages, setMobileImages] = useState([]);
  const [desktopImages, setDesktopImages] = useState(defaultImages);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchPosters = useCallback(async () => {
    try {
      const { data } = await axios.get("http://localhost:3000/api/admin/hero-posters");
      if (data.success && data.posters.length > 0) {
        const mobile = data.posters.filter(p => p.deviceType === 'mobile').map(p => p.imageUrl);
        const desktop = data.posters.filter(p => p.deviceType !== 'mobile').map(p => p.imageUrl);
        
        setMobileImages(mobile);
        setDesktopImages(desktop.length > 0 ? desktop : defaultImages);
      }
    } catch (error) {
      console.error("Error fetching hero posters:", error);
    }
  }, []);

  useEffect(() => {
    fetchPosters();
  }, [fetchPosters]);

  useEffect(() => {
    const images = isMobile && mobileImages.length > 0 ? mobileImages : desktopImages;
    setHeroImages(images);
    setCurrentIndex(0); // Reset index when source changes
  }, [isMobile, mobileImages, desktopImages]);

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
            src={heroImages[currentIndex] || heroImages[0]}
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