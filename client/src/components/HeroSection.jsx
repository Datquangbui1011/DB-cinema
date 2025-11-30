import { ArrowRight, CalendarIcon, ClockIcon } from 'lucide-react';
import { assets } from '../assets/assets';
import { useNavigate } from 'react-router-dom';

const HeroSection = () => {
    const navigate = useNavigate();
  return (
    <div className='flex flex-col items-start justify-center gap-4 px-6 md:px-16 lg:px-36 bg-[url("./assets/backgroundImage.png")] bg-cover bg-center h-screen'>
      <img src={assets.marvelLogo} alt="Marvel Logo" className="max-h-11 lg:h-11" />
      
      <h1 className='text-5xl md:text-7xl md:leading-tight font-semibold max-w-2xl'> 
        Guardians <br /> of the Galaxy
      </h1>


      <div className='flex flex-wrap items-center gap-4 text-gray-300'>
        <span>Action | Adventure | Sci-Fi</span>
        
        <div className='flex items-center gap-1'>
          <CalendarIcon className='w-4 h-4' /> 2018
        </div>

        <div className='flex items-center gap-1'>
          <ClockIcon className='w-4 h-4' /> 2h 8m
        </div>
      </div>
        <p className = 'max-w-md text-gray-300'>
        A group of intergalactic criminals must pull together to stop a fanatical warrior with plans to purge the universe.
        </p>
        <button onClick = {() => navigate('/movies')} className ='flex items-center gap-1 px-6 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>
            Explore Movies 
            <ArrowRight className='w-5 h-5' />
        </button>
    </div>
  );
}

export default HeroSection;