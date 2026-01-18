import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Clock, AlertTriangle, Loader2, Check, ChevronDown, MonitorPlay, Pencil, X, Save } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const PLATFORMS_LIST = [
    { id: 'facebook', label: 'Facebook' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'youtube', label: 'YouTube' }
];

export default function PostingSchedule({ projectId }) {
    const { t } = useTranslation();
    const dropdownRef = useRef(null);
    const [selectedDay, setSelectedDay] = useState('mon');
    const [schedule, setSchedule] = useState({
        mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
    });

    const [currentUser, setCurrentUser] = useState(null);
    const [availableAccounts, setAvailableAccounts] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false); // NEW: Explicit Loading State
    const [error, setError] = useState(null);

    const [editingSlotId, setEditingSlotId] = useState(null);
    const [accountDropdown, setAccountDropdown] = useState(null);

    const [newSlot, setNewSlot] = useState({
        start: '09:00',
        scenes: 1,
        platforms: []
    });

    useEffect(() => {
        setIsLoading(true); // Start loading when projectId changes
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user && projectId) {
                // 1. Fetch Slots
                const slotsRef = collection(db, 'users', user.uid, 'projects', projectId, 'slots');
                const unsubSlots = onSnapshot(slotsRef, (snapshot) => {
                    const loadedSchedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        data._docId = doc.id;
                        if (loadedSchedule[data.day]) {
                            loadedSchedule[data.day].push(data);
                        }
                    });
                    Object.keys(loadedSchedule).forEach(day => {
                        loadedSchedule[day].sort((a, b) => a.start.localeCompare(b.start));
                    });
                    setSchedule(loadedSchedule);
                    setIsLoading(false); // Stop loading
                });

                // 2. Fetch Connected Accounts
                const accountsRef = collection(db, 'users', user.uid, 'accounts');
                const unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
                    const accounts = [];
                    snapshot.forEach(doc => accounts.push({ id: doc.id, ...doc.data() }));
                    setAvailableAccounts(accounts);
                });

                return () => {
                    unsubSlots();
                    unsubAccounts();
                };
            } else {
                setSchedule({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });
                setIsLoading(false);
                if (!projectId && user) {
                    // Just fetch accounts even without project
                    const accountsRef = collection(db, 'users', user.uid, 'accounts');
                    const unsub = onSnapshot(accountsRef, (snap) => {
                        const accs = [];
                        snap.forEach(d => accs.push({ id: d.id, ...d.data() }));
                        setAvailableAccounts(accs);
                    });
                    return () => unsub();
                }
            }
        });
        return () => unsubscribeAuth();
    }, [projectId]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setAccountDropdown(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const addMinutes = (timeStr, minutes) => {
        const [hours, mins] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, mins + minutes);
        return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    };

    const calculateDuration = (scenes, platformsCount) => {
        return (scenes * 5) + (platformsCount * 3) + 15;
    };

    const duration = useMemo(() => calculateDuration(newSlot.scenes, newSlot.platforms.length), [newSlot.scenes, newSlot.platforms]);
    const endTime = useMemo(() => addMinutes(newSlot.start, duration), [newSlot.start, duration]);

    const checkOverlap = (start, end, daySlots, excludeSlotId = null) => {
        return daySlots.some(slot => {
            if (excludeSlotId && slot._docId === excludeSlotId) return false;
            return (start < slot.end && end > slot.start);
        });
    };

    const saveSlotToFirestore = async (slotData) => {
        if (!currentUser || !projectId) return;
        setIsSaving(true);
        try {
            const slotId = `${slotData.day}_${slotData.start.replace(':', '')}`;
            const slotRef = doc(db, 'users', currentUser.uid, 'projects', projectId, 'slots', slotId);
            await setDoc(slotRef, slotData);
        } catch (err) {
            console.error("Error saving slot:", err);
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const deleteSlotFromFirestore = async (slotId) => {
        if (!currentUser || !projectId) return;
        try {
            const { deleteDoc } = await import('firebase/firestore');
            const slotRef = doc(db, 'users', currentUser.uid, 'projects', projectId, 'slots', slotId);
            await deleteDoc(slotRef);
        } catch (err) {
            console.error("Error deleting slot:", err);
        }
    };

    const handleEditSlot = (slot) => {
        setEditingSlotId(slot._docId);
        setNewSlot({
            start: slot.start,
            scenes: slot.scenes,
            platforms: slot.platforms || []
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingSlotId(null);
        setNewSlot({
            start: '09:00',
            scenes: 1,
            platforms: []
        });
        setError(null);
    };

    const handlePlatformClick = (platformId, event) => {
        setError(null);
        if (newSlot.platforms.some(p => p.platformId === platformId)) {
            setNewSlot(prev => ({
                ...prev,
                platforms: prev.platforms.filter(p => p.platformId !== platformId)
            }));
            return;
        }

        const platformAccounts = availableAccounts.filter(acc => acc.platform === platformId);

        if (platformAccounts.length === 0) {
            setError(`No connected ${platformId} account found. Please go to Platforms page.`);
            return;
        }

        if (platformAccounts.length === 1) {
            const acc = platformAccounts[0];
            selectAccount({ platformId, accountId: acc.id, name: acc.name, avatar: acc.avatar });
            return;
        }

        setAccountDropdown({
            platformId,
            accounts: platformAccounts
        });
    };

    const selectAccount = (accountObj) => {
        setNewSlot(prev => ({
            ...prev,
            platforms: [...prev.platforms, accountObj]
        }));
        setAccountDropdown(null);
    };

    const handleSaveSlot = async () => {
        setError(null);
        if (!currentUser) {
            setError(t('timeslot.login_required'));
            return;
        }

        if (newSlot.platforms.length === 0) {
            setError("Please select at least one platform");
            return;
        }

        const daySlots = schedule[selectedDay] || [];

        if (checkOverlap(newSlot.start, endTime, daySlots, editingSlotId)) {
            setError(t('timeslot.overlap_error'));
            return;
        }

        const slotData = {
            day: selectedDay,
            start: newSlot.start,
            end: endTime,
            scenes: newSlot.scenes,
            platformsCount: newSlot.platforms.length,
            platforms: newSlot.platforms,
            duration: duration,
            createdAt: new Date().toISOString()
        };

        if (editingSlotId) {
            const newId = `${selectedDay}_${newSlot.start.replace(':', '')}`;
            if (editingSlotId !== newId) {
                await deleteSlotFromFirestore(editingSlotId);
            }
        }

        await saveSlotToFirestore(slotData);
        if (editingSlotId) handleCancelEdit();
    };

    const handleRemoveSlot = async (slot) => {
        await deleteSlotFromFirestore(slot._docId || `${selectedDay}_${slot.start.replace(':', '')}`);
    };

    // --- RENDER ---
    return (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/10 w-full relative">

            {/* --- LOADING SPINNER --- */}
            {isLoading && (
                <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                        <Loader2 className="animate-spin text-green-400" size={48} />
                        <p className="text-white font-medium animate-pulse">Loading Schedule...</p>
                    </div>
                </div>
            )}

            {/* DROPDOWN OVERLAY */}
            {accountDropdown && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 bg-slate-800 border border-white/20 rounded-xl shadow-2xl p-2 w-64 animate-in fade-in zoom-in-95 duration-200"
                    style={{
                        top: '40%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    <div className="p-2 border-b border-white/10 mb-2">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Select {accountDropdown.platformId} Account</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        {accountDropdown.accounts.map(acc => (
                            <button
                                key={acc.id}
                                onClick={() => selectAccount({ platformId: accountDropdown.platformId, accountId: acc.id, name: acc.name, avatar: acc.avatar })}
                                className="flex items-center gap-3 w-full p-2 hover:bg-white/10 rounded-lg text-left transition-colors"
                            >
                                <img src={acc.avatar} alt={acc.name} className="w-8 h-8 rounded-full border border-white/10" />
                                <span className="text-sm text-white font-medium truncate">{acc.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3 text-white">
                    <Clock size={28} className="text-red-400" />
                    <h2 className="text-2xl font-bold tracking-wide">{t('timeslot.title')}</h2>
                </div>
                {isSaving && <div className="text-sm text-white/70 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> {t('timeslot.saving')}</div>}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-200 text-sm shadow-lg backdrop-blur-sm animate-pulse">
                    <AlertTriangle size={18} className="text-red-500" />
                    {error}
                </div>
            )}

            {/* TOP SECTION: Input Controls */}
            <div className={`rounded-2xl p-6 border mb-8 transition-colors ${editingSlotId ? 'bg-blue-900/10 border-blue-500/30' : 'bg-black/20 border-white/10'}`}>
                {editingSlotId && (
                    <div className="flex items-center gap-2 mb-4 text-blue-400 font-bold text-sm uppercase tracking-wider animate-in fade-in slide-in-from-left-2">
                        <Pencil size={16} /> Edit Mode Active
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                    <div className="md:col-span-2">
                        <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wider font-semibold">{t('timeslot.start_time')}</label>
                        <input
                            type="time"
                            value={newSlot.start}
                            onChange={e => setNewSlot({ ...newSlot, start: e.target.value })}
                            className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 text-xl text-white placeholder-white/20 focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none transition-all"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wider font-semibold">Scenes (1-20)</label>
                        <input
                            type="number"
                            min="1" max="20"
                            value={newSlot.scenes}
                            onChange={e => setNewSlot({ ...newSlot, scenes: Number(e.target.value) })}
                            className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 text-xl text-white placeholder-white/20 focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none transition-all"
                        />
                    </div>

                    <div className="md:col-span-5">
                        <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wider font-semibold">{t('timeslot.platforms')}</label>
                        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                            {PLATFORMS_LIST.map(platform => {
                                const selectedObj = newSlot.platforms.find(p => p.platformId === platform.id);
                                const isSelected = !!selectedObj;

                                return (
                                    <button
                                        key={platform.id}
                                        onClick={(e) => handlePlatformClick(platform.id, e)}
                                        className={twMerge(
                                            "h-14 rounded-xl text-sm font-bold transition-all border flex flex-col items-center justify-center relative overflow-hidden",
                                            isSelected
                                                ? "bg-green-500/20 border-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                                                : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20"
                                        )}
                                    >
                                        <div className="z-10 flex items-center gap-1">
                                            {isSelected ? (
                                                <span className="truncate max-w-[80%] text-xs">{selectedObj.name}</span>
                                            ) : (
                                                platform.label
                                            )}
                                        </div>
                                        {isSelected && <Check size={16} className="absolute top-1 right-1 text-green-400" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="md:col-span-3 flex flex-col gap-2">
                        <div className="text-xs text-gray-400 mb-0.5 uppercase tracking-wider font-semibold flex justify-between">
                            <span>Duration</span>
                            <span className="text-white">{duration}m</span>
                        </div>
                        <div className="flex gap-2">
                            {editingSlotId && (
                                <button
                                    onClick={handleCancelEdit}
                                    className="h-14 px-4 bg-white/10 hover:bg-white/20 text-gray-300 rounded-xl transition-all"
                                    title="Cancel Edit"
                                >
                                    <X size={20} />
                                </button>
                            )}
                            <button
                                onClick={handleSaveSlot}
                                disabled={isSaving || !currentUser}
                                className={twMerge(
                                    "w-full h-14 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                                    editingSlotId
                                        ? "bg-blue-600 hover:bg-blue-500 text-white"
                                        : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white"
                                )}
                            >
                                {editingSlotId ? <Save size={20} /> : <Plus size={20} />}
                                {editingSlotId ? "Update Slot" : t('timeslot.add_slot')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* BOTTOM SECTION: Schedule List */}
            <div>
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide border-b border-white/10">
                    {DAYS.map(day => (
                        <button
                            key={day}
                            onClick={() => setSelectedDay(day)}
                            className={twMerge(
                                "px-6 py-3 rounded-t-xl font-medium transition-all whitespace-nowrap relative top-[1px]",
                                selectedDay === day
                                    ? "bg-white/10 text-white border-x border-t border-white/10"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            {t(`days.${day}`)}
                            {(schedule[day]?.length || 0) > 0 && (
                                <span className={twMerge(
                                    "ml-2 px-1.5 py-0.5 text-xs rounded-full",
                                    selectedDay === day ? "bg-red-500 text-white" : "bg-white/10 text-gray-400"
                                )}>
                                    {schedule[day].length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="space-y-3">
                    {(schedule[selectedDay]?.length || 0) === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-white/20 border-2 border-dashed border-white/10 rounded-xl">
                            <Clock size={48} className="mb-4 opacity-50" />
                            <p className="text-lg">{t('timeslot.no_slots')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {schedule[selectedDay]?.map((slot, index) => (
                                <div key={index} className={twMerge(
                                    "flex flex-col p-5 bg-white/5 rounded-2xl border transition-all shadow-sm relative overflow-hidden group",
                                    editingSlotId === slot._docId
                                        ? "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20"
                                        : "border-white/5 hover:bg-white/10 hover:border-white/20"
                                )}>
                                    <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-red-500 to-purple-500" style={{ width: `${Math.min(slot.duration, 100)}%` }} />

                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-2xl font-bold text-white">{slot.start}</span>
                                            <span className="text-white/30">➜</span>
                                            <span className="font-mono text-xl text-white/60">{slot.end}</span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEditSlot(slot)}
                                                className="p-2 text-gray-500 hover:text-white hover:bg-blue-500/20 rounded-lg transition-all"
                                                title="Edit Slot"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleRemoveSlot(slot)}
                                                className="p-2 text-gray-500 hover:text-white hover:bg-red-500 rounded-lg transition-all"
                                                title={t('timeslot.remove')}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 text-xs font-medium">
                                        <span className="px-2 py-1 bg-blue-500/10 text-blue-300 rounded border border-blue-500/20">
                                            {slot.scenes} Scenes
                                        </span>
                                        <span className="px-2 py-1 bg-green-500/10 text-green-300 rounded border border-green-500/20">
                                            {/* Count Objects */}
                                            {slot.platforms ? slot.platforms.length : slot.platformsCount} Platforms
                                        </span>
                                        <span className="px-2 py-1 bg-purple-500/10 text-purple-300 rounded border border-purple-500/20">
                                            {slot.duration} min
                                        </span>
                                    </div>

                                    {slot.platforms && Array.isArray(slot.platforms) && (
                                        <div className="flex gap-1 mt-2 flex-wrap">
                                            {slot.platforms.map((p, idx) => (
                                                <div key={idx} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[10px] text-gray-400">
                                                    <span>{p.platformId.slice(0, 2).toUpperCase()}:</span>
                                                    <span className="text-white">{p.name || 'Account'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
