import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Movie from './pages/Movie';
import MovieDetails from './pages/MovieDetails';
import Favorites from './pages/Favorite';
import MyBooking from './pages/Mybooking';
import SeatLayout from './pages/SeatLayout';
import { Toaster } from 'react-hot-toast';
import Footer from './components/Footer';
import Navbar from './components/Navbar';
import Dashboard from './pages/admin/DashBoard';
import ListShows from './pages/admin/ListShows';
import Layout from './pages/admin/Layout';
import ListBookings from './pages/admin/ListBookings';
import { useAppContext } from './context/AppContext';
import { SignIn } from '@clerk/clerk-react';
import AddShows from './pages/admin/AddShows';
import ManageHero from './pages/admin/ManageHero';
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
          <Route index element={<Dashboard />} />
          <Route path='add-shows' element={<AddShows />} />
          <Route path='list-shows' element={<ListShows />} />
          <Route path='list-bookings' element={<ListBookings />} />
          <Route path='manage-hero' element={<ManageHero />} />
        </Route>
      </Routes>
      {!isAdminRoute && <Footer />}
    </>
  );
};

export default App;