import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { MenuIcon, SearchIcon, XIcon, TicketPlus, Star, Home, Film, MapPin, LayoutDashboard, Heart } from 'lucide-react';
import { useClerk, UserButton, useUser } from '@clerk/clerk-react';
import { useAppContext } from '../context/AppContext';
import logo1 from '../assets/logo1.png';

const Navbar = () => {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState(0);
    const { user } = useUser();
    const { openSignIn } = useClerk();
    const navigate = useNavigate();
    const location = useLocation();

    const { favoriteMovies, shows, image_base_url } = useAppContext();

    // Scroll listener to update header state
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Filter movies based on search query
    const searchResults = searchQuery.trim()
        ? shows.filter(movie =>
            movie.title.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 5)
        : [];

    const handleMovieClick = (movieId) => {
        setIsSearchOpen(false);
        setSearchQuery('');
        navigate(`/movies/${movieId}`);
        scrollTo(0, 0);
    };

    const navLinks = [
        { label: 'Home', path: '/', icon: Home },
        { label: 'Movies', path: '/movies', icon: Film },
        { label: 'Theaters', path: '/theaters', icon: MapPin },
        { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    ];

    if (favoriteMovies.length > 0) {
        navLinks.push({ label: 'Favorites', path: '/favorite', icon: Heart });
    }

    // Find active tab index
    useEffect(() => {
        const activeIndex = navLinks.findIndex(link => link.path === location.pathname);
        if (activeIndex !== -1) {
            setActiveTab(activeIndex);
        }
    }, [location.pathname]);

    return (
        <>
            {/* Top Navbar (Desktop: Full, Mobile: simplified) */}
            <div className={`fixed top-0 left-0 z-50 w-full flex items-center justify-between px-6 md:px-16 lg:px-24 xl:px-44 transition-all duration-500 ${isScrolled ? 'py-3 bg-black/80 backdrop-blur-xl border-b border-white/5 shadow-2xl' : 'py-6 bg-transparent'}`}>
                {/* Logo */}
                <Link to='/' className='relative group'>
                    <img src={logo1} alt="Logo" className={`transition-all duration-300 ${isScrolled ? 'w-28 md:w-32' : 'w-32 md:w-40'} h-auto`} />
                    <div className="absolute -inset-2 bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full"></div>
                </Link>

                {/* Desktop Navigation Menu */}
                <div className="hidden md:flex flex-row items-center gap-2 py-1.5 px-1.5 rounded-full backdrop-blur-lg bg-white/5 border border-white/10 transition-all duration-500">
                    {navLinks.map((link) => (
                        <Link
                            key={link.path}
                            onClick={() => scrollTo(0, 0)}
                            to={link.path}
                            className={`
                                relative px-6 py-2 rounded-full text-sm font-medium transition-all duration-300
                                ${location.pathname === link.path
                                    ? 'text-white bg-primary shadow-lg shadow-primary/30'
                                    : 'text-gray-300 hover:text-white hover:bg-white/5'}
                            `}
                        >
                            {link.label}
                        </Link>
                    ))}
                </div>

                {/* Right Side Actions */}
                <div className='flex items-center gap-4 md:gap-7'>
                    <div
                        onClick={() => setIsSearchOpen(true)}
                        className={`
                            p-2.5 rounded-full cursor-pointer transition-all duration-300
                            ${isScrolled ? 'bg-white/5 hover:bg-white/10' : 'hover:bg-white/5'}
                            group
                        `}
                    >
                        <SearchIcon className='w-5 h-5 text-gray-300 group-hover:text-primary transition-colors' />
                    </div>

                    {!user ? (
                        <button
                            onClick={openSignIn}
                            className='relative px-6 md:px-8 py-2 md:py-2.5 bg-primary hover:bg-primary-dull text-white rounded-full font-semibold text-xs md:text-sm transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg shadow-primary/20 overflow-hidden group'
                        >
                            <span className="relative z-10">Sign In</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                        </button>
                    ) : (
                        <div className="p-1 rounded-full border border-white/10 bg-white/5">
                            <UserButton appearance={{ elements: { userButtonAvatarBox: 'w-8 h-8 md:w-10 md:h-10' } }}>
                                <UserButton.MenuItems>
                                    <UserButton.Action
                                        label="My Bookings"
                                        labelIcon={<TicketPlus width={15} />}
                                        onClick={() => navigate('/my-bookings')}
                                    />
                                </UserButton.MenuItems>
                            </UserButton>
                        </div>
                    )}
                </div>
            </div>

            {/* Enhanced Bottom Navigation Bar (Mobile Only) - Icons Only */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe">
                {/* Gradient Background */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/95 to-transparent pointer-events-none"></div>
                
                {/* Main Navigation Container */}
                <div className="relative mx-4 mb-4 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                    {/* Animated Background Glow */}
                    <div 
                        className="absolute top-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-blue-500 transition-all duration-500 ease-out"
                        style={{
                            left: `${(activeTab / navLinks.length) * 100}%`,
                            width: `${100 / navLinks.length}%`
                        }}
                    />
                    
                    {/* Navigation Items - Icons Only */}
                    <div className="flex justify-around items-center py-3 px-2 relative">
                        {navLinks.map((link, index) => {
                            const Icon = link.icon;
                            const isActive = location.pathname === link.path;
                            
                            return (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    onClick={() => {
                                        scrollTo(0, 0);
                                        setActiveTab(index);
                                    }}
                                    className="relative flex items-center justify-center flex-1 group"
                                >
                                    {/* Ripple Effect Background */}
                                    <div className={`absolute inset-0 rounded-2xl transition-all duration-300 ${isActive ? 'bg-primary/10 scale-100' : 'bg-transparent scale-95 group-active:scale-100 group-active:bg-white/5'}`}></div>
                                    
                                    {/* Icon Container with Animation */}
                                    <div className={`relative z-10 transition-all duration-500 ${isActive ? 'scale-110' : 'scale-100 group-active:scale-90'}`}>
                                        {/* Glow Effect */}
                                        {isActive && (
                                            <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full animate-pulse"></div>
                                        )}
                                        
                                        {/* Icon Background */}
                                        <div className={`relative p-3 rounded-2xl transition-all duration-300 ${isActive ? 'bg-primary shadow-lg shadow-primary/50' : 'bg-white/5 group-active:bg-white/10'}`}>
                                            <Icon 
                                                className={`w-5 h-5 transition-all duration-300 ${isActive ? 'text-white' : 'text-gray-400 group-active:text-white'}`}
                                                strokeWidth={isActive ? 2.5 : 2}
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Active Indicator Dot */}
                                    {isActive && (
                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full animate-bounce"></div>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                    
                    {/* Bottom Safe Area Padding */}
                    <div className="h-safe-bottom"></div>
                </div>
            </div>

            {/* Search Modal */}
            {isSearchOpen && (
                <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl animate-fadeIn flex flex-col items-center pt-24 px-6">
                    <div className="w-full max-w-3xl">
                        {/* Search Input Container */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-purple-500 to-blue-500 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition-opacity"></div>
                            <div className="relative flex items-center bg-gray-900/80 border border-white/10 rounded-2xl overflow-hidden">
                                <SearchIcon className="ml-5 w-6 h-6 text-gray-500" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for movies, actors, genres..."
                                    autoFocus
                                    className="w-full h-16 px-5 bg-transparent text-xl text-white outline-none placeholder:text-gray-600"
                                />
                                <button
                                    onClick={() => {
                                        setIsSearchOpen(false);
                                        setSearchQuery('');
                                    }}
                                    className="mr-5 p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
                                >
                                    <XIcon className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Search Results */}
                        {searchQuery.trim() && (
                            <div className="mt-8 bg-gray-900/50 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md animate-slideUp">
                                {searchResults.length > 0 ? (
                                    <div className="p-3 grid gap-2">
                                        {searchResults.map((movie) => (
                                            <div
                                                key={movie._id}
                                                onClick={() => handleMovieClick(movie._id)}
                                                className="flex items-center gap-5 p-3 hover:bg-white/5 rounded-2xl cursor-pointer transition-all duration-300 group"
                                            >
                                                <div className="relative overflow-hidden rounded-xl shadow-lg">
                                                    <img
                                                        src={image_base_url + movie.poster_path}
                                                        alt={movie.title}
                                                        className="w-16 h-24 object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">
                                                        {movie.title}
                                                    </h3>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <span className="text-sm font-medium text-gray-400 bg-white/5 px-2 py-0.5 rounded-md">
                                                            {new Date(movie.release_date).getFullYear()}
                                                        </span>
                                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-500/10 rounded-md">
                                                            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                                                            <span className="text-sm font-bold text-yellow-500">
                                                                {movie.vote_average.toFixed(1)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-gray-500 mt-2 line-clamp-1 italic">
                                                        {movie.genres.slice(0, 3).map(g => g.name).join(', ')}
                                                    </p>
                                                </div>
                                                <div className="p-2 rounded-full bg-white/5 text-gray-500 opacity-0 group-hover:opacity-100 -translate-x-4 group-hover:translate-x-0 transition-all">
                                                    <Star className="w-5 h-5" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-16 text-center">
                                        <div className="inline-flex p-4 rounded-full bg-white/5 mb-4">
                                            <SearchIcon className="w-8 h-8 text-gray-600" />
                                        </div>
                                        <p className="text-gray-400 text-lg">No movies found for <span className="text-white font-bold">"{searchQuery}"</span></p>
                                        <p className="text-gray-600 text-sm mt-2">Try different keywords or check spelling</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Search Suggestions */}
                        {!searchQuery.trim() && (
                            <div className="mt-12 text-center animate-fadeIn">
                                <p className="text-gray-500 text-sm font-medium tracking-widest uppercase">Quick Search</p>
                                <div className="flex flex-wrap justify-center gap-3 mt-6">
                                    {['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi'].map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => setSearchQuery(tag)}
                                            className="px-5 py-2 rounded-full border border-white/5 bg-white/5 text-gray-400 hover:text-white hover:bg-primary transition-all duration-300"
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Add required animations to your global CSS */}
            <style jsx>{`
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                
                .animate-slideUp {
                    animation: slideUp 0.3s ease-out;
                }
                
                .animate-fadeIn {
                    animation: fadeIn 0.2s ease-out;
                }
            `}</style>
        </>
    );
}

export default Navbar;