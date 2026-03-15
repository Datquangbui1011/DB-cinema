import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'react-hot-toast';

const CineBot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'bot', text: 'Hi! I\'m CineBot 🎬 How can I help you discover movies or book tickets today?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const scrollRef = useRef(null);
    const { axios, getToken } = useAppContext();
    useAuth(); // Just call it if needed for side effects, or remove

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim() || loading) return;

        const userText = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userText }]);
        setLoading(true);

        try {
            const token = await getToken();
            console.log("[CineBot] axios.defaults.baseURL:", axios.defaults.baseURL);
            console.log("[CineBot] token exists:", !!token);
            const { data } = await axios.post(`/api/bot/chat`, {
                message: userText,
                history: history,
                context: { current_path: window.location.pathname }
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (data.success) {
                const botMsg = { 
                    role: 'bot', 
                    text: data.message, 
                    tool_result: data.tool_result,
                    ui_hint: data.ui_hint
                };
                setMessages(prev => [...prev, botMsg]);
                setHistory(prev => [...prev, { user: userText, bot: data.message }]);
            } else {
                toast.error(data.message || 'Something went wrong');
            }
        } catch (error) {
            console.error('Chat Error:', error);
            toast.error('Failed to connect to CineBot');
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action, payload) => {
        // Handle direct actions like confirming a booking
        if (action === 'confirm_booking') {
            window.open(payload.url, '_blank');
            setMessages(prev => [...prev, { role: 'bot', text: 'Opening payment page! 🍿 Enjoy your movie!' }]);
        }
    };

    // Card Components
    const MovieCard = ({ movie }) => (
        <div className="bg-[#2C2416] border border-[#DC2626]/20 rounded-xl p-3 my-2 shadow-lg max-w-[280px]">
            <div className="flex gap-3">
                <img src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`} alt={movie.title} className="w-16 h-24 object-cover rounded-lg shadow-md" />
                <div className="flex-1">
                    <h4 className="font-bold text-sm text-white line-clamp-1">🎬 {movie.title}</h4>
                    <p className="text-yellow-500 text-xs font-semibold mt-1">⭐ {movie.vote_average?.toFixed(1)}/10</p>
                    <p className="text-gray-400 text-[10px] mt-1 line-clamp-2">{movie.overview}</p>
                    <div className="flex gap-1 mt-2">
                         <button 
                            onClick={() => setInput(`Tell me more about ${movie.title}`)}
                            className="text-[10px] bg-primary/20 text-primary px-2 py-1 rounded hover:bg-primary hover:text-white transition-colors"
                        >
                            Details
                        </button>
                        <button 
                            onClick={() => setInput(`Show times for ${movie.title}`)}
                            className="text-[10px] bg-white/10 text-white px-2 py-1 rounded hover:bg-white/20 transition-colors"
                        >
                            Times
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const BookingSummary = ({ result }) => (
        <div className="bg-[#1A1410] border-2 border-primary rounded-xl p-4 my-2 shadow-2xl">
            <h4 className="text-primary font-bold text-center border-bottom border-primary/20 pb-2 mb-3">🎟️ BOOKING SUMMARY</h4>
            <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">🎬 Movie</span><span className="font-bold">{result.movie}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">📅 Date</span><span className="font-bold">{result.date}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">🕐 Time</span><span className="font-bold">{result.time}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">💺 Seats</span><span className="font-bold">{result.seats}</span></div>
                <div className="border-t border-white/10 pt-2 flex justify-between">
                    <span className="text-gray-400">💰 Total</span>
                    <span className="text-primary font-extrabold text-lg">${result.total?.toFixed(2)}</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
                <button 
                    onClick={() => handleAction('confirm_booking', { url: result.payment_url })}
                    className="bg-primary text-white font-bold py-2 rounded-lg hover:bg-primary-dull transition-all active:scale-95"
                >
                    Confirm ✅
                </button>
                <button 
                    onClick={() => setMessages(prev => [...prev, { role: 'bot', text: 'No problem! Let me know if you want to pick another one. 😊' }])}
                    className="bg-white/10 text-white font-bold py-2 rounded-lg hover:bg-white/20 transition-all"
                >
                    Cancel ❌
                </button>
            </div>
        </div>
    );

    const ShowtimeList = ({ shows }) => (
        <div className="flex flex-wrap gap-2 my-2">
            {shows.map((s, idx) => (
                <button 
                    key={idx}
                    onClick={() => setInput(`Book 1 ticket for ${s.showDateTime} at ${s.theaterType}`)}
                    className="bg-primary/10 border border-primary/30 text-primary px-3 py-1.5 rounded-full text-xs font-bold hover:bg-primary hover:text-white transition-all"
                >
                    {new Date(s.showDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {s.theaterType}
                </button>
            ))}
        </div>
    );

    const BookingList = ({ bookings }) => (
        <div className="space-y-2 my-2">
            {bookings.slice(0, 3).map((b, idx) => (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs">
                    <div className="flex justify-between items-start mb-1">
                        <span className="font-bold">🎬 {b.show.movie.title}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] ${b.isPaid ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                            {b.isPaid ? '🟢 Confirmed' : '🟡 Pending'}
                        </span>
                    </div>
                    <p className="text-gray-400">📅 {new Date(b.show.showDateTime).toLocaleDateString()} at {new Date(b.show.showDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="text-gray-400">💺 Seats: {b.bookedSeat.join(', ')}</p>
                    {!b.isPaid && (
                         <button 
                            onClick={() => setInput(`Cancel my booking ${b._id}`)}
                            className="text-red-500 mt-2 font-bold hover:underline"
                        >
                            Cancel Reservation ❌
                        </button>
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <div className="fixed bottom-6 right-6 z-50 font-outfit">
            {/* FAB */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform ${isOpen ? 'rotate-180 bg-white/10' : 'bg-primary hover:scale-110'}`}
            >
                {isOpen ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                ) : (
                    <span className="text-2xl animate-pulse">🎬</span>
                )}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="absolute bottom-20 right-0 w-[350px] sm:w-[400px] h-[550px] bg-[#1A1410] rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
                    {/* Header */}
                    <div className="bg-primary/90 backdrop-blur-md p-5 text-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <span className="text-2xl">🤖</span>
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#1A1410] rounded-full"></div>
                            </div>
                            <div>
                                <h3 className="font-bold text-lg leading-tight">CineBot</h3>
                                <p className="text-[10px] opacity-70">Always online to help you watch 🍿</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="opacity-60 hover:opacity-100"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar scroll-smooth" ref={scrollRef}>
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 text-gray-200 border border-white/10 rounded-tl-none'}`}>
                                    <p className="text-sm leading-relaxed">{msg.text}</p>
                                    
                                    {/* Rich UI Components based on tool results */}
                                    {msg.ui_hint === 'movie_list' && msg.tool_result && (
                                        <div className="mt-2">
                                            {Array.isArray(msg.tool_result) ? msg.tool_result.map((m, i) => <MovieCard key={i} movie={m} />) : <MovieCard movie={msg.tool_result} />}
                                        </div>
                                    )}

                                    {msg.ui_hint === 'showtimes' && msg.tool_result && (
                                        <ShowtimeList shows={msg.tool_result} />
                                    )}

                                    {msg.ui_hint === 'booking_summary' && msg.tool_result && (
                                        <BookingSummary result={msg.tool_result} />
                                    )}

                                    {msg.ui_hint === 'booking_list' && msg.tool_result && (
                                        <BookingList bookings={msg.tool_result} />
                                    )}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-3 flex gap-1 items-center">
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSendMessage} className="p-4 bg-white/5 border-t border-white/10">
                        <div className="relative flex items-center">
                            <input 
                                type="text" 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Find a movie..."
                                className="w-full bg-[#1A1410] border border-white/10 rounded-full py-3 px-5 text-sm text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-gray-600"
                            />
                            <button 
                                type="submit"
                                disabled={!input.trim() || loading}
                                className="absolute right-2 p-2 bg-primary text-white rounded-full disabled:opacity-50 hover:bg-primary-dull transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default CineBot;
