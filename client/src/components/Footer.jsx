import React from 'react';
import { Link } from 'react-router-dom';
import logo1 from '../assets/logo1.png';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube } from 'lucide-react';

const Footer = () => {
    return (
        <footer className="w-full mt-32 bg-gradient-to-b from-transparent to-black/50 border-t border-beige/10">
            <div className="px-6 md:px-16 lg:px-36 py-16">
                {/* Main Footer Content */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
                    {/* Brand Section */}
                    <div className="lg:col-span-1">
                        <img alt="DBCinema Logo" className="h-20 w-auto mb-6" src={logo1} />
                        <p className="text-sm text-beige/80 leading-relaxed mb-6">
                            Your premier destination for the ultimate movie experience. Book tickets, explore showtimes, and enjoy the magic of cinema.
                        </p>
                        {/* Social Media */}
                        <div className="flex items-center gap-3">
                            <a href="#" className="w-10 h-10 rounded-full bg-beige/10 hover:bg-primary transition-all flex items-center justify-center group">
                                <Facebook className="w-5 h-5 text-beige group-hover:text-white transition-colors" />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-beige/10 hover:bg-primary transition-all flex items-center justify-center group">
                                <Twitter className="w-5 h-5 text-beige group-hover:text-white transition-colors" />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-beige/10 hover:bg-primary transition-all flex items-center justify-center group">
                                <Instagram className="w-5 h-5 text-beige group-hover:text-white transition-colors" />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-beige/10 hover:bg-primary transition-all flex items-center justify-center group">
                                <Youtube className="w-5 h-5 text-beige group-hover:text-white transition-colors" />
                            </a>
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="text-beige font-semibold text-lg mb-6 relative inline-block">
                            Quick Links
                            <span className="absolute -bottom-2 left-0 w-12 h-0.5 bg-primary"></span>
                        </h3>
                        <ul className="space-y-3">
                            <li><Link to="/" className="text-sm text-beige/70 hover:text-primary transition-colors">Home</Link></li>
                            <li><Link to="/movies" className="text-sm text-beige/70 hover:text-primary transition-colors">Movies</Link></li>
                            <li><Link to="/my-bookings" className="text-sm text-beige/70 hover:text-primary transition-colors">My Bookings</Link></li>
                            <li><Link to="/favorites" className="text-sm text-beige/70 hover:text-primary transition-colors">Favorites</Link></li>
                        </ul>
                    </div>

                    {/* Support */}
                    <div>
                        <h3 className="text-beige font-semibold text-lg mb-6 relative inline-block">
                            Support
                            <span className="absolute -bottom-2 left-0 w-12 h-0.5 bg-primary"></span>
                        </h3>
                        <ul className="space-y-3">
                            <li><a href="#" className="text-sm text-beige/70 hover:text-primary transition-colors">Help Center</a></li>
                            <li><a href="#" className="text-sm text-beige/70 hover:text-primary transition-colors">Terms of Service</a></li>
                            <li><a href="#" className="text-sm text-beige/70 hover:text-primary transition-colors">Privacy Policy</a></li>
                            <li><a href="#" className="text-sm text-beige/70 hover:text-primary transition-colors">FAQs</a></li>
                        </ul>
                    </div>

                    {/* Contact Info */}
                    <div>
                        <h3 className="text-beige font-semibold text-lg mb-6 relative inline-block">
                            Contact Us
                            <span className="absolute -bottom-2 left-0 w-12 h-0.5 bg-primary"></span>
                        </h3>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <Phone className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-beige/70">+1 (234) 567-890</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-beige/70">support@dbcinema.com</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-beige/70">123 Cinema Street, Movie City, MC 12345</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Download App Section */}
                {/* <div className="border-t border-beige/10 pt-8 mb-8">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h4 className="text-beige font-semibold mb-2">Download Our App</h4>
                            <p className="text-sm text-beige/60">Book tickets on the go!</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <img src={assets.googlePlay} alt="Get it on Google Play" className="h-12 w-auto hover:scale-105 transition-transform cursor-pointer" />
                            <img src={assets.appStore} alt="Download on App Store" className="h-12 w-auto hover:scale-105 transition-transform cursor-pointer" />
                        </div>
                    </div>
                </div> */}

                {/* Copyright */}
                <div className="border-t border-beige/10 pt-6 text-center">
                    <p className="text-sm text-beige/60">
                        © {new Date().getFullYear()} <span className="text-primary font-semibold">DBCinema</span>. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}

export default Footer;