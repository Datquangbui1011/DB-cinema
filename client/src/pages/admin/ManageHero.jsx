import React, { useState, useEffect, useCallback } from 'react';
import Title from '../../components/admin/Title';
import Loading from '../../components/Loading';
import { useAppContext } from '../../context/AppContext';
import { toast } from 'react-hot-toast';
import { Upload, Trash2, Image as ImageIcon, Plus, X } from 'lucide-react';

const ManageHero = () => {
    const { axios, getToken } = useAppContext();
    const [posters, setPosters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [image, setImage] = useState(null);
    const [deviceType, setDeviceType] = useState('desktop');
    const [preview, setPreview] = useState(null);

    const fetchHeroPosters = useCallback(async () => {
        try {
            const token = await getToken();
            const { data } = await axios.get("/api/admin/hero-posters", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (data.success) {
                setPosters(data.posters);
            }
        } catch (error) {
            console.error("Error fetching hero posters:", error);
        } finally {
            setLoading(false);
        }
    }, [axios, getToken]);

    useEffect(() => {
        fetchHeroPosters();
    }, [fetchHeroPosters]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImage(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!image) return;

        setUploading(true);
        try {
            const token = await getToken();
            const formData = new FormData();
            formData.append('image', image);
            formData.append('deviceType', deviceType);

            const { data } = await axios.post("/api/admin/upload-hero", formData, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (data.success) {
                toast.success(data.message);
                setImage(null);
                setPreview(null);
                fetchHeroPosters();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error("Upload failed");
            console.error(error);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this poster?")) return;

        try {
            const token = await getToken();
            const { data } = await axios.post("/api/admin/delete-hero", { id }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (data.success) {
                toast.success(data.message);
                fetchHeroPosters();
            } else {
                toast.error(data.message);
            }
        // eslint-disable-next-line no-unused-vars
        } catch (error) {
            toast.error("Delete failed");
        }
    };

    return !loading ? (
        <div className="max-w-6xl mx-auto">
            <Title text1="Manage" text2="Hero Posters" />

            {/* Upload Section */}
            <div className="mt-10 bg-zinc-900/50 border border-beige/10 rounded-2xl p-8 backdrop-blur-sm">
                <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="w-full md:w-1/2 aspect-video bg-zinc-950 rounded-xl border-2 border-dashed border-beige/10 flex items-center justify-center overflow-hidden relative group">
                        {preview ? (
                            <>
                                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                                <button 
                                    type="button"
                                    onClick={() => {setImage(null); setPreview(null);}}
                                    className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <label className="flex flex-col items-center gap-3 cursor-pointer p-10 text-center">
                                <Plus className="w-12 h-12 text-beige/20 group-hover:text-primary transition-colors" />
                                <div>
                                    <p className="text-beige/60 font-medium">Click to select poster image</p>
                                    <p className="text-[10px] text-beige/30 mt-1">Recommended: 1920x1080 (16:9)</p>
                                </div>
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                            </label>
                        )}
                    </div>

                    <div className="flex-1 space-y-6">
                        <div>
                            <h3 className="text-xl font-bold text-beige">Upload New Banner</h3>
                            <p className="text-sm text-beige/40 mt-1">Add high-quality posters to be featured on the main homepage carousel.</p>
                        </div>
                        
                        {/* Device Type Selection */}
                        <div className="flex gap-4 p-1 bg-zinc-950/50 rounded-lg border border-beige/5 w-fit">
                            <button
                                type="button"
                                onClick={() => setDeviceType('desktop')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ${
                                    deviceType === 'desktop' 
                                    ? 'bg-beige/10 text-beige shadow-sm' 
                                    : 'text-beige/40 hover:text-beige/60'
                                }`}
                            >
                                Desktop
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeviceType('mobile')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ${
                                    deviceType === 'mobile' 
                                    ? 'bg-beige/10 text-beige shadow-sm' 
                                    : 'text-beige/40 hover:text-beige/60'
                                }`}
                            >
                                Mobile
                            </button>
                        </div>
                        
                        <button 
                            type="submit" 
                            disabled={!image || uploading}
                            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300
                                ${!image || uploading 
                                    ? 'bg-beige/5 text-beige/20 cursor-not-allowed' 
                                    : 'bg-primary text-white hover:bg-red-700 shadow-lg shadow-primary/20 hover:scale-[1.02]'}`}
                        >
                            {uploading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Uploading to Cloudinary...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-5 h-5" />
                                    Publish Poster
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* List Section */}
            <div className="mt-16">
                <div className="flex items-center gap-3 mb-8">
                    <ImageIcon className="w-6 h-6 text-primary" />
                    <h2 className="text-2xl font-bold text-beige">Active Posters</h2>
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold border border-primary/20 ml-2">
                        {posters.length} Live
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {posters.map((poster) => (
                        <div 
                            key={poster._id} 
                            className="bg-zinc-950 border border-beige/10 rounded-2xl overflow-hidden group hover:border-primary/30 transition-all duration-300 shadow-xl"
                        >
                            <div className="aspect-video relative overflow-hidden">
                                <img src={poster.imageUrl} alt="Poster" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <button 
                                    onClick={() => handleDelete(poster._id)}
                                    className="absolute bottom-4 right-4 bg-red-600/90 text-white p-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-red-700"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-beige/40">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                    Active on {poster.deviceType === 'mobile' ? 'Mobile' : 'Desktop'}
                                </div>
                                <span className="text-[10px] text-beige/20 font-medium">Added on {new Date(poster.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {posters.length === 0 && (
                    <div className="py-32 bg-zinc-900/30 border border-beige/10 rounded-2xl text-center">
                        <ImageIcon className="w-16 h-16 text-beige/10 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-beige/60">No posters active</h3>
                        <p className="text-sm text-beige/30 mt-1">Upload an image above to start your homepage carousel</p>
                    </div>
                )}
            </div>
        </div>
    ) : <Loading />;
};

export default ManageHero;
