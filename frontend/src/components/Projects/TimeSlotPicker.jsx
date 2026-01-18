import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Clock, AlertTriangle, Loader2, Check, ChevronDown, MonitorPlay, Pencil, X, Save } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { db, auth } from '../../firebase';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Platform Definition
const PLATFORMS_LIST = [
    { id: 'facebook', label: 'Facebook' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'youtube', label: 'YouTube' }
];

const TimelineVisualizer = ({ slots }) => {
    // 1. Helper: Time to Minutes
    const toMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    // 2. Generate Segments (Free vs Booked)
    const segments = useMemo(() => {
        const result = [];
        let currentTime = 0; // Start at 00:00

        // Ensure slots are sorted
        const sortedSlots = [...(slots || [])].sort((a, b) => a.start.localeCompare(b.start));

        sortedSlots.forEach(slot => {
            const startMin = toMinutes(slot.start);
            const endMin = toMinutes(slot.end);

            // A. Gap before slot (Free)
            if (startMin > currentTime) {
                result.push({
                    type: 'free',
                    start: currentTime,
                    end: startMin,
                    duration: startMin - currentTime
                });
            }

            // B. The Slot itself (Booked)
            result.push({
                type: 'booked',
                start: startMin,
                end: endMin,
                duration: endMin - startMin,
                data: slot
            });

            // Update tracker
            currentTime = Math.max(currentTime, endMin);
        });

        // C. Gap after last slot (Free)
        if (currentTime < 1440) {
            result.push({
                type: 'free',
                start: currentTime,
                end: 1440,
                duration: 1440 - currentTime
            });
        }

        return result;
    }, [slots]);

    // 3. Helper: Minutes to HH:MM for tooltip
    const toTimeStr = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // 4. Axis Labels Config
    const AXIS_HOURS = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 24];

    return (
        <div className="w-full mb-8 select-none">
            {/* BAR CONTAINER */}
            <div className="w-full h-8 flex rounded bg-gray-800 relative overflow-hidden mb-2 shadow-inner border border-white/5">
                {segments.map((seg, idx) => (
                    <div
                        key={idx}
                        style={{ width: `${(seg.duration / 1440) * 100}%` }}
                        className={twMerge(
                            "h-full transition-all duration-300 relative group",
                            seg.type === 'booked'
                                ? "bg-red-500/80 hover:bg-red-400 cursor-pointer"
                                : "bg-green-500/10 hover:bg-green-400/20"
                        )}
                        title={`${toTimeStr(seg.start)} - ${toTimeStr(seg.end)} : ${seg.type === 'booked' ? 'Scheduled' : 'Free'}`}
                    >
                        {/* Internal striped pattern for booked slots for extra texture */}
                        {seg.type === 'booked' && (
                            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(0,0,0,0.2)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.2)_50%,rgba(0,0,0,0.2)_75%,transparent_75%,transparent)] bg-[length:10px_10px] opacity-30" />
                        )}
                    </div>
                ))}
            </div>

            {/* AXIS LABELS */}
            <div className="w-full relative h-6">
                {AXIS_HOURS.map(hour => (
                    <div
                        key={hour}
                        className="absolute flex flex-col items-center"
                        style={{ left: `${(hour / 24) * 100}%` }}
                    >
                        {/* Tick Mark */}
                        <div className="w-px h-1 bg-gray-600 mb-1 transform -translate-x-1/2"></div>

                        {/* Label */}
                        <span className="text-sm text-white font-mono transform -translate-x-1/2">
                            {hour === 24 ? '00' : String(hour).padStart(2, '0')}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function TimeSlotPicker({ projectId, modeScenes = null }) {
    const { t } = useTranslation();
    const dropdownRef = useRef(null);
    const [selectedDay, setSelectedDay] = useState('mon');
    const [schedule, setSchedule] = useState({
        mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
    });

    const [currentUser, setCurrentUser] = useState(null);
    const [availableAccounts, setAvailableAccounts] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    // Edit Mode State: Stores the ID of the slot being edited (e.g. "mon_0900")
    const [editingSlotId, setEditingSlotId] = useState(null);

    // Dropdown State: { platformId: string, targetRect: DOMRect }
    const [accountDropdown, setAccountDropdown] = useState(null);

    // New Slot State: Platforms now store OBJECTS { platformId, accountId, name, avatar }
    const [newSlot, setNewSlot] = useState({
        start: '09:00',
        scenes: modeScenes || 1,
        sceneDuration: 8, // seconds per scene
        platforms: []
    });

    // Sync scenes when modeScenes changes
    useEffect(() => {
        if (modeScenes && modeScenes > 0) {
            setNewSlot(prev => ({ ...prev, scenes: modeScenes }));
        }
    }, [modeScenes]);

    // Auth & Data Fetching
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user && projectId) {
                // 1. Fetch Slots
                const slotsRef = collection(db, 'users', user.uid, 'projects', projectId, 'slots');
                const unsubSlots = onSnapshot(slotsRef, (snapshot) => {
                    const loadedSchedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        // Ensure we have the ID for editing reference
                        data._docId = doc.id;
                        if (loadedSchedule[data.day]) {
                            loadedSchedule[data.day].push(data);
                        }
                    });
                    // Sort slots by start time
                    Object.keys(loadedSchedule).forEach(day => {
                        loadedSchedule[day].sort((a, b) => a.start.localeCompare(b.start));
                    });
                    setSchedule(loadedSchedule);
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
                if (!projectId && user) {
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

    // Helper: Add minutes to time string (HH:MM)
    const addMinutes = (timeStr, minutes) => {
        const [hours, mins] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, mins + minutes);
        return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    };

    // Helper: Calculate duration
    const calculateDuration = (scenes, platformsCount) => {
        return (scenes * 5) + (platformsCount * 3) + 15;
    };

    // Derived Values
    const duration = useMemo(() => calculateDuration(newSlot.scenes, newSlot.platforms.length), [newSlot.scenes, newSlot.platforms]);
    const endTime = useMemo(() => addMinutes(newSlot.start, duration), [newSlot.start, duration]);

    // Strict Validation: Check Overlap
    const checkOverlap = (start, end, daySlots, excludeSlotId = null) => {
        return daySlots.some(slot => {
            // If editing, skip self
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
            // Dynamic import
            const { deleteDoc } = await import('firebase/firestore');
            const slotRef = doc(db, 'users', currentUser.uid, 'projects', projectId, 'slots', slotId);
            await deleteDoc(slotRef);
        } catch (err) {
            console.error("Error deleting slot:", err);
        }
    };

    // --- EDIT ACTIONS ---
    const handleEditSlot = (slot) => {
        setEditingSlotId(slot._docId);
        setNewSlot({
            start: slot.start,
            scenes: slot.scenes,
            sceneDuration: slot.sceneDuration || 8,
            platforms: slot.platforms || [] // Ensure array
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingSlotId(null);
        setNewSlot({
            start: '09:00',
            scenes: 1,
            sceneDuration: 8,
            platforms: []
        });
        setError(null);
    };

    // --- NEW LOGIC: Platform Selection ---

    // 1. Toggle or Open Dropdown
    const handlePlatformClick = (platformId, event) => {
        setError(null);

        // Check if already selected -> Remove it
        if (newSlot.platforms.some(p => p.platformId === platformId)) {
            setNewSlot(prev => ({
                ...prev,
                platforms: prev.platforms.filter(p => p.platformId !== platformId)
            }));
            return;
        }

        // Check available accounts for this platform
        const platformAccounts = availableAccounts.filter(acc => acc.platform === platformId);

        // SCENARIO A: No Accounts
        if (platformAccounts.length === 0) {
            setError(`No connected ${platformId} account found. Please go to Platforms page.`);
            return;
        }

        // SCENARIO B: Single Account -> Auto Select
        if (platformAccounts.length === 1) {
            const acc = platformAccounts[0];
            selectAccount({ platformId, accountId: acc.id, name: acc.name, avatar: acc.avatar });
            return;
        }

        // SCENARIO C: Multiple Accounts -> Open Dropdown
        // Store position relative to button
        // Simple approximation: open dropdown near the button
        setAccountDropdown({
            platformId,
            accounts: platformAccounts
        });
    };

    // 2. Select specific account from dropdown
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

        // 1. Strict Overlap Check (Pass editing ID to exclude if editing)
        if (checkOverlap(newSlot.start, endTime, daySlots, editingSlotId)) {
            setError(t('timeslot.overlap_error'));
            return;
        }

        // 2. Prepare Data
        const slotData = {
            day: selectedDay,
            start: newSlot.start,
            end: endTime,
            scenes: newSlot.scenes,
            sceneDuration: newSlot.sceneDuration, // seconds per scene for AI
            platformsCount: newSlot.platforms.length,
            // STORE FULL ACCOUNT OBJECTS NOW
            platforms: newSlot.platforms,
            duration: duration,
            createdAt: new Date().toISOString()
        };

        // 3. Save Logic (Delete Old if Editing + ID Changed)
        if (editingSlotId) {
            const newId = `${selectedDay}_${newSlot.start.replace(':', '')}`;
            // If ID changed (time changed), or just always delete old to be safe
            if (editingSlotId !== newId) {
                await deleteSlotFromFirestore(editingSlotId);
            }
        }

        await saveSlotToFirestore(slotData);

        // Reset after save
        if (editingSlotId) handleCancelEdit();
    };

    const handleRemoveSlot = async (slot) => {
        await deleteSlotFromFirestore(slot._docId || `${selectedDay}_${slot.start.replace(':', '')}`);
    };

    return (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/10 w-full relative">

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

            {/* TOP SECTION: Input Controls (Full Width) */}
            <div className={`rounded-2xl p-6 border mb-8 transition-colors ${editingSlotId ? 'bg-blue-900/10 border-blue-500/30' : 'bg-black/20 border-white/10'}`}>
                {editingSlotId && (
                    <div className="flex items-center gap-2 mb-4 text-blue-400 font-bold text-sm uppercase tracking-wider animate-in fade-in slide-in-from-left-2">
                        <Pencil size={16} /> Edit Mode Active
                    </div>
                )}

                {/* Row 1: Time + Scenes + วินาที/ซีน (ชิดซ้าย) + Add Button (ชิดขวา) */}
                <div className="flex flex-wrap items-end gap-4 mb-4">
                    {/* LEFT GROUP: Time + Scenes + วินาที/ซีน */}
                    <div className="flex items-end gap-4">
                        {/* 1. Time Input */}
                        <div className="flex-shrink-0">
                            <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wider font-semibold">{t('timeslot.start_time')}</label>
                            <input
                                type="time"
                                value={newSlot.start}
                                onChange={e => setNewSlot({ ...newSlot, start: e.target.value })}
                                className="w-32 h-12 bg-white/5 border border-white/10 rounded-xl px-3 text-lg text-white placeholder-white/20 focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none transition-all"
                            />
                        </div>

                        {/* 2. Scenes Input */}
                        <div className="flex-shrink-0">
                            <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wider font-semibold">
                                Scenes {modeScenes ? <span className="text-purple-400">(Mode)</span> : ''}
                            </label>
                            <input
                                type="number"
                                min="1" max="20"
                                value={modeScenes || newSlot.scenes}
                                onChange={e => !modeScenes && setNewSlot({ ...newSlot, scenes: Number(e.target.value) })}
                                readOnly={!!modeScenes}
                                className={twMerge(
                                    "w-20 h-12 border rounded-xl px-3 text-lg text-white text-center placeholder-white/20 outline-none transition-all",
                                    modeScenes 
                                        ? "bg-purple-500/10 border-purple-500/30 cursor-not-allowed" 
                                        : "bg-white/5 border-white/10 focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
                                )}
                            />
                        </div>

                        {/* 3. Scene Duration */}
                        <div className="flex-shrink-0">
                            <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wider font-semibold">
                                วินาที/ซีน
                            </label>
                            <input
                                type="number"
                                min="5" max="60"
                                value={newSlot.sceneDuration}
                                onChange={e => setNewSlot({ ...newSlot, sceneDuration: Number(e.target.value) })}
                                className="w-20 h-12 bg-purple-500/10 border border-purple-500/30 rounded-xl px-3 text-lg text-white text-center placeholder-white/20 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 outline-none transition-all"
                                placeholder="8"
                            />
                        </div>
                    </div>

                    {/* Spacer to push button right */}
                    <div className="flex-grow"></div>

                    {/* RIGHT: Add/Update Button */}
                    <div className="flex gap-2 flex-shrink-0">
                        {editingSlotId && (
                            <button
                                onClick={handleCancelEdit}
                                className="h-12 px-4 bg-white/10 hover:bg-white/20 text-gray-300 rounded-xl transition-all"
                                title="Cancel Edit"
                            >
                                <X size={20} />
                            </button>
                        )}
                        <button
                            onClick={handleSaveSlot}
                            disabled={isSaving || !currentUser}
                            className={twMerge(
                                "h-12 px-6 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                                editingSlotId
                                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                                    : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white"
                            )}
                        >
                            {editingSlotId ? <Save size={18} /> : <Plus size={18} />}
                            {editingSlotId ? "Update" : t('timeslot.add_slot')}
                        </button>
                    </div>
                </div>

                {/* Row 2: Platforms (ชิดซ้าย) + Duration (ชิดขวา) */}
                <div className="flex items-end justify-between gap-4">
                    {/* LEFT: Platforms Grid */}
                    <div className="flex-shrink-0">
                        <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wider font-semibold">{t('timeslot.platforms')} (1-4)</label>
                        <div className="flex gap-2">
                            {PLATFORMS_LIST.map(platform => {
                                const selectedObj = newSlot.platforms.find(p => p.platformId === platform.id);
                                const isSelected = !!selectedObj;

                                return (
                                    <button
                                        key={platform.id}
                                        onClick={(e) => handlePlatformClick(platform.id, e)}
                                        className={twMerge(
                                            "w-24 h-12 rounded-xl text-xs font-bold transition-all border flex flex-col items-center justify-center relative overflow-hidden",
                                            isSelected
                                                ? "bg-green-500/20 border-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                                                : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20"
                                        )}
                                    >
                                        <div className="z-10 flex items-center gap-1">
                                            {isSelected ? (
                                                <span className="truncate max-w-full text-xs">{selectedObj.name?.split(' ')[0] || platform.label}</span>
                                            ) : (
                                                platform.label
                                            )}
                                        </div>
                                        {isSelected && <Check size={12} className="absolute top-0.5 right-0.5 text-green-400" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* RIGHT: Duration Display */}
                    <div className="flex-shrink-0 px-4 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center gap-2">
                        <span className="text-xs text-gray-400 uppercase">Duration</span>
                        <span className="text-white font-bold text-lg">{duration}m</span>
                    </div>
                </div>
            </div>

            {/* BOTTOM SECTION: Schedule List */}
            <div>
                {/* Days Tabs */}
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

                {/* --- NEW TIMELINE VISUALIZER --- */}
                <TimelineVisualizer slots={schedule[selectedDay]} />

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
                                    {/* Duration Bar */}
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

                                    {/* Added: Show Selected Accounts Mini Badges */}
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
