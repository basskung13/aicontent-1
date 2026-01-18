import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Folder, LayoutGrid, List, ArrowRight, Loader2, Play, Square, Layers, AlignLeft, Pencil, Check, X, Terminal, Clock, Activity, Filter, Youtube, Facebook, Video, ChevronDown, Trash2, Sparkles, Camera, Key, FlaskConical, Copy, CheckCircle, Hash, FileText } from 'lucide-react';
import { db, auth, functions, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, setDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, limit, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { twMerge } from 'tailwind-merge';
import TimeSlotPicker from '../components/Projects/TimeSlotPicker';

import ProjectHistory from '../components/Projects/ProjectHistory';
import ContentQueue from '../components/Projects/ContentQueue';

export default function Projects() {
    const { t } = useTranslation();
    const [currentUser, setCurrentUser] = useState(null);
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [activeTab, setActiveTab] = useState('monitor'); // 'monitor' | 'history'

    // Creation State
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // --- NEW: Project Execution State ---
    const [modes, setModes] = useState([]);
    const [selectedModeId, setSelectedModeId] = useState('');
    const [formValues, setFormValues] = useState({});
    const [runningProjectIds, setRunningProjectIds] = useState([]); // NEW: Track multiple running projects
    
    // --- EXPANDER STATE ---
    const [expanders, setExpanders] = useState([]);
    const [selectedExpanderId, setSelectedExpanderId] = useState('');

    // --- TEST PROMPT PIPELINE STATE ---
    const [isTestingPrompt, setIsTestingPrompt] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [copiedIndex, setCopiedIndex] = useState(null);

    // --- NEW: Firestore Sequences Sync ---
    const [userTimezone, setUserTimezone] = useState('Asia/Bangkok'); // Added back
    const [currentTime, setCurrentTime] = useState(new Date()); // RTC State
    const [isTimezoneDropdownOpen, setIsTimezoneDropdownOpen] = useState(false); // Timezone dropdown state
    const [timezoneDropdownPos, setTimezoneDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const timezoneButtonRef = useRef(null);
    const timezoneDropdownRef = useRef(null);

    // Real-time Clock Ticker
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Timezone Dropdown: position + click outside
    useEffect(() => {
        if (!isTimezoneDropdownOpen) return;

        const buttonEl = timezoneButtonRef.current;
        const updatePosition = () => {
            if (!buttonEl) return;
            const rect = buttonEl.getBoundingClientRect();
            setTimezoneDropdownPos({
                top: rect.bottom + 8,
                left: rect.left,
                width: rect.width
            });
        };

        const handleClickOutside = (event) => {
            if (!timezoneDropdownRef.current || !buttonEl) return;
            if (!timezoneDropdownRef.current.contains(event.target) && !buttonEl.contains(event.target)) {
                setIsTimezoneDropdownOpen(false);
            }
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isTimezoneDropdownOpen]);

    // Fetch User Timezone on Load
    useEffect(() => {
        if (!currentUser) return;
        console.log("👤 Fetching Timezone for user:", currentUser.uid);
        const fetchUserParams = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    console.log("📂 User Data:", data);
                    if (data.timezone) {
                        setUserTimezone(data.timezone);
                        console.log("✅ Set User Timezone from DB:", data.timezone);
                    }
                } else {
                    console.log("⚠️ User Document not found, creating placeholder...");
                }
            } catch (e) {
                console.error("Error fetching user timezone:", e);
            }
        };
        fetchUserParams();
    }, [currentUser]);

    const handleTimezoneChange = async (e) => {
        const newTz = e.target.value;
        setUserTimezone(newTz);
        if (currentUser) {
            console.log("💾 Saving Timezone:", newTz);
            await setDoc(doc(db, 'users', currentUser.uid), { timezone: newTz }, { merge: true });
            console.log("🌍 Timezone saved successfully.");
        }
    };

    const [sequences, setSequences] = useState([]);
    const [isSequencesSaving, setIsSequencesSaving] = useState(false);
    const isRemoteUpdate = useRef(false); // Flag to prevent write-loop

    // 1. Real-time Read (Sync from Firestore)
    useEffect(() => {
        // Listening to specific doc: projects/default-project
        const docRef = doc(db, 'projects', 'default-project');
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.sequences) {
                    isRemoteUpdate.current = true; // Mark as remote update
                    setSequences(data.sequences);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // 2. Auto-Save (Write to Firestore)
    useEffect(() => {
        // Skip if this update came from Firestore or if empty (initial)
        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false; // Reset flag
            return;
        }

        const saveSequences = async () => {
            setIsSequencesSaving(true);
            try {
                // Save to projects/default-project
                await setDoc(doc(db, 'projects', 'default-project'), {
                    sequences: sequences,
                    lastUpdated: serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error("Error auto-saving sequences:", error);
            } finally {
                setTimeout(() => setIsSequencesSaving(false), 500); // Small delay for UI smoothness
            }
        };

        // Debounce simple save
        const timeoutId = setTimeout(() => {
            saveSequences();
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [sequences]);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user) {
                // 1. Fetch Projects
                const projectsRef = collection(db, 'users', user.uid, 'projects');
                const q = query(projectsRef, orderBy('createdAt', 'desc'));
                const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
                    const loadedProjects = [];
                    snapshot.forEach(doc => {
                        loadedProjects.push({ id: doc.id, ...doc.data() });
                    });
                    setProjects(loadedProjects);
                });

                // 2. Fetch Modes (NEW)
                const modesRef = collection(db, 'users', user.uid, 'modes');
                const unsubscribeModes = onSnapshot(modesRef, (snapshot) => {
                    const loadedModes = [];
                    snapshot.forEach(doc => {
                        loadedModes.push({ id: doc.id, ...doc.data() });
                    });
                    setModes(loadedModes);
                });
                
                // 3. Fetch Expanders
                const expandersRef = collection(db, 'users', user.uid, 'expanders');
                const unsubscribeExpanders = onSnapshot(expandersRef, (snapshot) => {
                    const loadedExpanders = [];
                    snapshot.forEach(doc => {
                        loadedExpanders.push({ id: doc.id, ...doc.data() });
                    });
                    setExpanders(loadedExpanders);
                });

                return () => {
                    unsubscribeSnapshot();
                    unsubscribeModes();
                    unsubscribeExpanders();
                };
            } else {
                setProjects([]);
                setSelectedProject(null);
                setModes([]);
                setExpanders([]);
            }
        });
        return () => unsubscribeAuth();
    }, []); // Removed specific deps to ensure clean mounting logic

    const handleCreateProject = async () => {
        if (!newProjectName.trim() || !currentUser) return;
        setIsSaving(true);
        try {
            // Create a simple project doc
            const projectId = newProjectName.toLowerCase().replace(/\s+/g, '-');
            const newProject = {
                name: newProjectName,
                createdAt: serverTimestamp(),
                status: 'active'
            };

            const newProjectRef = doc(collection(db, 'users', currentUser.uid, 'projects'));
            await setDoc(newProjectRef, newProject);

            setNewProjectName('');
            setIsCreating(false);
            // Optionally auto-select the new project
            setSelectedProject({ id: newProjectRef.id, ...newProject });
        } catch (error) {
            console.error("Error creating project:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearLogs = async () => {
        if (!selectedProject || !currentUser) return;
        if (!window.confirm('Are you sure you want to clear all logs for this project?')) return;

        try {
            const logsRef = collection(db, 'users', currentUser.uid, 'projects', selectedProject.id, 'logs');
            const snapshot = await getDocs(logsRef);
            if (snapshot.empty) return;

            const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            console.log("🧹 Logs cleared successfully.");
        } catch (error) {
            console.error("Error clearing logs:", error);
            alert("Failed to clear logs: " + error.message);
        }
    };



    // --- SYNC MODE SELECTION & VARIABLES & EXPANDER ---
    useEffect(() => {
        if (selectedProject) {
            // 1. Sync Mode ID - Only if mode exists in modes array
            if (selectedProject.executionModeId && modes.length > 0) {
                const modeExists = modes.some(m => m.id === selectedProject.executionModeId);
                if (modeExists) {
                    setSelectedModeId(selectedProject.executionModeId);
                } else {
                    // Mode doesn't exist, select first available
                    setSelectedModeId(modes[0].id);
                }
            } else if (modes.length > 0 && !selectedProject.executionModeId) {
                // No mode saved, auto-select first
                setSelectedModeId(modes[0].id);
            } else {
                setSelectedModeId('');
            }

            // 2. Sync Variable Values (Deep Load)
            if (selectedProject.variableValues) {
                setFormValues(selectedProject.variableValues);
            } else {
                setFormValues({});
            }
            
            // 3. Sync Expander ID
            if (selectedProject.expanderId) {
                setSelectedExpanderId(selectedProject.expanderId);
            } else {
                setSelectedExpanderId('');
            }
        } else {
            setSelectedModeId('');
            setFormValues({});
            setSelectedExpanderId('');
        }
    }, [selectedProject, modes]);

    // --- NEW: SCHEDULING & LOGS STATE ---
    const [mockLogs, setMockLogs] = useState([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(true);
    const [nextRunCountdown, setNextRunCountdown] = useState(null);
    const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'TIKTOK' | 'FACEBOOK' | 'YOUTUBE'

    // 4. REAL-TIME LOGS LISTENER
    useEffect(() => {
        if (!currentUser || !selectedProject) {
            setMockLogs([]);
            return;
        }

        const logsRef = collection(db, 'users', currentUser.uid, 'projects', selectedProject.id, 'logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`📡 [Logs Listener] Received ${snapshot.size} logs for project ${selectedProject.id}`);
            const logs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                logs.push({
                    id: doc.id,
                    ...data,
                    // Convert Firestore Timestamp to Date string respecting User Timezone
                    timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('th-TH', {
                        timeZone: userTimezone || 'Asia/Bangkok',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour12: false
                    }) : new Date().toLocaleString('th-TH')
                });
            });
            console.log("🔥 Firestore Logs Fetched:", logs.length);
            setMockLogs(logs);
            setIsLoadingLogs(false);
        });

        return () => unsubscribe();
    }, [currentUser, selectedProject?.id]);

    // 5. NEXT RUN CALCULATOR (Real Logic)
    useEffect(() => {
        if (!selectedProject || selectedProject.status !== 'running') {
            setNextRunCountdown(null);
            return;
        }

        // We need local scope variable to hold timer clearing function if we use intervals
        let timer = null;

        const calculateNextRun = async () => {
            // A. Get Slots for this project
            const slotsRef = collection(db, 'users', currentUser.uid, 'projects', selectedProject.id, 'slots');
            const slotsSnap = await getDocs(slotsRef); // Optimization: Could switch to onSnapshot if slots change often

            if (slotsSnap.empty) {
                setNextRunCountdown("No Slots");
                return;
            }

            const slots = slotsSnap.docs.map(d => d.data());

            // B. Calculate "Project Time" (based on User TZ)
            const tz = userTimezone || 'Asia/Bangkok';
            const now = new Date();

            // Helper: Get next occurrence date for a slot string "HH:MM", "mon"
            const getNextOccurrence = (slot) => {
                const daysMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
                const targetDayIndex = daysMap[slot.day];

                const [h, m] = slot.start.split(':').map(Number);

                // Create candidate date based on current time BUT with slot time
                // We need to respect Timezone. Converting to "User Time" first might be easier?
                // Actually, let's use the local 'now' date components relative to the TZ.
                // Since this runs in browser, 'new Date()' is local system time. 
                // We really should rely on the *User's* intended time.
                // If User TZ is different from Browser TZ, we need offset.
                // For simplicity/robustness in Client: Just assume Browser Time for now OR simply use the "Diff" logic.

                // Let's stick to the Diff Logic but add seconds.

                // 1. Get current time in User TZ
                const userNowStr = new Date().toLocaleString('en-US', { timeZone: tz });
                const userNow = new Date(userNowStr); // "Local" representation of User Time

                let target = new Date(userNow);
                target.setHours(h, m, 0, 0); // Set slot time

                const currentDayIndex = userNow.getDay();
                let dayDiff = targetDayIndex - currentDayIndex;

                if (dayDiff < 0) dayDiff += 7;

                // If same day but time passed, wrap to next week
                if (dayDiff === 0 && target <= userNow) {
                    dayDiff = 7;
                }

                target.setDate(userNow.getDate() + dayDiff);
                return target;
            };

            let closestDate = null;
            let nextSlotInfo = "";

            slots.forEach(slot => {
                const nextDate = getNextOccurrence(slot);
                if (!closestDate || nextDate < closestDate) {
                    closestDate = nextDate;
                    nextSlotInfo = `${slot.day.toUpperCase()} ${slot.start}`;
                }
            });

            if (!closestDate) {
                setNextRunCountdown("No Future Slots");
            } else {
                // Calculate diff from "User Now"
                const userNowStr = new Date().toLocaleString('en-US', { timeZone: tz });
                const userNow = new Date(userNowStr);
                const diffMs = closestDate - userNow;

                const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const h = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
                const m = Math.floor((diffMs / (1000 * 60)) % 60);
                const s = Math.floor((diffMs / 1000) % 60);

                let text = "";
                if (d > 0) text += `${d}d `;
                if (h > 0) text += `${h}h `;
                if (m > 0) text += `${m}m `;
                text += `${s}s`;

                setNextRunCountdown(`${nextSlotInfo} (in ${text})`);
            }
        };

        // Update calculation every second
        calculateNextRun();
        timer = setInterval(calculateNextRun, 1000);

        return () => clearInterval(timer);
    }, [selectedProject?.id, selectedProject?.status, userTimezone]);

    const handleRun = async (project = null) => {
        const targetProject = project || selectedProject;
        if (!targetProject || !currentUser) return;

        const isRunning = targetProject.status === 'running';
        const newStatus = isRunning ? 'idle' : 'running';

        try {
            const projectRef = doc(db, 'users', currentUser.uid, 'projects', targetProject.id);
            await updateDoc(projectRef, {
                status: newStatus,
                lastUpdated: serverTimestamp()
            });

            // Optimistic update for UI responsiveness
            if (selectedProject?.id === targetProject.id) {
                setSelectedProject(prev => ({ ...prev, status: newStatus }));
            }
            // Update list local state is handled by snapshot, but we can force it if needed
            // setRunningProjectIds legacy... we can derive from project.status now
        } catch (error) {
            console.error("Error toggling status:", error);
        }
    };

    const selectedMode = modes.find(m => m.id === selectedModeId);

    // --- NEW: Inline Renaming State ---
    const [editingProjectId, setEditingProjectId] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [uploadingProjectId, setUploadingProjectId] = useState(null);
    const imageInputRef = useRef(null);

    // --- NEW: Extension Key Generation State ---
    const [generatedKey, setGeneratedKey] = useState(null);
    const [isGeneratingKey, setIsGeneratingKey] = useState(false);

    const handleGenerateKey = async () => {
        if (!currentUser) {
            alert("No user logged in. Please reload the page.");
            return;
        }

        if (!confirm('This will generate a new key and invalidate any existing key. Continue?')) return;

        setIsGeneratingKey(true);
        console.log("🔑 [KeyGen] Starting generation for:", currentUser.uid, currentUser.email);

        try {
            console.log("☁️ [KeyGen] Calling Cloud Function 'generateUserKey'...");
            const generateKey = httpsCallable(functions, 'generateUserKey');

            const result = await generateKey({});
            console.log("✅ [KeyGen] Result:", result);

            if (result.data && result.data.success) {
                console.log("🔑 [KeyGen] Success! Key:", result.data.key);
                setGeneratedKey(result.data.key);
            } else {
                console.error("❌ [KeyGen] Failed:", result);
                alert('Failed to generate key. Unexpected response format.');
            }
        } catch (error) {
            console.error('❌ [KeyGen] Error:', error);
            console.error('❌ [KeyGen] Code:', error.code);
            console.error('❌ [KeyGen] Msg:', error.message);

            let msg = error.message;
            if (error.code === 'not-found') msg = 'Cloud Function not found (Wait a moment or Deploy again)';
            if (error.code === 'failed-precondition') msg = 'Precondition Failed (Check Database)';
            if (error.code === 'internal') msg = 'Internal Server Error (Check Function Logs)';

            alert(`Error: ${msg} (${error.code})`);
        } finally {
            setIsGeneratingKey(false);
        }
    };

    // --- TEST PROMPT PIPELINE HANDLER ---
    const handleTestPromptPipeline = async () => {
        if (!currentUser || !selectedProject) return;
        
        setIsTestingPrompt(true);
        setTestResult(null);
        
        try {
            const testPromptPipeline = httpsCallable(functions, 'testPromptPipeline');
            const result = await testPromptPipeline({ projectId: selectedProject.id });
            
            console.log('✅ Test Pipeline Result:', result.data);
            setTestResult(result.data);
        } catch (error) {
            console.error('❌ Test Pipeline Error:', error);
            let msg = error.message;
            if (error.code === 'failed-precondition') msg = error.message;
            if (error.code === 'not-found') msg = 'Mode หรือ Project ไม่พบ';
            alert(`Error: ${msg}`);
        } finally {
            setIsTestingPrompt(false);
        }
    };

    const handleCopyPrompt = (text, index) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleCopyAllPrompts = () => {
        if (!testResult?.prompts) return;
        const allPrompts = testResult.prompts.map((p, i) => `[Scene ${i + 1}]\n${p.englishPrompt}`).join('\n\n');
        navigator.clipboard.writeText(allPrompts);
        setCopiedIndex('all');
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleStartEdit = (e, project) => {
        e.stopPropagation();
        setEditingProjectId(project.id);
        setEditNameValue(project.name);
    };

    const handleCancelEdit = (e) => {
        e.stopPropagation();
        setEditingProjectId(null);
        setEditNameValue('');
    };

    const handleSaveEdit = async (e, projectId) => {
        e.stopPropagation();
        if (!editNameValue.trim() || !currentUser) return;

        try {
            const projectRef = doc(db, 'users', currentUser.uid, 'projects', projectId);
            await setDoc(projectRef, { name: editNameValue, lastUpdated: serverTimestamp() }, { merge: true });

            // Update local state if needed (snapshot listener will likely handle it but good for immediate feedback)
            // If the renamed project was selected, update the selection state
            if (selectedProject?.id === projectId) {
                setSelectedProject(prev => ({ ...prev, name: editNameValue }));
            }

            setEditingProjectId(null);
            setEditNameValue('');
        } catch (error) {
            console.error("Error renaming project:", error);
        }
    };

    // --- NEW: Project Image Upload Handler ---
    const handleImageUpload = async (e, projectId) => {
        const file = e.target.files[0];
        if (!file || !currentUser) return;

        // Validate file size (3MB max)
        const MAX_SIZE = 3 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert("⚠️ ภาพใหญ่เกินไป! กรุณาเลือกไฟล์ที่มีขนาดไม่เกิน 3MB");
            e.target.value = "";
            return;
        }

        setUploadingProjectId(projectId);

        try {
            // Upload to Firebase Storage
            const storagePath = `project_thumbnails/${currentUser.uid}/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Update project in Firestore
            const projectRef = doc(db, 'users', currentUser.uid, 'projects', projectId);
            await setDoc(projectRef, { coverImage: downloadURL, lastUpdated: serverTimestamp() }, { merge: true });

            // Update local state
            if (selectedProject?.id === projectId) {
                setSelectedProject(prev => ({ ...prev, coverImage: downloadURL }));
            }

            console.log("✅ Project image uploaded:", downloadURL);
        } catch (error) {
            console.error("Error uploading project image:", error);
            alert("เกิดข้อผิดพลาดในการอัพโหลดภาพ: " + error.message);
        } finally {
            setUploadingProjectId(null);
            e.target.value = "";
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto min-h-screen">
            {/* Header - Unified Style */}
            <header className="mb-8 relative bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                                <Folder className="text-white group-hover:rotate-12 transition-transform duration-300" size={32} />
                            </div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                                <span className="text-[8px] font-bold text-black">{projects.length}</span>
                            </div>
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-100 to-orange-200 tracking-tight">{t('common.projects')}</h1>
                            <p className="text-base text-slate-400 font-light flex items-center gap-2 mt-1">
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                                จัดการตารางเนื้อหาของคุณ
                            </p>
                        </div>
                    </div>

                    {/* TIME ZONE SELECTOR & CLOCK - Custom Dropdown with Flags */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl p-2 pr-4 shadow-lg">
                            <div className="relative">
                                {/* Custom Timezone Button */}
                                <button
                                    ref={timezoneButtonRef}
                                    onClick={() => {
                                        const buttonEl = timezoneButtonRef.current;
                                        if (buttonEl) {
                                            const rect = buttonEl.getBoundingClientRect();
                                            setTimezoneDropdownPos({
                                                top: rect.bottom + 8,
                                                left: rect.left,
                                                width: rect.width
                                            });
                                        }
                                        setIsTimezoneDropdownOpen((open) => !open);
                                    }}
                                    className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm text-yellow-400 font-bold cursor-pointer w-56 border border-yellow-500/20 hover:border-yellow-500/40 transition-colors"
                                >
                                    <img 
                                        src={`https://flagcdn.com/24x18/${userTimezone === 'Asia/Bangkok' ? 'th' : userTimezone === 'Europe/London' ? 'gb' : userTimezone === 'Asia/Shanghai' ? 'cn' : userTimezone === 'Asia/Seoul' ? 'kr' : 'tw'}.png`}
                                        alt="flag"
                                        className="w-6 h-4 object-cover rounded-sm"
                                    />
                                    <span className="flex-1 text-left">
                                        {userTimezone === 'Asia/Bangkok' && 'Thailand (GMT+7)'}
                                        {userTimezone === 'Europe/London' && 'UK (GMT+0)'}
                                        {userTimezone === 'Asia/Shanghai' && 'China (GMT+8)'}
                                        {userTimezone === 'Asia/Seoul' && 'Korea (GMT+9)'}
                                        {userTimezone === 'Asia/Taipei' && 'Taiwan (GMT+8)'}
                                    </span>
                                    <ChevronDown size={14} className={`text-yellow-500 transition-transform ${isTimezoneDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                
                                {/* Dropdown Options - Dark Frosted Glass */}
                                {isTimezoneDropdownOpen && createPortal(
                                    <div
                                        ref={timezoneDropdownRef}
                                        className="fixed bg-slate-900/90 backdrop-blur-3xl border border-white/20 rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.95)] z-[999999] overflow-hidden"
                                        style={{
                                            top: timezoneDropdownPos.top,
                                            left: timezoneDropdownPos.left,
                                            width: Math.max(256, timezoneDropdownPos.width)
                                        }}
                                    >
                                        {[
                                            { value: 'Asia/Bangkok', code: 'th', label: 'Thailand (GMT+7)' },
                                            { value: 'Europe/London', code: 'gb', label: 'United Kingdom (GMT+0)' },
                                            { value: 'Asia/Shanghai', code: 'cn', label: 'China (GMT+8)' },
                                            { value: 'Asia/Seoul', code: 'kr', label: 'South Korea (GMT+9)' },
                                            { value: 'Asia/Taipei', code: 'tw', label: 'Taiwan (GMT+8)' },
                                        ].map(tz => (
                                            <button
                                                key={tz.value}
                                                onClick={() => {
                                                    handleTimezoneChange({ target: { value: tz.value } });
                                                    setIsTimezoneDropdownOpen(false);
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors ${userTimezone === tz.value ? 'bg-yellow-500/20 text-yellow-300 font-bold' : 'text-white'}`}
                                            >
                                                <img src={`https://flagcdn.com/24x18/${tz.code}.png`} alt="flag" className="w-6 h-4 object-cover rounded-sm shadow-sm" />
                                                <span className="text-sm font-medium">{tz.label}</span>
                                            </button>
                                        ))}
                                    </div>,
                                    document.body
                                )}
                            </div>

                            <div className="w-[1px] h-6 bg-white/10"></div>

                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                                    <Clock size={16} className="text-green-400" />
                                </div>
                                <span suppressHydrationWarning className="font-mono font-bold text-lg text-white">
                                    {new Date().toLocaleTimeString('en-US', {
                                        timeZone: userTimezone,
                                        hour12: false,
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                    })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex flex-col gap-8">

                {/* SECTION 1 (TOP): Project List (Horizontal Grid) */}
                <div className="w-full">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                                <LayoutGrid size={20} className="text-white" />
                            </div>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-red-200">Your Projects</span>
                        </h2>
                        <div className="flex items-center gap-3">
                            {/* Extension Key Button */}
                            <button
                                onClick={handleGenerateKey}
                                disabled={isGeneratingKey}
                                className="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-600/30 to-amber-600/30 backdrop-blur-xl text-yellow-300 border border-yellow-500/40 hover:border-yellow-400/60 rounded-2xl transition-all duration-300 text-sm font-bold hover:scale-105 shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/0 via-yellow-500/10 to-yellow-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                {isGeneratingKey ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} className="group-hover:rotate-12 transition-transform duration-300" />}
                                <span className="relative">Extension Key</span>
                            </button>
                            {!isCreating ? (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white rounded-2xl transition-all duration-300 text-sm font-bold hover:scale-105 shadow-lg shadow-red-500/40 hover:shadow-red-500/60 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                    <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                                    <span className="relative">New Project</span>
                                    <span className="absolute inset-0 rounded-2xl bg-white/10 animate-pulse opacity-0 group-hover:opacity-100" />
                                </button>
                            ) : (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                    <input
                                        type="text"
                                        value={newProjectName}
                                        onChange={(e) => setNewProjectName(e.target.value)}
                                        placeholder="Project Name..."
                                        className="bg-black/40 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none w-48 transition-all"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                                    />
                                    <button
                                        onClick={handleCreateProject}
                                        disabled={isSaving}
                                        className="px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl hover:from-green-500 hover:to-green-400 text-sm font-bold shadow-lg shadow-green-500/20 hover:scale-105 transition-all"
                                    >
                                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : 'SAVE'}
                                    </button>
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        className="px-4 py-2.5 bg-white/10 text-slate-300 rounded-xl hover:bg-white/20 text-sm font-medium transition-all"
                                    >
                                        CANCEL
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Horizontal Scroll / Grid of Projects */}
                    {projects.length === 0 && !isCreating ? (
                        <div className="bg-white/5 border border-white/10 border-dashed rounded-xl p-8 text-center text-gray-500">
                            No projects yet. Create one to get started.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* --- NEW PROJECT CARD (Animated Border Beam) --- */}
                            {!isCreating && (
                                <div
                                    onClick={() => setIsCreating(true)}
                                    className="relative group h-full min-h-[180px] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]"
                                >
                                    {/* Animated Border Gradient (Behind) */}
                                    <div className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_90deg,#22c55e_180deg,transparent_360deg)] animate-spin opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"></div>

                                    {/* Inner Mask (Foreground) - Solid to block center */}
                                    <div className="absolute inset-[2px] bg-gray-950 rounded-xl z-10 flex flex-col items-center justify-center transition-colors">

                                        {/* SCALING CONTENT CONTAINER */}
                                        <div className="flex flex-col items-center justify-center transition-transform duration-300 group-hover:scale-110">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-green-500/20 transition-colors duration-300">
                                                <Plus size={32} className="text-gray-600 group-hover:text-green-400 transition-all duration-300" />
                                            </div>
                                            <h3 className="text-gray-500 font-medium mt-2 group-hover:text-green-100 transition-colors duration-300">New Project</h3>
                                        </div>

                                    </div>
                                </div>
                            )}
                            {projects.map(project => {
                                const isSelected = selectedProject?.id === project.id;
                                const isEditing = editingProjectId === project.id;
                                const isRunning = project.status === 'running';

                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => !isEditing && setSelectedProject(project)}
                                        className={twMerge(
                                            "flex flex-col items-start p-5 rounded-xl border transition-all relative text-left group cursor-pointer",
                                            isRunning
                                                ? "bg-green-500/10 border-green-500/50 shadow-[0_0_20px_rgba(74,222,128,0.3)]" // RUNNING (Soft Green Glowing Glass)
                                                : "bg-red-500/10 border-red-500/20 hover:bg-red-500/20" // STOPPED (Soft Red Glass)
                                        )}
                                    >
                                        {(() => {
                                            // Match associated mode logic
                                            const associatedMode = modes.find(m =>
                                                m.id === project.executionModeId ||
                                                m.name === project.executionMode
                                            );

                                            // Priority: project.coverImage > modeImageUrl
                                            const imageUrl = project.coverImage || associatedMode?.coverImage;
                                            const isUploading = uploadingProjectId === project.id;

                                            return (
                                                <div className={twMerge(
                                                    "mb-3 rounded-lg overflow-hidden w-full relative group/media",
                                                    imageUrl ? "h-32 p-0" : "p-3 bg-white/5 flex justify-between items-start"
                                                )}>

                                                    {imageUrl ? (
                                                        <>
                                                            <div className="absolute inset-0 bg-black/20 group-hover/media:bg-black/0 transition-colors z-10" />
                                                            <img
                                                                src={imageUrl}
                                                                alt={project.name}
                                                                className="w-full h-full object-cover transform group-hover/media:scale-105 transition-transform duration-500"
                                                            />
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60" />
                                                        </>
                                                    ) : (
                                                        <div className={twMerge(
                                                            "flex justify-between items-start w-full transition-colors",
                                                            isSelected ? "text-green-400" : "text-gray-400 group-hover:text-white"
                                                        )}>
                                                            <Folder size={24} />
                                                        </div>
                                                    )}

                                                    {/* Action Buttons - Hover */}
                                                    {!isEditing && (
                                                        <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                            {/* Upload Image Button */}
                                                            <label
                                                                className="p-1.5 bg-black/50 hover:bg-black/70 rounded-full cursor-pointer text-white backdrop-blur-sm"
                                                                title="Change Image"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {isUploading ? (
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                ) : (
                                                                    <Camera size={12} />
                                                                )}
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    className="hidden"
                                                                    onChange={(e) => handleImageUpload(e, project.id)}
                                                                    disabled={isUploading}
                                                                />
                                                            </label>
                                                            {/* Rename Button */}
                                                            <button
                                                                onClick={(e) => handleStartEdit(e, project)}
                                                                className="p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-sm"
                                                                title="Rename Project"
                                                            >
                                                                <Pencil size={12} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {
                                            isEditing ? (
                                                <div className="w-full flex items-center gap-1 mb-1 animate-in fade-in">
                                                    <input
                                                        type="text"
                                                        value={editNameValue}
                                                        onChange={(e) => setEditNameValue(e.target.value)}
                                                        onClick={(e) => e.stopPropagation()} // Prevent card select
                                                        className="bg-black/50 border border-blue-500 rounded px-2 py-1 text-white text-sm font-bold outline-none w-full min-w-0"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveEdit(e, project.id);
                                                            if (e.key === 'Escape') handleCancelEdit(e);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={(e) => handleSaveEdit(e, project.id)}
                                                        className="p-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                                                    >
                                                        <Check size={14} />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <h3 className={twMerge(
                                                    "font-bold text-lg mb-1 truncate w-full",
                                                    isSelected ? "text-white" : "text-gray-200"
                                                )}>
                                                    {project.name}
                                                </h3>
                                            )
                                        }

                                        <div className="text-xs text-gray-500">
                                            {project.createdAt?.seconds ? new Date(project.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}
                                        </div>

                                        {
                                            isSelected && !isEditing && (
                                                <div className="absolute top-4 right-4 animate-in fade-in zoom-in pointer-events-none">
                                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
                                                </div>
                                            )
                                        }
                                        <div className={twMerge(
                                            "absolute bottom-3 right-3 z-20 transition-all duration-300",
                                            isRunning
                                                ? "opacity-100" // Always visible if running
                                                : "opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0" // Hover reveal if idle
                                        )}>
                                            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg p-1 shadow-lg hover:scale-105 transition-transform">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRun(project);
                                                    }}
                                                    className={twMerge(
                                                        "font-bold px-4 py-1.5 rounded transition-all duration-300 text-xs tracking-wider uppercase",
                                                        // Conditional Styles
                                                        isRunning
                                                            ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" // STOP State (More alarming)
                                                            : "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]" // RUN State (More inviting)
                                                    )}
                                                >
                                                    {isRunning ? 'STOP' : 'RUN'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* SECTION 2 (BOTTOM): Time Slot Picker - CONDITIONAL */}
                <div className="w-full relative transition-all duration-500">
                    {selectedProject ? (
                        <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">

                            {/* --- PROJECT NAVIGATION BAR --- */}
                            <div className="flex items-center gap-2 mb-6 p-1.5 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 w-fit">
                                <button
                                    onClick={() => setActiveTab('monitor')}
                                    className={`group relative px-5 py-3 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm font-bold overflow-hidden ${activeTab === 'monitor'
                                        ? 'bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 text-white shadow-xl shadow-purple-500/40 scale-105'
                                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                    <LayoutGrid size={16} className={`relative z-10 transition-all duration-300 ${activeTab === 'monitor' ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
                                    <span className="relative z-10">Dashboard</span>
                                    {activeTab === 'monitor' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`group relative px-5 py-3 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm font-bold overflow-hidden ${activeTab === 'history'
                                        ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white shadow-xl shadow-blue-500/40 scale-105'
                                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                    <List size={16} className={`relative z-10 transition-all duration-300 ${activeTab === 'history' ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
                                    <span className="relative z-10">Execution History</span>
                                    {activeTab === 'history' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                                </button>
                                <button
                                    onClick={() => setActiveTab('queue')}
                                    className={`group relative px-5 py-3 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm font-bold overflow-hidden ${activeTab === 'queue'
                                        ? 'bg-gradient-to-r from-yellow-600 via-yellow-500 to-orange-500 text-white shadow-xl shadow-yellow-500/40 scale-105'
                                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                    <Layers size={16} className={`relative z-10 transition-all duration-300 ${activeTab === 'queue' ? 'animate-bounce' : 'group-hover:rotate-12'}`} />
                                    <span className="relative z-10">Content Queue</span>
                                    {activeTab === 'queue' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                                </button>
                            </div>



                            {/* --- TAB CONTENT: DASHBOARD --- */}
                            {activeTab === 'monitor' && (
                                <div className="animate-in fade-in slide-in-from-left-4">
                                    <div className="flex items-center gap-2 mb-6 text-green-400 text-sm font-bold uppercase tracking-wider pl-1">
                                        <ArrowRight size={16} /> Editing Schedule: <span className="text-white">{selectedProject.name}</span>
                                    </div>

                                    {/* --- NEW: EXECUTION CONTROL PANEL --- */}
                                    <div className="bg-gray-900/50 p-6 rounded-xl border border-white/10 mb-8 backdrop-blur-sm shadow-xl relative overflow-hidden">
                                        {/* Decor */}
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                                        <div className="flex flex-col gap-4 relative z-10">

                                            {/* MODE BOX - Contains Selector + Info */}
                                            <div className="w-full bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
                                                {/* Mode Selector */}
                                                <div className="mb-4">
                                                    <label className="text-xs text-purple-300 uppercase font-bold mb-2 flex items-center gap-2">
                                                        <Layers size={14} /> Select Execution Mode
                                                    </label>
                                                    <div className="glass-dropdown-wrapper w-full">
                                                        <select
                                                            value={selectedModeId}
                                                            onChange={async (e) => {
                                                                const newModeId = e.target.value;
                                                                setSelectedModeId(newModeId);

                                                                // OPTIMISTIC UPDATE: Update Firestore Immediately
                                                                if (selectedProject && newModeId) {
                                                                    const modeObj = modes.find(m => m.id === newModeId);
                                                                    if (modeObj) {
                                                                        try {
                                                                            const projectRef = doc(db, 'users', currentUser.uid, 'projects', selectedProject.id);
                                                                            await updateDoc(projectRef, {
                                                                                executionMode: modeObj.name,
                                                                                executionModeId: modeObj.id
                                                                            });
                                                                            console.log("Optimistic Update: Mode set to", modeObj.name);
                                                                        } catch (err) {
                                                                            console.error("Error updating mode:", err);
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                            className="glass-dropdown w-full"
                                                        >
                                                            {modes.length === 0 && <option value="" className="bg-slate-900 text-white">No modes found</option>}
                                                            {modes.map(m => (
                                                                <option key={m.id} value={m.id} className="bg-slate-900 text-white">{m.name}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" size={16} />
                                                    </div>
                                                </div>

                                                {/* Mode Info - Show when selected */}
                                                {selectedModeId && (() => {
                                                    const selectedModeData = modes.find(m => m.id === selectedModeId);
                                                    
                                                    // Always show Mode Info section
                                                    const totalScenes = selectedModeData 
                                                        ? (selectedModeData.blocks || []).reduce((acc, block) => acc + (block.evolution?.length || 0), 0)
                                                        : 0;
                                                    
                                                    return (
                                                        <div className="flex items-start justify-between gap-4 pt-4 border-t border-purple-500/20">
                                                            {/* Left: Info */}
                                                            <div className="flex-1">
                                                                <label className="text-xs text-purple-300/70 uppercase font-bold mb-2 flex items-center gap-2">
                                                                    <Layers size={12} /> Mode Info
                                                                </label>
                                                                {/* คำอธิบายภาษาบ้านๆ */}
                                                                <p className="text-sm text-white/80 mb-3 leading-relaxed">
                                                                    🎯 <strong>Mode</strong> = "สูตรสำเร็จ" ในการสร้างวิดีโอ กำหนดว่าวิดีโอจะมีกี่ฉาก เล่าเรื่องแบบไหน ใช้ตัวละครอะไร
                                                                </p>
                                                                {selectedModeData ? (
                                                                    <>
                                                                        {selectedModeData.description && (
                                                                            <p className="text-sm text-white/60 mb-3 italic border-l-2 border-purple-500/30 pl-3">{selectedModeData.description}</p>
                                                                        )}
                                                                        <div className="flex flex-wrap gap-2">
                                                                            <span className="px-2 py-1 rounded-lg text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30" title="จำนวนตอนหลัก">
                                                                                📽️ {(selectedModeData.blocks || []).length} ตอน
                                                                            </span>
                                                                            <span className="px-2 py-1 rounded-lg text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30" title="จำนวนฉากทั้งหมด">
                                                                                🎬 {totalScenes} ฉาก
                                                                            </span>
                                                                            {selectedModeData.storyOverview?.tone && (
                                                                                <span className="px-2 py-1 rounded-lg text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30" title="อารมณ์ของเรื่อง">
                                                                                    🎭 {selectedModeData.storyOverview.tone}
                                                                                </span>
                                                                            )}
                                                                            {(selectedModeData.characters || []).length > 0 && (
                                                                                <span className="px-2 py-1 rounded-lg text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30" title="ตัวละครที่ใช้">
                                                                                    👥 {selectedModeData.characters.length} ตัวละคร
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <p className="text-yellow-400 text-sm">⏳ กำลังโหลดข้อมูล Mode... (ID: {selectedModeId})</p>
                                                                )}
                                                            </div>
                                                            {/* Right: Thumbnail */}
                                                            {selectedModeData?.coverImage && (
                                                                <div className="w-40 h-40 rounded-lg overflow-hidden border border-purple-500/30 shrink-0">
                                                                    <img src={selectedModeData.coverImage} alt={selectedModeData.name} className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* EXPANDER BOX - Contains Selector + Blocks */}
                                            <div className="w-full bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                                                {/* Expander Selector */}
                                                <div className="mb-4">
                                                    <label className="text-xs text-yellow-300 uppercase font-bold mb-2 flex items-center gap-2">
                                                        <Sparkles size={14} /> Select Expander
                                                    </label>
                                                    <div className="glass-dropdown-wrapper w-full">
                                                        <select
                                                            value={selectedExpanderId}
                                                            onChange={async (e) => {
                                                                const newExpanderId = e.target.value;
                                                                setSelectedExpanderId(newExpanderId);

                                                                // Save to Firestore
                                                                if (selectedProject && currentUser) {
                                                                    try {
                                                                        const projectRef = doc(db, 'users', currentUser.uid, 'projects', selectedProject.id);
                                                                        const expanderObj = expanders.find(ex => ex.id === newExpanderId);
                                                                        await updateDoc(projectRef, {
                                                                            expanderId: newExpanderId,
                                                                            expanderName: expanderObj?.name || ''
                                                                        });
                                                                        console.log("Expander set to:", expanderObj?.name);
                                                                    } catch (err) {
                                                                        console.error("Error updating expander:", err);
                                                                    }
                                                                }
                                                            }}
                                                            className="glass-dropdown w-full"
                                                        >
                                                            <option value="" className="bg-slate-900 text-white">ไม่ใช้ Expander</option>
                                                            {expanders.map(ex => (
                                                                <option key={ex.id} value={ex.id} className="bg-slate-900 text-white">{ex.name}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" size={16} />
                                                    </div>
                                                </div>

                                                {/* Expander Blocks - Show when selected */}
                                                {selectedExpanderId && (() => {
                                                    const selectedExpander = expanders.find(ex => ex.id === selectedExpanderId);
                                                    if (!selectedExpander || !selectedExpander.blocks || selectedExpander.blocks.length === 0) return null;
                                                    return (
                                                        <div className="flex items-start justify-between gap-4 pt-4 border-t border-yellow-500/20">
                                                            {/* Left: Blocks */}
                                                            <div className="flex-1">
                                                                <label className="text-xs text-yellow-300/70 uppercase font-bold mb-2 flex items-center gap-2">
                                                                    <Sparkles size={12} /> Expander Blocks ({selectedExpander.blocks.length})
                                                                </label>
                                                                {/* คำอธิบายภาษาบ้านๆ */}
                                                                <p className="text-sm text-white/80 mb-3 leading-relaxed">
                                                                    ✨ <strong>Expander</strong> = "เครื่องปรุง" ที่เพิ่มรสชาติให้วิดีโอ เช่น มุมกล้องพิเศษ เอฟเฟกต์เสียง หรือสไตล์ภาพเฉพาะตัว
                                                                </p>
                                                                {selectedExpander.description && (
                                                                    <p className="text-sm text-white/60 mb-3 italic border-l-2 border-yellow-500/30 pl-3">{selectedExpander.description}</p>
                                                                )}
                                                                <div className="flex flex-wrap gap-2 mb-3">
                                                                    {selectedExpander.blocks.map((block, idx) => (
                                                                        <div
                                                                            key={idx}
                                                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${block.color || 'bg-yellow-500/20'} border-yellow-500/30 text-yellow-200 flex items-center gap-1.5`}
                                                                            title={block.description || block.name}
                                                                        >
                                                                            <span>{block.name}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <p className="text-xs text-yellow-400/60">
                                                                    💡 AI จะใส่ "เครื่องปรุง" เหล่านี้ลงใน Prompt อัตโนมัติ ทำให้วิดีโอมีสไตล์เป็นเอกลักษณ์
                                                                </p>
                                                            </div>
                                                            {/* Right: Thumbnail */}
                                                            {selectedExpander.thumbnail && (
                                                                <div className="w-40 h-40 rounded-lg overflow-hidden border border-yellow-500/30 shrink-0">
                                                                    <img src={selectedExpander.thumbnail} alt={selectedExpander.name} className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* BOTTOM ROW: Variables & Buttons - Grid Layout */}
                                            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">

                                                {/* Dynamic Variable Inputs */}
                                                {selectedMode && selectedMode.variables && selectedMode.variables.map((variable, idx) => (
                                                    <div key={idx} className="w-full">
                                                        <label className="text-xs text-blue-300 uppercase font-bold mb-2 flex items-center gap-2">
                                                            <AlignLeft size={14} /> {variable.name || `Input ${idx + 1}`}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={formValues[variable.name] || ''}
                                                            onChange={(e) => {
                                                                const newVal = e.target.value;
                                                                setFormValues(prev => {
                                                                    const updated = { ...prev, [variable.name]: newVal };

                                                                    // DEBOUNCED AUTO-SAVE
                                                                    if (currentUser && selectedProject) {
                                                                        clearTimeout(window[`save_timers_${variable.name}`]);
                                                                        window[`save_timers_${variable.name}`] = setTimeout(async () => {
                                                                            console.log(`💾 Auto-saving input: ${variable.name}`);
                                                                            const projectRef = doc(db, 'users', currentUser.uid, 'projects', selectedProject.id);
                                                                            await setDoc(projectRef, {
                                                                                variableValues: updated,
                                                                                lastUpdated: serverTimestamp()
                                                                            }, { merge: true });
                                                                        }, 1000);
                                                                    }
                                                                    return updated;
                                                                });
                                                            }}
                                                            placeholder={`Enter ${variable.name}...`}
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder-white/20"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* EXECUTION MONITOR (Only when RUNNING) */}
                                        {selectedProject.status === 'running' && (
                                            <div className="mt-8 border-t border-white/10 pt-8 animate-in fade-in slide-in-from-top-4">

                                                {/* COMPACT MONITOR HEADER */}
                                                <div className="flex flex-col lg:flex-row items-stretch gap-4 mb-4 h-full min-h-[180px]">

                                                    {/* 1. Status Indicators (Left - Vertical Stack - Fixed Width) */}
                                                    <div className="flex flex-col justify-between shrink-0 w-full lg:w-[480px] gap-2">

                                                        {/* Engine Active Button */}
                                                        <div className="bg-green-500/10 border border-green-500/20 px-4 py-3 rounded-lg flex items-center justify-center lg:justify-start gap-3 w-full h-[50px]">
                                                            <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,1)]"></div>
                                                            <span className="text-green-400 font-bold uppercase tracking-widest text-sm">Engine Active</span>
                                                        </div>

                                                        {/* Next Run Time */}
                                                        <div className="flex items-center justify-center lg:justify-start gap-2 text-gray-400 text-sm font-mono bg-white/5 px-4 py-2 rounded-lg border border-white/5 w-full h-[50px]">
                                                            <Clock size={14} className="text-gray-500" />
                                                            <span className="text-gray-500">Next Run:</span>
                                                            <span className="text-white font-bold ml-1">
                                                                {nextRunCountdown || "Calculating..."}
                                                            </span>
                                                        </div>

                                                        {/* Filter Controls & Actions */}
                                                        <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 w-full gap-1 h-[50px] items-center">

                                                            {['ALL', 'TIKTOK', 'FACEBOOK', 'YOUTUBE'].map(filter => (
                                                                <button
                                                                    key={filter}
                                                                    onClick={() => setActiveFilter(filter)}
                                                                    className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all h-full ${activeFilter === filter
                                                                        ? 'bg-white/10 text-white shadow-sm border border-white/10'
                                                                        : 'text-gray-600 hover:text-gray-400'
                                                                        }`}
                                                                >
                                                                    {filter}
                                                                </button>
                                                            ))}

                                                            {/* Separator */}
                                                            <div className="w-[1px] h-6 bg-white/10 mx-1"></div>

                                                            {/* Clear Button (Themed) */}
                                                            <button
                                                                onClick={handleClearLogs}
                                                                title="Clear Logs"
                                                                className="px-3 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all h-full flex items-center gap-1.5 shrink-0"
                                                            >
                                                                <Trash2 size={14} />
                                                                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Clear</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* 2. Mini Console (Right - Expands) */}
                                                    <div className="flex-1 bg-[#0c0c0c] rounded-lg border border-white/10 shadow-inner overflow-hidden flex flex-col relative h-auto min-h-[160px]">
                                                        {/* Activity Dot Overlay */}
                                                        <div className="absolute top-2 right-2 flex gap-1.5 opacity-50">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500/40"></div>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/40"></div>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500/40"></div>
                                                        </div>

                                                        {/* Mini Logs (Last 5 Only) */}
                                                        {/* Mini Logs (Last 5 Only) */}
                                                        <div className="flex-1 p-3 font-mono text-[11px] overflow-hidden flex flex-col justify-end">
                                                            {isLoadingLogs ? (
                                                                <div className="flex items-center gap-2 text-gray-700 animate-pulse">
                                                                    <Loader2 size={14} className="animate-spin" /> Connecting to console...
                                                                </div>
                                                            ) : mockLogs.length === 0 ? (
                                                                <div className="text-gray-800 italic ml-2">
                                                                    Waiting for system logs...
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    {mockLogs
                                                                        .filter(log => activeFilter === 'ALL' || log.platform === activeFilter)
                                                                        .slice(0, 5) // SHOW ONLY 5 RECENT LOGS
                                                                        .map((log) => (
                                                                            <div key={log.id} className="flex items-center gap-2 text-gray-400">
                                                                                <span className="text-red-500 font-bold font-mono text-[10px] whitespace-nowrap">
                                                                                    [{log.timestamp}]
                                                                                </span>
                                                                                {log.platform !== 'SYSTEM' && (
                                                                                    <span className={`text-[10px] font-bold px-1 rounded uppercase tracking-wider ${log.platform === 'TIKTOK' ? 'text-pink-500 bg-pink-500/10' :
                                                                                        log.platform === 'FACEBOOK' ? 'text-blue-500 bg-blue-500/10' :
                                                                                            'text-red-500 bg-red-500/10'
                                                                                        }`}>
                                                                                        {log.platform}
                                                                                    </span>
                                                                                )}
                                                                                <span className="truncate text-gray-300">{log.message}</span>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        )}

                                    </div>

                                    {/* Pass modeScenes to TimeSlotPicker - locks Scenes input to Mode's scene count */}
                                    {(() => {
                                        const selectedModeData = modes.find(m => m.id === selectedModeId);
                                        const modeScenes = selectedModeData 
                                            ? (selectedModeData.blocks || []).reduce((acc, block) => acc + (block.evolution?.length || 0), 0)
                                            : null;
                                        return <TimeSlotPicker projectId={selectedProject.id} modeScenes={modeScenes} key={`${selectedProject.id}-${modeScenes}`} />;
                                    })()}

                                    {/* ========================================== */}
                                    {/* TEST PROMPT PIPELINE SECTION */}
                                    {/* ========================================== */}
                                    <div className="mt-8 bg-gradient-to-br from-purple-900/20 via-slate-900/40 to-indigo-900/20 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-6 shadow-xl">
                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                                    <FlaskConical size={20} className="text-white" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold text-white">Test Prompt Pipeline</h3>
                                                    <p className="text-xs text-purple-300/60">ทดสอบสร้าง Prompts จาก Mode + Expander ก่อนใช้งานจริง</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleTestPromptPipeline}
                                                disabled={isTestingPrompt || !selectedModeId}
                                                className={`group relative flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 overflow-hidden ${
                                                    !selectedModeId 
                                                        ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                                                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:scale-105 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50'
                                                }`}
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                                {isTestingPrompt ? (
                                                    <>
                                                        <Loader2 size={18} className="animate-spin" />
                                                        <span>Generating...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play size={18} />
                                                        <span>Generate Test</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {/* No Mode Selected Warning */}
                                        {!selectedModeId && (
                                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                                                <p className="text-yellow-400 text-sm">⚠️ กรุณาเลือก Mode ก่อนทดสอบ</p>
                                            </div>
                                        )}

                                        {/* Test Result Display */}
                                        {testResult && (
                                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                                {/* Success Header */}
                                                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                                                    <div className="flex items-center gap-3">
                                                        <CheckCircle size={24} className="text-green-400" />
                                                        <div>
                                                            <p className="text-green-400 font-bold">✅ สร้าง {testResult.prompts?.length || 0} Prompts สำเร็จ!</p>
                                                            <p className="text-green-300/60 text-xs">Mode: {testResult.modeInfo?.name || testResult.modeName} | Scenes: {testResult.modeInfo?.sceneCount || testResult.sceneCount}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={handleCopyAllPrompts}
                                                            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/30 transition-all text-sm font-bold"
                                                        >
                                                            {copiedIndex === 'all' ? <CheckCircle size={16} /> : <Copy size={16} />}
                                                            {copiedIndex === 'all' ? 'Copied!' : 'Copy All'}
                                                        </button>
                                                        <button
                                                            onClick={() => setTestResult(null)}
                                                            className="flex items-center gap-1 px-3 py-2 bg-white/5 border border-white/10 text-white/60 rounded-lg hover:bg-white/10 hover:text-white transition-all text-sm"
                                                            title="ปิดผลลัพธ์"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Prompts List */}
                                                <div className="space-y-3">
                                                    <h4 className="text-sm font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                                                        <FileText size={14} /> Generated Prompts
                                                    </h4>
                                                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                                        {testResult.prompts?.map((prompt, idx) => (
                                                            <div key={idx} className="group bg-black/40 border border-white/10 rounded-xl p-4 hover:border-purple-500/30 transition-all">
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs font-bold rounded">Scene {idx + 1}</span>
                                                                            {prompt.audioDescription && (
                                                                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">🔊 Audio</span>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-white/80 text-sm leading-relaxed">{prompt.englishPrompt}</p>
                                                                        {prompt.audioDescription && (
                                                                            <p className="text-blue-300/60 text-xs mt-2">🎵 {prompt.audioDescription}</p>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleCopyPrompt(prompt.englishPrompt, idx)}
                                                                        className="shrink-0 p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-purple-500/20 hover:border-purple-500/30 transition-all opacity-0 group-hover:opacity-100"
                                                                        title="Copy Prompt"
                                                                    >
                                                                        {copiedIndex === idx ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} className="text-white/60" />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Titles & Tags Section */}
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                    {/* Titles */}
                                                    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                                                        <h4 className="text-sm font-bold text-orange-300 uppercase tracking-wider flex items-center gap-2 mb-3">
                                                            <FileText size={14} /> Titles
                                                        </h4>
                                                        <div className="space-y-2">
                                                            {testResult.titles && Object.entries(testResult.titles).map(([platform, title]) => (
                                                                <div key={platform} className="flex items-center justify-between gap-2 bg-white/5 rounded-lg p-2">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                                                                            platform === 'tiktok' ? 'bg-pink-500/20 text-pink-300' :
                                                                            platform === 'facebook' ? 'bg-blue-500/20 text-blue-300' :
                                                                            platform === 'instagram' ? 'bg-purple-500/20 text-purple-300' :
                                                                            'bg-red-500/20 text-red-300'
                                                                        }`}>{platform}</span>
                                                                        <span className="text-white/70 text-xs truncate">{title}</span>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleCopyPrompt(title, `title-${platform}`)}
                                                                        className="p-1.5 hover:bg-white/10 rounded transition-all"
                                                                    >
                                                                        {copiedIndex === `title-${platform}` ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} className="text-white/40" />}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Tags */}
                                                    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
                                                        <h4 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2 mb-3">
                                                            <Hash size={14} /> Tags
                                                        </h4>
                                                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                            {testResult.tags && Object.entries(testResult.tags).map(([platform, tags]) => (
                                                                <div key={platform} className="bg-white/5 rounded-lg p-2">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                                                                            platform === 'tiktok' ? 'bg-pink-500/20 text-pink-300' :
                                                                            platform === 'facebook' ? 'bg-blue-500/20 text-blue-300' :
                                                                            platform === 'instagram' ? 'bg-purple-500/20 text-purple-300' :
                                                                            'bg-red-500/20 text-red-300'
                                                                        }`}>{platform} ({tags?.length || 0})</span>
                                                                        <button
                                                                            onClick={() => handleCopyPrompt(tags?.map(t => `#${t}`).join(' ') || '', `tags-${platform}`)}
                                                                            className="p-1 hover:bg-white/10 rounded transition-all"
                                                                        >
                                                                            {copiedIndex === `tags-${platform}` ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} className="text-white/40" />}
                                                                        </button>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {tags?.slice(0, 10).map((tag, i) => (
                                                                            <span key={i} className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300/70 text-[10px] rounded">#{tag}</span>
                                                                        ))}
                                                                        {tags?.length > 10 && (
                                                                            <span className="px-1.5 py-0.5 text-white/40 text-[10px]">+{tags.length - 10} more</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Previous Test Info (from Firestore) - Clickable to load */}
                                        {selectedProject.lastPromptTest && !testResult && (
                                            <div 
                                                onClick={() => setTestResult(selectedProject.lastPromptTest)}
                                                className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 hover:border-purple-500/30 transition-all group"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                                                        <Clock size={14} />
                                                        <span>Last Test: {selectedProject.lastPromptTest.testedAt?.toDate?.()?.toLocaleString() || 'Unknown'}</span>
                                                        <span className="text-purple-400">({selectedProject.lastPromptTest.sceneCount} scenes)</span>
                                                    </div>
                                                    <span className="text-purple-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                                        👆 คลิกเพื่อดูผลลัพธ์
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* --- TAB CONTENT: EXECUTION HISTORY (PERMANENT) --- */}
                            {activeTab === 'history' && (
                                <div className="animate-in fade-in slide-in-from-right-4 min-h-[500px]">
                                    <div className="bg-gray-900/50 p-6 rounded-xl border border-white/10 backdrop-blur-sm shadow-xl h-full">
                                        <div className="flex items-center gap-2 mb-6 text-blue-400 text-sm font-bold uppercase tracking-wider">
                                            <List size={16} /> Automation Logs & History
                                        </div>
                                        <div className="h-[600px]">
                                            <ProjectHistory projectId={selectedProject.id} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- TAB CONTENT: CONTENT QUEUE --- */}
                            {activeTab === 'queue' && (
                                <div className="animate-in fade-in slide-in-from-right-4 min-h-[500px]">
                                    <ContentQueue projectId={selectedProject.id} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="min-h-[400px] bg-black/20 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-center p-8">
                            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <LayoutGrid size={40} className="text-white/20" />
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">Select a Project</h3>
                            <p className="text-gray-400 max-w-md">
                                Please select or create a project from the list above to manage its automation schedule.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            {/* --- KEY DISPLAY MODAL (Global) --- */}
            {generatedKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">🔑 Extension Key Generated</h3>
                        <p className="text-gray-400 text-sm mb-4">Copy this key and paste it in your Extension. It will only be shown once!</p>
                        <div className="bg-black/60 border border-white/10 rounded-lg p-4 font-mono text-xs text-green-400 break-all select-all mb-4">{generatedKey}</div>
                        <div className="flex gap-3">
                            <button onClick={() => { navigator.clipboard.writeText(generatedKey); alert('Key copied!'); }} className="flex-1 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/30 font-bold text-sm">📋 Copy</button>
                            <button onClick={() => setGeneratedKey(null)} className="px-4 py-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 font-bold text-sm">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
