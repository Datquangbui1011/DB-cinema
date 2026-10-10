import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Monitor, Smartphone, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { PageHeader, Panel, EmptyState, Skeleton, SegmentedControl, ConfirmDialog } from '../../components/admin/ui';
import { formatDateTime } from '../../lib/adminFormat';

const DEVICES = [
    { value: 'desktop', label: 'Desktop', icon: Monitor, aspect: 'aspect-video', hint: 'Wide image, about 1920 × 1080' },
    { value: 'mobile', label: 'Mobile', icon: Smartphone, aspect: 'aspect-[9/16]', hint: 'Tall image, about 1080 × 1920' },
];

const HeroPosters = () => {
    const { axios, getToken } = useAppContext();
    const [posters, setPosters] = useState(null);
    const [deviceType, setDeviceType] = useState('desktop');
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/admin/hero-posters');
            if (data.success) setPosters(data.posters);
        } catch (error) {
            console.error(error);
            toast.error('Could not load posters');
        }
    }, [axios]);

    useEffect(() => { load(); }, [load]);

    // Free the preview URL when it's replaced or the page closes
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    const pickFile = (e) => {
        const chosen = e.target.files?.[0];
        if (!chosen) return;
        if (!chosen.type.startsWith('image/')) return toast.error('Choose an image file');
        setFile(chosen);
        setPreview(URL.createObjectURL(chosen));
    };

    const clearFile = () => { setFile(null); setPreview(null); };

    const upload = async () => {
        if (!file) return;
        setUploading(true);
        try {
            const form = new FormData();
            form.append('image', file);
            form.append('deviceType', deviceType);
            const { data } = await axios.post('/api/admin/upload-hero', form, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) {
                toast.success(data.message);
                clearFile();
                load();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const confirmDelete = async () => {
        setBusy(true);
        try {
            const { data } = await axios.post('/api/admin/delete-hero', { id: deleting._id }, { headers: { Authorization: `Bearer ${await getToken()}` } });
            if (data.success) {
                toast.success(data.message);
                setDeleting(null);
                load();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            console.error(error);
            toast.error('Delete failed');
        } finally {
            setBusy(false);
        }
    };

    const device = DEVICES.find(d => d.value === deviceType);

    return (
        <>
            <PageHeader title="Hero Posters" description="The images that rotate at the top of the homepage. Desktop and mobile visitors see their own set." />

            <Panel title="Upload a poster" className="mb-6">
                <div className="flex flex-col gap-5 md:flex-row">
                    <label className={`group relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-950 hover:border-zinc-500 ${deviceType === 'mobile' ? 'md:w-40 aspect-[9/16]' : 'md:w-96 aspect-video'}`}>
                        {preview ? (
                            <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                        ) : (
                            <span className="flex flex-col items-center gap-2 text-xs text-zinc-500">
                                <ImagePlus className="w-6 h-6" />
                                Choose an image
                            </span>
                        )}
                        <input type="file" accept="image/*" onChange={pickFile} className="sr-only" />
                    </label>

                    <div className="flex flex-1 flex-col gap-4">
                        <div>
                            <p className="mb-1.5 text-xs font-medium text-zinc-300">Show on</p>
                            <SegmentedControl options={DEVICES} value={deviceType} onChange={setDeviceType} />
                            <p className="mt-1.5 text-[11px] text-zinc-500">{device.hint}</p>
                        </div>
                        {file && <p className="truncate text-xs text-zinc-400">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
                        <div className="mt-auto flex gap-2">
                            <button onClick={upload} disabled={!file || uploading} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dull disabled:opacity-50">
                                <Upload className="w-4 h-4" />{uploading ? 'Uploading…' : 'Upload'}
                            </button>
                            {file && (
                                <button onClick={clearFile} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900">
                                    <X className="w-4 h-4" />Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </Panel>

            {DEVICES.map(d => {
                const list = (posters || []).filter(p => (p.deviceType || 'desktop') === d.value);
                return (
                    <Panel key={d.value} title={`${d.label} posters`} description={posters ? `${list.length} in rotation` : ''} className="mb-6">
                        {!posters ? <Skeleton className="h-40 w-full" /> : list.length === 0 ? (
                            <EmptyState icon={d.icon} title={`No ${d.label.toLowerCase()} posters yet`} description="Upload one above." />
                        ) : (
                            <div className={`grid gap-3 ${d.value === 'mobile' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                                {list.map(poster => (
                                    <figure key={poster._id} className="group relative overflow-hidden rounded-lg border border-zinc-800">
                                        <img src={poster.imageUrl} alt="" className={`${d.aspect} w-full object-cover`} />
                                        <figcaption className="flex items-center justify-between gap-2 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-500">
                                            <span className="truncate">Added {formatDateTime(poster.createdAt)}</span>
                                            <button onClick={() => setDeleting(poster)} className="rounded-md p-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-400" aria-label="Delete poster" title="Delete">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </figcaption>
                                    </figure>
                                ))}
                            </div>
                        )}
                    </Panel>
                );
            })}

            {deleting && (
                <ConfirmDialog
                    title="Delete this poster?"
                    message="It will be removed from the homepage rotation and deleted from image storage."
                    confirmLabel="Delete poster"
                    danger
                    busy={busy}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleting(null)}
                />
            )}
        </>
    );
};

export default HeroPosters;
