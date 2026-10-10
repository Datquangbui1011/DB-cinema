import React from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Movie from './pages/Movie';
import MovieDetails from './pages/MovieDetails';
import Favorites from './pages/Favorite';
import MyBooking from './pages/Mybooking';
import SeatLayout from './pages/SeatLayout';
import { Toaster } from 'react-hot-toast';
import Footer from './components/Footer';
import Navbar from './components/Navbar';
import CineBot from './components/CineBot';
import Overview from './pages/admin/Overview';
import LiveOperations from './pages/admin/LiveOperations';
import Analytics from './pages/admin/Analytics';
import Shows from './pages/admin/Shows';
import Layout from './pages/admin/Layout';
import Bookings from './pages/admin/Bookings';
import Customers from './pages/admin/Customers';
import { useAppContext } from './context/AppContext';
import { SignIn } from '@clerk/clerk-react';
import HeroPosters from './pages/admin/HeroPosters';
import Movies from './pages/admin/Movies';
import Screens from './pages/admin/Screens';
import SystemStatus from './pages/admin/SystemStatus';
import Team from './pages/admin/Team';
import Result from './pages/Result';
import Theaters from './pages/Theaters';

const App = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const { user } = useAppContext();


  return (
    <>
      <Toaster />
      {!isAdminRoute && <Navbar />}
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/movies' element={<Movie />} />
        <Route path='/movies/:id' element={<MovieDetails />} />
        <Route path='/theaters' element={<Theaters />} />
        <Route path='/seat-layout/:id/:date' element={<SeatLayout />} />
        <Route path='/my-bookings' element={<MyBooking />} />
        <Route path='/result' element={<Result />} />
        <Route path='/favorite' element={<Favorites />} />
        <Route path='/admin/*' element={user ? <Layout /> : (
          <div className='min-h-screen flex justify-center items-center'>
            <SignIn fallbackRedirectUrl="/admin" />
          </div>
        )}>
          <Route index element={<Overview />} />
          <Route path='live' element={<LiveOperations />} />
          <Route path='analytics' element={<Analytics />} />
          <Route path='shows' element={<Shows />} />
          {/* Old show pages now live on the Shows page */}
          <Route path='add-shows' element={<Navigate to='/admin/shows' replace />} />
          <Route path='list-shows' element={<Navigate to='/admin/shows' replace />} />
          <Route path='bookings' element={<Bookings />} />
          <Route path='customers' element={<Customers />} />
          <Route path='list-bookings' element={<Navigate to='/admin/bookings' replace />} />
          <Route path='movies' element={<Movies />} />
          <Route path='screens' element={<Screens />} />
          <Route path='hero-posters' element={<HeroPosters />} />
          <Route path='manage-hero' element={<Navigate to='/admin/hero-posters' replace />} />
          <Route path='system' element={<SystemStatus />} />
          <Route path='team' element={<Team />} />
        </Route>
      </Routes>
      <div className={`${location.pathname !== '/' ? 'hidden md:block' : ''}`}>
        {!isAdminRoute && <Footer />}
      </div>
      {!isAdminRoute && <CineBot />}
    </>
  );
};

export default App;