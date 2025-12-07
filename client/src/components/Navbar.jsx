import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { assets } from '../assets/assets';
import { MenuIcon, SearchIcon, XIcon, TicketPlus, Star } from 'lucide-react';
import { useClerk, UserButton, useUser } from '@clerk/clerk-react';
import { useAppContext } from '../context/AppContext';
import logo1 from '../assets/logo1.png';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();

  const { favoriteMovies, shows, image_base_url } = useAppContext();

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

  return (
    <>
      <div className="fixed top-0 left-0 z-50 w-full flex items-center justify-between px-6 md:px-16 lg:px-36 py-5 bg-transparent">
        {/* Logo */}
        <Link to='/' className='max-md:flex-1'>
          <img src={logo1} alt="Logo" className='w-52 h-auto' />
        </Link>

        {/* Navigation Menu */}
        <div className={`max-md:absolute max-md:top-0 max-md:left-0 max-md:font-medium max-md:text-lg z-50 flex flex-col md:flex-row items-center max-md:justify-center gap-8 md:px-8 py-3 max-md:h-screen md:rounded-full backdrop-blur bg-black/70 md:bg-white/10 md:border border-gray-300/20 overflow-hidden transition-[width] duration-300 ${isOpen ? 'max-md:w-full' : 'max-md:w-0'}`}>
          <XIcon
            className='md:hidden absolute top-6 right-6 w-6 h-6 cursor-pointer'
            onClick={() => setIsOpen(false)}
          />
          <Link onClick={() => { scrollTo(0, 0); setIsOpen(false); }} to='/'>Home</Link>
          <Link onClick={() => { scrollTo(0, 0); setIsOpen(false); }} to='/movies'>Movies</Link>
          <Link onClick={() => { scrollTo(0, 0); setIsOpen(false); }} to='/'>Theaters</Link>
          <Link onClick={() => { scrollTo(0, 0); setIsOpen(false); }} to='/admin'>Dashboard</Link>
          {favoriteMovies.length > 0 && <Link onClick={() => { scrollTo(0, 0); setIsOpen(false); }} to='/favorite'>Favorites</Link>}
        </div>

        {/* Right Side Actions */}
        <div className='flex items-center gap-8'>
          <SearchIcon
            className='max-md:hidden w-6 h-6 cursor-pointer hover:text-primary transition-colors'
            onClick={() => setIsSearchOpen(true)}
          />
          {!user ? (
            <button
              onClick={openSignIn}
              className='px-4 py-1 sm:px-7 sm:py-2 bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'
            >
              Login
            </button>
          ) : (
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Action
                  label="My Bookings"
                  labelIcon={<TicketPlus width={15} />}
                  onClick={() => navigate('/my-bookings')}
                />
              </UserButton.MenuItems>
            </UserButton>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <MenuIcon
          className='max-md:ml-4 md:hidden w-8 h-8 cursor-pointer'
          onClick={() => setIsOpen(true)}
        />
      </div>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-3xl mx-auto px-6 pt-24">
            {/* Search Input */}
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-beige/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for movies..."
                autoFocus
                className="w-full bg-beige/10 border-2 border-beige/20 focus:border-primary rounded-2xl pl-12 pr-12 py-4 text-lg text-beige outline-none transition-colors"
              />
              <button
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-beige/60 hover:text-primary transition-colors"
              >
                <XIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Search Results */}
            {searchQuery.trim() && (
              <div className="mt-6 bg-gradient-to-br from-beige/5 to-transparent border border-beige/10 rounded-2xl overflow-hidden max-h-[60vh] overflow-y-auto">
                {searchResults.length > 0 ? (
                  <div className="divide-y divide-beige/10">
                    {searchResults.map((movie) => (
                      <div
                        key={movie._id}
                        onClick={() => handleMovieClick(movie._id)}
                        className="flex items-center gap-4 p-4 hover:bg-beige/5 cursor-pointer transition-colors group"
                      >
                        <img
                          src={image_base_url + movie.poster_path}
                          alt={movie.title}
                          className="w-16 h-24 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-beige group-hover:text-primary transition-colors">
                            {movie.title}
                          </h3>
                          <p className="text-sm text-beige/60 mt-1">
                            {new Date(movie.release_date).getFullYear()} • {movie.genres.slice(0, 2).map(g => g.name).join(', ')}
                          </p>
                          <div className="flex items-center gap-1 mt-2">
                            <Star className="w-4 h-4 text-primary fill-primary" />
                            <span className="text-sm text-beige/80">{movie.vote_average.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-beige/60">No movies found for "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}

            {/* Hint Text */}
            {!searchQuery.trim() && (
              <div className="mt-8 text-center">
                <p className="text-beige/40 text-sm">Start typing to search for movies...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;