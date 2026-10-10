import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Sparkles, Ticket, ArrowRight } from 'lucide-react';
import { theaterTypes, theaterCategories, formatPremium } from '../lib/theaterTypes';

const Theaters = () => {
    const navigate = useNavigate();
    const [category, setCategory] = useState('All');

    const visibleTypes = category === 'All'
        ? theaterTypes
        : theaterTypes.filter(t => t.category === category);

    return (
        <div className="min-h-screen bg-[#1A1410] pt-32 pb-20 px-4 sm:px-6 md:px-16 lg:px-24 xl:px-40">
            {/* Header Section */}
            <div className="text-center max-w-3xl mx-auto mb-12 animate-fadeIn">
                <span className="text-primary font-bold tracking-widest uppercase text-sm">Our Rooms</span>
                <h1 className="text-4xl md:text-5xl font-black text-white mt-3 mb-6 tracking-tight">
                    Find Your Perfect <span className="text-primary">Room</span>
                </h1>
                <p className="text-lg text-gray-400 leading-relaxed">
                    From giant IMAX screens and motion seats to heated recliners and family-friendly rooms,
                    pick the way you want to watch.
                </p>
                <div className="flex flex-wrap justify-center gap-3 mt-8 text-sm">
                    <span className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        <span className="font-bold text-white">{theaterTypes.length}</span> room types
                    </span>
                    <span className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        Up to <span className="font-bold text-white">270°</span> screens
                    </span>
                    <span className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-gray-300">
                        Family pricing available
                    </span>
                </div>
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-10 md:justify-center no-scrollbar">
                {theaterCategories.map(c => (
                    <button
                        key={c}
                        onClick={() => setCategory(c)}
                        className={`flex-shrink-0 px-5 py-2 rounded-full text-sm font-semibold border transition-all ${category === c
                            ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
                            }`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {/* Room Cards */}
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {visibleTypes.map((room, index) => {
                    const Icon = room.icon;
                    return (
                        <div
                            key={room.name}
                            className="group relative flex flex-col overflow-hidden rounded-3xl bg-white/[0.03] border border-white/10 hover:border-white/25 hover:-translate-y-1 transition-all duration-300 animate-slideUp"
                            style={{ animationDelay: `${index * 75}ms` }}
                        >
                            <div className="relative aspect-[16/10] overflow-hidden">
                                <img
                                    src={room.image}
                                    alt={`${room.name} room`}
                                    loading="lazy"
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1410] via-black/20 to-black/30"></div>
                                <div className="absolute top-4 inset-x-4 flex items-start justify-between gap-3">
                                    <div className="p-2.5 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10">
                                        <Icon className={`w-6 h-6 ${room.text}`} />
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md ${room.badge}`}>
                                        {formatPremium(room.premium)}
                                    </span>
                                </div>
                            </div>
                            <div className={`relative px-6 pt-1 pb-5 bg-gradient-to-b ${room.gradient}`}>
                                <p className={`text-xs font-bold tracking-widest uppercase ${room.text}`}>{room.category}</p>
                                <h2 className="text-2xl font-bold text-white tracking-tight mt-1">{room.name}</h2>
                                <p className="text-sm text-gray-300 mt-1">{room.tagline}</p>
                            </div>

                            <div className="flex flex-col flex-1 p-6 pt-4 gap-5">
                                <p className="text-sm text-gray-400 leading-relaxed">{room.description}</p>
                                <ul className="space-y-2.5">
                                    {room.features.map(feature => (
                                        <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-300">
                                            <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${room.text}`} />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-auto pt-4 border-t border-white/10 text-xs text-gray-500">
                                    Best for <span className="text-gray-300 font-medium">{room.specs.bestFor}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Comparison Table */}
            <div className="mt-24">
                <div className="text-center mb-8">
                    <h3 className="text-3xl font-bold text-white tracking-tight">Compare Rooms</h3>
                    <p className="text-gray-400 mt-2">Price shown is added to the showtime's base ticket price.</p>
                </div>
                <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.03]">
                    <table className="w-full min-w-[720px] text-sm text-left">
                        <thead>
                            <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-white/10">
                                <th className="px-6 py-4 font-semibold">Room</th>
                                <th className="px-6 py-4 font-semibold">Screen</th>
                                <th className="px-6 py-4 font-semibold">Sound</th>
                                <th className="px-6 py-4 font-semibold">Seating</th>
                                <th className="px-6 py-4 font-semibold text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {theaterTypes.map(room => {
                                const Icon = room.icon;
                                return (
                                    <tr key={room.name} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <Icon className={`w-5 h-5 ${room.text}`} />
                                                <span className="font-semibold text-white">{room.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">{room.specs.screen}</td>
                                        <td className="px-6 py-4 text-gray-300">{room.specs.sound}</td>
                                        <td className="px-6 py-4 text-gray-300">{room.specs.seating}</td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${room.badge}`}>
                                                {formatPremium(room.premium)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom CTA */}
            <div className="mt-24 p-8 md:p-12 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-[3rem] text-center max-w-4xl mx-auto shadow-inner">
                <Sparkles className="w-12 h-12 text-primary mx-auto mb-6" />
                <h3 className="text-2xl font-bold text-white mb-4">Ready to choose your room?</h3>
                <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                    Each showtime lists its room type. Pick a movie, then choose the showtime and room that suits you.
                </p>
                <button
                    onClick={() => { navigate('/movies'); scrollTo(0, 0); }}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-primary hover:bg-primary-dull text-white font-semibold rounded-full shadow-lg shadow-primary/30 transition-colors"
                >
                    <Ticket className="w-5 h-5" />
                    Browse Movies
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default Theaters;
