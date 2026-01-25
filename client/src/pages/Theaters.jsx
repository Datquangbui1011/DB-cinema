import { Monitor, Armchair, Volume2, Sparkles, Star, CheckCircle2 } from 'lucide-react';

const Theaters = () => {
    const theaterLevels = [
        {
            name: "Standard",
            description: "The classic cinematic experience with high-quality projection and comfortable seating.",
            features: ["4K Digital Projection", "7.1 Surround Sound", "Ergonomic Seating", "Standard Screen"],
            premium: 0,
            icon: <Monitor className="w-8 h-8 text-blue-400" />,
            image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop"
        },
        {
            name: "IMAX",
            description: "Experience movies to the fullest with the most immersive screen and sound ever created.",
            features: ["IMAX Laser Projection", "IMAX 12-Channel Audio", "Expanded Aspect Ratio", "Crystal Clear Images"],
            premium: 5,
            icon: <Sparkles className="w-8 h-8 text-purple-400" />,
            image: "/IMAXtheaterM.jpg"
        },
        {
            name: "Premium",
            description: "The ultimate luxury. Enjoy the biggest screen from the comfort of a full-size bed.",
            features: ["Full Bed Seating", "IMAX Screen Enabled", "Personal Waiter Service", "Gourmet Menu Access"],
            premium: 15,
            icon: <Star className="w-8 h-8 text-yellow-500" />,
            image: "/premium.jpg"
        }
    ];

    return (
        <div className="min-h-screen bg-[#1A1410] pt-32 pb-20 px-6 md:px-16 lg:px-40">
            {/* Header Section */}
            <div className="text-center max-w-3xl mx-auto mb-20 animate-fadeIn">
                <h1 className="text-5xl font-black text-white mb-6 tracking-tight">
                    Elevated <span className="text-primary">Experiences</span>
                </h1>
                <p className="text-lg text-gray-400 leading-relaxed">
                    Choose the perfect environment for your cinematic journey. From standard comfort to premium luxury, we have a seat waiting for you.
                </p>
            </div>

            {/* Theater Levels Grid */}
            <div className="grid gap-12">
                {theaterLevels.map((level, index) => (
                    <div 
                        key={level.name}
                        className={`flex flex-col ${index % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'} gap-10 items-center animate-slideUp`}
                        style={{ animationDelay: `${index * 150}ms` }}
                    >
                        {/* Image Side */}
                        <div className="w-full md:w-1/2 group relative overflow-hidden rounded-3xl aspect-video border border-white/5 shadow-2xl">
                            <img 
                                src={level.image} 
                                alt={level.name} 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                            <div className="absolute bottom-6 left-6 flex items-center gap-3">
                                <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                                    {level.icon}
                                </div>
                                <div className="px-5 py-2 bg-primary text-white rounded-full font-bold shadow-lg">
                                    {level.premium === 0 ? 'Standard Price' : `+$${level.premium}.00 Premium`}
                                </div>
                            </div>
                        </div>

                        {/* Content Side */}
                        <div className="w-full md:w-1/2 space-y-6">
                            <div className="space-y-2">
                                <span className="text-primary font-bold tracking-widest uppercase text-sm">Theater Level</span>
                                <h2 className="text-4xl font-bold text-white tracking-tight">{level.name}</h2>
                            </div>
                            
                            <p className="text-gray-400 text-lg leading-relaxed">
                                {level.description}
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                {level.features.map((feature) => (
                                    <div key={feature} className="flex items-center gap-3 bg-white/5 border border-white/5 p-4 rounded-2xl group hover:border-primary/30 transition-colors">
                                        <CheckCircle2 className="w-5 h-5 text-primary" />
                                        <span className="text-sm font-medium text-gray-300">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom CTA or Info */}
            <div className="mt-32 p-12 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-[3rem] text-center max-w-4xl mx-auto shadow-inner">
                <Sparkles className="w-12 h-12 text-primary mx-auto mb-6" />
                <h3 className="text-2xl font-bold text-white mb-4">Ready to choose your experience?</h3>
                <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                    Theater level selection is available during the seat booking process for each showtime. Premium features vary by location.
                </p>
                <div className="flex justify-center gap-6">
                    <div className="flex items-center gap-3 text-gray-400">
                        <Volume2 className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium">Dolby Atmos Sound</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-400">
                        <Armchair className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium">Premium Comfort</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Theaters;
