import { useState, useEffect, useRef } from 'react';
import { Settings, Save, Play, Layers, Box, Type, Plus, Trash2, Pencil, Film, Mic, Camera, ChevronDown, ChevronUp, GripVertical, Loader2, ChevronsDownUp, Sparkles, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Pause, Copy, Check, Eye, Search } from 'lucide-react';
import CinematicStep from '../components/CinematicStep';
import ModeConsultant from '../components/ModeConsultant';
import GlassDropdown from '../components/ui/GlassDropdown';
import { db, auth, storage, functions } from '../firebase';
import { doc, getDoc, setDoc, addDoc, deleteDoc, collection, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';

const ModeCreator = () => {
    // A. The Data Structure (State)
    const [modeData, setModeData] = useState({
        name: "Mode Template",
        category: "Cinematic / Movie",
        description: "",
        coverImage: "",
        systemInstruction: "", // The "Brain" of the AI
        
        // NEW: Story Overview
        storyOverview: {
            synopsis: "", // เนื้อเรื่องย่อ
            theme: "", // แก่นเรื่อง (e.g., "การต่อสู้เพื่ออิสรภาพ")
            tone: "epic", // บรรยากาศ: epic, dark, romantic, comedy, horror
            totalDuration: "3-5 min" // ความยาวโดยประมาณ
        },
        
        characters: [], // { id, name, description, voiceStyle, visualDescription, role }
        blocks: [
            {
                id: 1,
                type: 'dynamic_evolution',
                title: 'Cinematic Sequence A',
                isExpanded: true,
                evolution: [
                    {
                        id: 101,
                        rawPrompt: "",
                        stepPercentage: 100,
                        isExpanded: true
                    }
                ]
            }
        ] // Sequence of scenes
    });

    // Persistence State
    const [isLoading, setIsLoading] = useState(true); // GUARD: Start as Loading
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false); // NEW: Upload Loading State
    const [currentUser, setCurrentUser] = useState(null);
    const isRemoteUpdate = useRef(false);

    const [allModes, setAllModes] = useState([]);
    const [selectedLibraryId, setSelectedLibraryId] = useState(null); // Visual selection only
    const [isEditorActive, setIsEditorActive] = useState(true); // Helper to disable form
    const [activeTab, setActiveTab] = useState('library'); // 'library' or 'editor'
    const [isTesting, setIsTesting] = useState(false);
    const [testLogs, setTestLogs] = useState([]);
    const [activeLineIndex, setActiveLineIndex] = useState(-1);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // --- Character Library ---
    const [isCharacterLibraryOpen, setIsCharacterLibraryOpen] = useState(false);
    const [libraryCharacters, setLibraryCharacters] = useState([]);
    const [loadingLibrary, setLoadingLibrary] = useState(false);
    
    // --- Expander List for AI Scene Writer ---
    const [expanderList, setExpanderList] = useState([]);
    const [libSearchQuery, setLibSearchQuery] = useState('');
    const [libRoleFilter, setLibRoleFilter] = useState('all');
    const [libTagFilter, setLibTagFilter] = useState('');
    const [previewingCharacter, setPreviewingCharacter] = useState(null);

    // --- History System (Undo/Redo) ---
    const historyRef = useRef({ past: [], future: [] });
    const lastStateRef = useRef(null); // Track last stable state
    const isUndoing = useRef(false);
    const audioRef = useRef(null); // Track active audio for Stop/Pause
    const [_, setHistoryTick] = useState(0); // Force re-render for button states

    // 1. Sync Baseline on Load
    useEffect(() => {
        // When docId changes (new mode loaded), reset history
        historyRef.current = { past: [], future: [] };
        lastStateRef.current = JSON.parse(JSON.stringify(modeData));
        setHistoryTick(0);
    }, [modeData.docId]);

    // 2. Track Changes (Debounced)
    useEffect(() => {
        if (isUndoing.current) {
            isUndoing.current = false;
            return;
        }

        const timer = setTimeout(() => {
            // Guard: If mode changed completely (load), ignore (handled by above effect)
            if (!lastStateRef.current) return;

            const currentString = JSON.stringify(modeData);
            const lastString = JSON.stringify(lastStateRef.current);

            if (currentString !== lastString) {
                // Push OLD state to past
                historyRef.current.past.push(lastStateRef.current);
                // Limit 50
                if (historyRef.current.past.length > 50) historyRef.current.past.shift();
                // Clear Future (New timeline)
                historyRef.current.future = [];
                // Update Last Stable
                lastStateRef.current = JSON.parse(currentString);
                setHistoryTick(t => t + 1);
                console.log("💾 Snapshot saved to History");
            }
        }, 800); // 800ms Debounce

        return () => clearTimeout(timer);
    }, [modeData]);

    const handleUndo = () => {
        if (historyRef.current.past.length === 0) return;
        const previous = historyRef.current.past.pop();

        // Push current to future
        historyRef.current.future.unshift(modeData);

        isUndoing.current = true;
        setModeData(previous);
        lastStateRef.current = previous;
        setHistoryTick(t => t + 1);
        console.log("↩️ Undo");
    };

    const handleRedo = () => {
        if (historyRef.current.future.length === 0) return;
        const next = historyRef.current.future.shift();

        // Push current to past
        historyRef.current.past.push(modeData);

        isUndoing.current = true;
        setModeData(next);
        lastStateRef.current = next;
        setHistoryTick(t => t + 1);
        console.log("↪️ Redo");
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            }
            // Redo: Ctrl+Y OR Ctrl+Shift+Z
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [modeData, handleUndo, handleRedo]); // Dependencies for closure safety

    // --- Simulation Console Logic ---
    const [isPaused, setIsPaused] = useState(false);
    const [clickFeedback, setClickFeedback] = useState(null); // 'copied'

    // 1. Typing Animation Effect
    useEffect(() => {
        if (!isTesting || isPaused) return;

        const interval = setInterval(() => {
            setActiveLineIndex(prev => {
                if (prev < testLogs.length - 1) return prev + 1;
                return prev;
            });
        }, 800); // 800ms per line speed

        return () => clearInterval(interval);
    }, [isTesting, isPaused, testLogs.length]);

    const handleTogglePause = () => {
        setIsPaused(!isPaused);
    };

    const handleCopyLogs = () => {
        const text = testLogs.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setClickFeedback('copied');
            setTimeout(() => setClickFeedback(null), 2000);
        });
    };
    const handleCloseConsole = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        console.log("🛑 Closing Console & Stopping Audio");

        // Stop Audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }

        setIsTesting(false);
        setActiveLineIndex(-1);
    };

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (user) {
                // A. Listen to the LIST of modes
                const modesQuery = query(collection(db, 'users', user.uid, 'modes'), orderBy('updatedAt', 'desc'));
                const unsubscribeModes = onSnapshot(modesQuery, (snapshot) => {
                    const modes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setAllModes(modes);
                    setIsLoading(false); // Fix: Stop loading immediately
                });

                // B. Listen to Expanders for AI Scene Writer
                const expandersRef = collection(db, 'users', user.uid, 'expanders');
                const unsubscribeExpanders = onSnapshot(expandersRef, (snapshot) => {
                    const loadedExpanders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setExpanderList(loadedExpanders);
                    console.log('[ModeCreator] Loaded expanders:', loadedExpanders.length);
                });

                return () => {
                    unsubscribeModes();
                    unsubscribeExpanders();
                };
            } else {
                setIsLoading(false);
                setExpanderList([]);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    const emptyModeState = {
        name: "",
        category: "Cinematic / Movie",
        description: "",
        coverImage: "",
        systemInstruction: "",
        variables: [],
        blocks: [],
        docId: null
    };

    // --- Mode Library Handlers ---
    const handleCreateNewMode = () => {
        setIsLoading(true);
        setSelectedLibraryId(null); // Deselect cards
        setIsEditorActive(true); // Enable Editor
        setActiveTab('editor'); // Switch to editor tab

        const defaultState = {
            name: "New Custom Mode",
            category: "Cinematic / Movie",
            description: "",
            coverImage: "",
            systemInstruction: "",

            variables: [],
            blocks: [
                {
                    id: Date.now(),
                    type: 'dynamic_evolution',
                    title: 'Checkpoints',
                    isExpanded: true,
                    evolution: [{
                        id: Date.now() + 1,
                        stepPercentage: 100,
                        isExpanded: true
                    }]
                }
            ],
            docId: null
        };
        setModeData(defaultState);
        setTimeout(() => setIsLoading(false), 300);
    };

    // Scenario A: Click Card Body (Preview only, but populate state for Test Run)
    const handleSelectMode = (mode) => {
        if (selectedLibraryId === mode.id) return; // No op

        setSelectedLibraryId(mode.id);
        setIsEditorActive(false); // Disable editing but show data
        // FIX: Do NOT empty the state! Populate it so "Test Run" can see it.
        setModeData({ ...mode, docId: mode.id });
    };

    // Scenario B: Click Pencil (Edit Mode)
    const handleLoadMode = (e, mode) => {
        console.log("✏️ Editing mode:", mode.id);
        e.stopPropagation(); // Prevent handleSelectMode
        setSelectedLibraryId(mode.id);

        setIsEditorActive(true); // Enable editing
        setActiveTab('editor'); // Switch to editor tab

        isRemoteUpdate.current = true;
        setModeData({ ...mode, docId: mode.id });
    };

    const handleDeleteMode = async (e, modeId) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this mode?")) return;

        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'modes', modeId));
            if (selectedLibraryId === modeId) {
                handleCreateNewMode(); // Reset if we deleted the selected one
            }
        } catch (err) {
            console.error("Error deleting mode:", err);
        }
    };

    // 2. Auto-Save (Write)
    useEffect(() => {
        // GUARD: Vital! Do not save if still loading or if update came from remote
        if (isLoading || isRemoteUpdate.current || !currentUser) {
            isRemoteUpdate.current = false;
            return;
        }

        // GUARD: Don't auto-save new drafts (waiting for user to click "Save Mode" to create doc)
        if (!modeData.docId) return;

        const saveMode = async () => {
            setIsSaving(true);
            try {
                const docRef = doc(db, 'users', currentUser.uid, 'modes', modeData.docId);
                await setDoc(docRef, { ...modeData, updatedAt: serverTimestamp() }, { merge: true });
            } catch (err) {
                console.error("Error auto-saving mode:", err);
            } finally {
                setTimeout(() => setIsSaving(false), 500);
            }
        };

        const timeout = setTimeout(saveMode, 2000); // 2s Debounce
        return () => clearTimeout(timeout);
    }, [modeData, isLoading, currentUser]);

    const CAMERA_ANGLES = [
        { value: 'wide', label: 'Wide Shot' },
        { value: 'close-up', label: 'Close Up' },
        { value: 'medium', label: 'Medium Shot' },
        { value: 'drone', label: 'Drone View' },
        { value: 'low-angle', label: 'Low Angle' },
    ];

    // --- NEW: Auto-Balancing Percentage Logic ---

    // Helper: Distribute percentages evenly
    const distributePercentages = (count) => {
        if (count === 0) return [];
        const split = Math.floor(100 / count);
        let remainder = 100 - (split * count);
        return Array(count).fill(split).map((val, i) => i < remainder ? val + 1 : val);
    };

    // Helper: Add a new generic block (With Auto-Balancing)
    const addBlock = () => {
        const currentBlocks = modeData.blocks;
        const newCount = currentBlocks.length + 1;
        const distribution = distributePercentages(newCount);

        // Update existing blocks with new % and create the new one
        const updatedBlocks = currentBlocks.map((b, i) => ({ ...b, sequencePercentage: distribution[i] }));

        const newBlock = {
            id: Date.now(),
            type: 'dynamic_evolution',
            title: `Cinematic Sequence ${newCount}`,
            isExpanded: true,
            sequencePercentage: distribution[newCount - 1], // Assign the last slice
            evolution: [{
                id: Date.now() + 1,
                stepPercentage: 100,
                isExpanded: true
            }]
        };

        setModeData({ ...modeData, blocks: [...updatedBlocks, newBlock] });
    };

    // Helper: Update Block Title (Unchanged)
    const updateBlockTitle = (blockId, newTitle) => {
        const updatedBlocks = modeData.blocks.map(block => {
            if (block.id === blockId) {
                return { ...block, title: newTitle };
            }
            return block;
        });
        setModeData({ ...modeData, blocks: updatedBlocks });
    };

    // Helper: Update Block Percentage (Manual correction)
    const updateBlockPercentage = (blockId, newPercentage) => {
        const updatedBlocks = modeData.blocks.map(block => {
            if (block.id === blockId) {
                return { ...block, sequencePercentage: newPercentage };
            }
            return block;
        });
        setModeData({ ...modeData, blocks: updatedBlocks });
    }


    // Helper: Delete a block (With Auto-Balancing)
    const deleteBlock = (blockId) => {
        const remainingBlocks = modeData.blocks.filter(block => block.id !== blockId);
        const newCount = remainingBlocks.length;

        if (newCount > 0) {
            const distribution = distributePercentages(newCount);
            const rebalancedBlocks = remainingBlocks.map((b, i) => ({ ...b, sequencePercentage: distribution[i] }));
            setModeData({ ...modeData, blocks: rebalancedBlocks });
        } else {
            setModeData({ ...modeData, blocks: [] });
        }
    };

    // Helper: Toggle Block Expansion
    const toggleBlock = (blockId) => {
        const updatedBlocks = modeData.blocks.map(block => {
            if (block.id === blockId) {
                return { ...block, isExpanded: !block.isExpanded };
            }
            return block;
        });
        setModeData({ ...modeData, blocks: updatedBlocks });
    };

    // Helper: Toggle ALL Blocks
    const toggleAllBlocks = () => {
        // Check if ANY are expanded. If so, collapse all. Else, expand all.
        const anyExpanded = modeData.blocks.some(b => b.isExpanded);
        const newState = !anyExpanded;

        const updatedBlocks = modeData.blocks.map(block => ({ ...block, isExpanded: newState }));
        setModeData({ ...modeData, blocks: updatedBlocks });
    };

    // Helper: Add a stage to a specific block (With Auto-Balancing)
    const addStage = (blockId) => {
        const updatedBlocks = modeData.blocks.map(block => {
            if (block.id === blockId) {
                const currentStages = block.evolution;
                const newCount = currentStages.length + 1;
                const distribution = distributePercentages(newCount);

                // Rebalance existing stages
                const rebalancedStages = currentStages.map((s, i) => ({ ...s, stepPercentage: distribution[i] }));

                const newStage = {
                    id: Date.now(),
                    rawPrompt: "",
                    audioInstruction: "",
                    cameraAngle: "wide",
                    isExpanded: true,
                    stepPercentage: distribution[newCount - 1]
                };
                return { ...block, evolution: [...rebalancedStages, newStage] };
            }
            return block;
        });

        setModeData({ ...modeData, blocks: updatedBlocks });
    };

    // Helper: Update stage fields (Including Percentage)
    const updateStage = (blockId, stageId, field, value) => {
        const updatedBlocks = modeData.blocks.map(block => {
            if (block.id === blockId) {
                const updatedEvolution = block.evolution.map(stage => {
                    if (stage.id === stageId) {
                        return { ...stage, [field]: value };
                    }
                    return stage;
                });
                return { ...block, evolution: updatedEvolution };
            }
            return block;
        });
        setModeData({ ...modeData, blocks: updatedBlocks });
    };

    // Helper: Toggle expand/collapse
    const toggleStage = (blockId, stageId) => {
        const updatedBlocks = modeData.blocks.map(block => {
            if (block.id === blockId) {
                const updatedEvolution = block.evolution.map(stage => {
                    if (stage.id === stageId) {
                        return { ...stage, isExpanded: !stage.isExpanded };
                    }
                    return stage;
                });
                return { ...block, evolution: updatedEvolution };
            }
            return block;
        });
        setModeData({ ...modeData, blocks: updatedBlocks });
    };

    // Helper: Delete stage (With Auto-Balancing)
    const deleteStage = (blockId, stageId) => {
        const updatedBlocks = modeData.blocks.map(block => {
            if (block.id === blockId) {
                const remainingStages = block.evolution.filter(s => s.id !== stageId);
                const newCount = remainingStages.length;

                if (newCount > 0) {
                    const distribution = distributePercentages(newCount);
                    const rebalancedStages = remainingStages.map((s, i) => ({ ...s, stepPercentage: distribution[i] }));
                    return { ...block, evolution: rebalancedStages };
                } else {
                    return { ...block, evolution: [] };
                }
            }
            return block;
        });
        setModeData({ ...modeData, blocks: updatedBlocks });
    };

    // --- NEW: Character Handlers ---
    const handleAddCharacter = () => {
        const newChar = {
            id: Date.now(),
            name: `ตัวละคร ${(modeData.characters?.length || 0) + 1}`,
            description: '',
            visualDescription: '', // รูปร่าง, เสื้อผ้า
            role: 'main', // main, villain, supporting
            voiceStyle: 'neutral'
        };
        setModeData({ ...modeData, characters: [...(modeData.characters || []), newChar] });
    };

    const handleUpdateCharacter = (id, field, value) => {
        const updatedChars = (modeData.characters || []).map(c =>
            c.id === id ? { ...c, [field]: value } : c
        );
        setModeData({ ...modeData, characters: updatedChars });
    };

    const handleDeleteCharacter = (id) => {
        setModeData({ ...modeData, characters: (modeData.characters || []).filter(c => c.id !== id) });
    };

    // --- Character Library Functions ---
    const openCharacterLibrary = async () => {
        if (!currentUser) return;
        setIsCharacterLibraryOpen(true);
        setLoadingLibrary(true);
        try {
            const q = query(
                collection(db, 'users', currentUser.uid, 'characters'),
                orderBy('createdAt', 'desc')
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const chars = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setLibraryCharacters(chars);
                setLoadingLibrary(false);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error('Error fetching characters:', error);
            setLoadingLibrary(false);
        }
    };

    const addCharacterFromLibrary = (libraryChar) => {
        const existingIds = (modeData.characters || []).map(c => c.id);
        if (existingIds.includes(libraryChar.id)) {
            alert('ตัวละครนี้อยู่ใน Mode แล้ว');
            return;
        }
        const newChar = {
            id: libraryChar.id,
            name: libraryChar.name,
            description: libraryChar.personality || '',
            visualDescription: libraryChar.visualDescription || '',
            role: libraryChar.role || 'main',
            voiceStyle: libraryChar.voiceStyle || 'neutral',
            image: libraryChar.image || '',
            tags: libraryChar.tags || [],
            gender: libraryChar.gender || '',
            personality: libraryChar.personality || '',
            isFavorite: libraryChar.isFavorite || false
        };
        const updatedModeData = { ...modeData, characters: [...(modeData.characters || []), newChar] };
        setModeData(updatedModeData);
        
        // Force save immediately if docId exists
        if (modeData.docId && currentUser) {
            const docRef = doc(db, 'users', currentUser.uid, 'modes', modeData.docId);
            setDoc(docRef, { ...updatedModeData, updatedAt: serverTimestamp() }, { merge: true })
                .catch(err => console.error('Error saving character:', err));
        }
    };

    // --- NEW: Image Upload Handlers ---
    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 1. File Size Validation (3MB)
        const MAX_SIZE = 3 * 1024 * 1024; // 3MB in bytes
        if (file.size > MAX_SIZE) {
            alert("⚠️ Image too large! Please select a file under 3MB.");
            e.target.value = ""; // Clear input
            return;
        }

        // 2. Upload to Firebase Storage
        if (!currentUser) return;
        setIsUploading(true); // START Loading

        try {
            // Generate Path: mode_thumbnails/{userId}/{timestamp}_{filename}
            const storagePath = `mode_thumbnails/${currentUser.uid}/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, storagePath);

            // Upload
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Update State (FIXED: Explicit Field Name 'coverImage')
            setModeData(prev => ({ ...prev, coverImage: downloadURL }));
            console.log("Image uploaded:", downloadURL);

        } catch (error) {
            console.error("Error uploading image:", error);
            alert(`Error: ${error.message}`); // SHOW ACTUAL ERROR
        } finally {
            setIsUploading(false); // STOP Loading
        }
    };

    // --- NEW: Save Mode Handler (with AI Prompt Compilation) ---
    const handleSaveMode = async () => {
        if (!currentUser) return;
        setIsSaving(true);
        
        try {
            let compiledScenes = [];
            
            // 1. AI Compile Prompts (TH → EN) - Check block titles instead of rawPrompt
            const hasScenes = modeData.blocks?.length > 0;
            if (hasScenes) {
                try {
                    console.log("🤖 Compiling prompts with AI...");
                    const compilePrompts = httpsCallable(functions, 'compilePrompts');
                    const result = await compilePrompts({ 
                        modeData: modeData,
                        variableValues: {}
                    });
                    
                    if (result.data?.success) {
                        compiledScenes = result.data.compiledScenes || [];
                        console.log(`✅ AI compiled ${compiledScenes.length} scenes`);
                    }
                } catch (compileErr) {
                    console.warn("⚠️ AI compilation failed, saving without compiled prompts:", compileErr);
                }
            }

            // 2. Save to Firestore
            const modesCollectionRef = collection(db, 'users', currentUser.uid, 'modes');
            let docId = modeData.docId;
            
            const dataToSave = {
                ...modeData,
                compiledScenes: compiledScenes, // Store AI-compiled English prompts
                updatedAt: serverTimestamp()
            };

            if (docId && docId !== 'default-mode') {
                await setDoc(doc(modesCollectionRef, docId), dataToSave, { merge: true });
                console.log("Mode updated:", docId);
            } else {
                dataToSave.createdAt = serverTimestamp();
                const newDocRef = await addDoc(modesCollectionRef, dataToSave);
                docId = newDocRef.id;
                setModeData(prev => ({ ...prev, docId: docId }));
                console.log("New Mode created:", docId);
            }

            // SUCCESS FEEDBACK & EXIT
            alert(compiledScenes.length > 0 
                ? `Mode saved! AI compiled ${compiledScenes.length} scenes (TH→EN).`
                : "Mode saved successfully!");
            setActiveTab('library');
            setSelectedLibraryId(null);
            setModeData(emptyModeState);
            setIsEditorActive(false);

        } catch (error) {
            console.error("Error saving mode:", error);
            alert("Error saving mode. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };



    // --- NEW: Helper to Simulate Charon TTS (Sequential) ---

    const playAudio = async (text) => {
        try {
            console.log("🔊 Generating Speech for:", text);
            const generateSpeech = httpsCallable(functions, 'generateSpeech');
            const result = await generateSpeech({
                text: text,
                voiceParams: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' }
            });

            if (result.data && result.data.audioContent) {
                const audio = new Audio(`data:audio/mp3;base64,${result.data.audioContent}`);
                return new Promise((resolve) => {
                    audio.onended = () => {
                        console.log("✅ Audio finished");
                        resolve();
                    };
                    audio.play().catch(e => {
                        console.error("Audio playback error:", e);
                        resolve(); // Resolve anyway to continue flow
                    });
                });
            } else {
                console.error("No audio content received");
                throw new Error("No audio content");
            }
        } catch (error) {
            console.error("TTS Error:", error);
            // Fallback: Simulate delay if API fails to prevent hard stuck
            await new Promise(r => setTimeout(r, 2000));
        }
    };

    // --- NEW: Dynamic Script Generator (Smart Critique) ---


    // --- NEW: Charon Test Run Logic (Sequential) ---
    // --- NEW: AI Analysis Logic (Sequential) ---
    const handleTestRun = async () => {
        // 1. Safety Check: If mode is empty, warn user
        if (!modeData.name || modeData.name === "Mode Template") {
            setTestLogs(["⚠️ Please load or create a mode first!", "Tip: Click a card in 'My Modes' or 'New Mode'."]);
            setIsTesting(false);
            return;
        }

        if (isTesting) return; // Prevent double click
        setIsTesting(true);
        setActiveLineIndex(-1);
        setTestLogs(["🔄 Connecting to Charon's Neural Network...", "📡 Uploading Blueprint for Analysis..."]);

        try {
            // 2. Compile User Work into Prompt (Clean Text Format)
            // WE MUST READ DIRECTLY FROM 'modeData' STATE WHICH IS BOUND TO THE UI INPUTS
            let sceneText = "";
            const activeBlocks = modeData.blocks || []; // Default to empty array

            if (activeBlocks.length > 0) {
                activeBlocks.forEach((block, i) => {
                    sceneText += `Scene ${i + 1}: ${block.title}\n`;
                    if (block.evolution && block.evolution.length > 0) {
                        block.evolution.forEach((ev, j) => {
                            // Deep extraction of visual, audio, and camera details
                            sceneText += `  - Step ${j + 1}: ${ev.rawPrompt || 'No visual prompt'} (Camera: ${ev.cameraAngle || 'Default'})\n`;
                            sceneText += `    Audio: ${ev.audioInstruction || 'No audio'}\n`;
                        });
                    } else {
                        sceneText += `  (No steps in this scene)\n`;
                    }
                });
            } else {
                sceneText = "No scenes added yet.";
            }

            const finalPrompt = `
Title: ${modeData.name}
Description: ${modeData.description || 'No description provided'}
System Instruction: ${modeData.systemInstruction || 'No instruction provided'}

Scenes / Checkpoints:
${sceneText}
            `.trim();

            // 2. Debug Log (Visible in Console)
            console.log("📝 Sending to Charon:", finalPrompt);

            // 3. Call Cloud Function
            const analyzeMode = httpsCallable(functions, 'analyzeMode');
            const result = await analyzeMode({ promptText: finalPrompt });

            const { script, audioContent, score } = result.data;
            console.log("🤖 AI Analysis Result:", result.data);

            // 4. Display Script
            const scriptLines = script.split('\n').filter(line => line.trim() !== '');
            setTestLogs(scriptLines);

            // 5. Play Audio Coverage
            // 5. Play Audio Coverage
            if (audioContent) {
                // Stop any previous audio
                if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                }

                const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
                audioRef.current = audio; // Store ref for control

                await new Promise((resolve) => {
                    audio.onended = () => {
                        resolve();
                        audioRef.current = null; // Clear ref on finish
                    };
                    audio.play().catch(e => {
                        console.error("Audio playback error:", e);
                        resolve();
                    });
                });
            }

        } catch (error) {
            console.error("Analysis Failed:", error);
            setTestLogs(prev => [...prev, "❌ Error: Could not verify mode with Charon Core.", `Details: ${error.message}`]);
        } finally {
            // Manual Close Only (User Request: "It won't go away")
            // Removed auto-close to allow reading logs.
        }
    };

    // Loading Screen
    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-white/50 animate-pulse">
                    <Loader2 size={48} className="animate-spin" />
                    <p>Loading modes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8 space-y-6 overflow-auto">
            {/* Header Toolbar - Unified Style */}
            <div className="relative flex items-center justify-between border-white/10 transition-all duration-300 z-50 overflow-hidden bg-white/5 backdrop-blur-xl border p-4 rounded-2xl shadow-xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                                <Sparkles className="text-white group-hover:rotate-12 transition-transform duration-300" size={32} />
                            </div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-100 to-orange-200 tracking-tight flex items-center gap-3">
                                {modeData.name}
                                {isSaving && <span className="text-xs text-green-400 font-normal flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full"><Loader2 size={12} className="animate-spin" /> Saving...</span>}
                            </h1>
                            <p className="text-base text-slate-400 font-light flex items-center gap-2 mt-1">
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                                Mode Creator Engine
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={toggleAllBlocks}
                            className="p-2.5 bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white rounded-xl transition-all border border-white/10 hover:scale-105"
                            title="Collapse/Expand All"
                        >
                            <ChevronsDownUp size={18} />
                        </button>
                        <div className="w-px h-10 bg-white/10"></div>
                        <button
                            onClick={handleTestRun}
                            disabled={isTesting}
                            className={`group relative flex items-center gap-2 px-6 py-3 rounded-2xl transition-all duration-300 font-bold overflow-hidden ${isTesting ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-yellow-500 animate-pulse text-white shadow-xl shadow-orange-500/40' : 'bg-black/40 backdrop-blur-xl border border-white/10 hover:border-orange-500/50 text-white hover:scale-105 hover:shadow-lg hover:shadow-orange-500/20'}`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/10 to-orange-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                            {isTesting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="relative z-10 group-hover:scale-110 group-hover:rotate-12 transition-all" />}
                            <span className="relative z-10">{isTesting ? 'Running...' : 'Test Run'}</span>
                        </button>
                        <button
                            onClick={handleSaveMode}
                            disabled={isSaving}
                            className="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white rounded-2xl transition-all duration-300 shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-bold hover:scale-105 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="relative z-10 group-hover:scale-110 group-hover:rotate-12 transition-all" />}
                            <span className="relative z-10">{isSaving ? 'Saving...' : 'Save Mode'}</span>
                        </button>
                    </div>
            </div>
            
            {/* TAB BAR */}
            <div className="flex justify-between items-center w-full px-1 py-2 shrink-0">
                <div className="flex items-center gap-2 p-2 bg-black/40 backdrop-blur-xl rounded-2xl w-fit shrink-0 border border-white/10">
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`group relative px-6 py-3 rounded-xl transition-all duration-300 flex items-center gap-2.5 font-bold overflow-hidden ${activeTab === 'library'
                            ? 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white shadow-xl shadow-orange-500/40'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                        <Layers size={18} className={`relative z-10 transition-all duration-300 ${activeTab === 'library' ? 'animate-pulse' : 'group-hover:rotate-12'}`} />
                        <span className="relative z-10">My Modes</span>
                        {allModes.length > 0 && (
                            <span className="bg-yellow-400 text-black px-2.5 py-0.5 rounded-full text-xs font-bold animate-pulse">{allModes.length}</span>
                        )}
                        {activeTab === 'library' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('editor')}
                        className={`group relative px-6 py-3 rounded-xl transition-all duration-300 flex items-center gap-2.5 font-bold overflow-hidden ${activeTab === 'editor'
                            ? 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white shadow-xl shadow-orange-500/40'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                        <Sparkles size={18} className={`relative z-10 transition-all duration-300 ${activeTab === 'editor' ? 'animate-pulse' : 'group-hover:rotate-12'}`} />
                        <span className="relative z-10">Creator</span>
                        {activeTab === 'editor' && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                    </button>
                </div>
            </div>

            {/* Split Layout */}
            <div className={`flex-1 flex overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'gap-4' : 'gap-0'}`}>
                {/* Left Sidebar - Configuration OR Test Console (Only show in Editor tab) */}
                <div
                    className={`
                        flex-shrink-0 bg-white/5 backdrop-blur-xl border-white/10 rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out relative
                        ${isSidebarOpen && activeTab === 'editor' ? 'w-[400px] border opacity-100' : 'w-0 border-none opacity-0'}
                    `}
                >
                    <div className="w-[400px] p-6 flex flex-col gap-6 h-full overflow-y-auto">

                        {/* VIEW A: TEST CONSOLE (When testing) */}
                        {isTesting ? (
                            <div className="absolute inset-0 z-20 bg-gray-950 flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
                                {/* Console Header */}
                                <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-black/40">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500'} animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]`}></div>
                                        <span className="text-red-500 font-mono text-xs uppercase tracking-widest leading-none">
                                            {isPaused ? "SIMULATION PAUSED" : "SIMULATION ACTIVE"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Play/Pause Button */}
                                        <button
                                            onClick={handleTogglePause}
                                            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${isPaused ? 'text-green-400' : 'text-yellow-400'}`}
                                            title={isPaused ? "Resume Simulation" : "Pause Simulation"}
                                        >
                                            {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                                        </button>

                                        {/* Smart Copy Button */}
                                        <button
                                            onClick={handleCopyLogs}
                                            disabled={isTesting && !isPaused && testLogs.length < 4} // Only disable if running deeply
                                            className="p-1.5 rounded hover:bg-white/10 text-blue-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed group relative"
                                            title="Copy Log to Clipboard"
                                        >
                                            {clickFeedback === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                                            {clickFeedback === 'copied' && (
                                                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded shadow-lg animate-in fade-in zoom-in-95">
                                                    Copied!
                                                </span>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleCloseConsole} // Use explicit handler
                                            className="text-gray-500 hover:text-white transition-colors z-50 relative p-2"
                                            title="Stop Test & Close"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Logs Area */}
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 font-mono text-sm">
                                    <div className="flex items-end gap-1 h-8 opacity-50 mb-4">
                                        {[...Array(8)].map((_, i) => (
                                            <div key={i} className="w-1 bg-orange-500 rounded-t animate-[bounce_0.8s_infinite]" style={{ animationDelay: `${i * 0.1}s`, height: `${Math.random() * 100}%` }}></div>
                                        ))}
                                    </div>

                                    {testLogs.map((log, i) => (
                                        <div
                                            key={i}
                                            className={`p-3 rounded-r-lg border-l-2 animate-in slide-in-from-bottom-2 fade-in duration-300 transition-colors ${i === activeLineIndex
                                                ? 'bg-orange-500/20 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.2)]' // Active Style
                                                : i < activeLineIndex
                                                    ? 'bg-gray-800/50 border-gray-600 text-gray-400 opacity-60' // Past Lines (Dimmed)
                                                    : 'bg-orange-500/5 border-orange-500/30 text-orange-200/70' // Upcoming Lines
                                                }`}
                                        >
                                            <span className={`mr-2 ${i === activeLineIndex ? 'text-orange-400 animate-pulse' : 'opacity-30'}`}>{`>`}</span>
                                            {log}
                                        </div>
                                    ))}
                                    {testLogs.length === 0 && (
                                        <div className="text-gray-600 italic">Initializing Charon Neural Core...</div>
                                    )}
                                </div>

                                {/* Console Footer */}
                                <div className="p-4 border-t border-gray-800 bg-black/40 flex justify-between items-center text-xs text-gray-500 font-mono">
                                    <span>PID: {Date.now().toString().slice(-6)}</span>
                                    <span className={testLogs.length >= 4 ? "text-green-500" : "text-yellow-500"}>
                                        STATUS: {testLogs.length >= 4 ? "COMPLETE" : "RUNNING"}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            /* VIEW B: EDITOR FORM (Default) */
                            <>
                                <div>
                                    <h3 className="text-sm font-bold text-red-200 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Settings size={16} /> Configuration
                                    </h3>

                                    <div className="space-y-4">
                                        {/* THUMBNAIL UPLOAD UI */}
                                        <div>
                                            <label className="text-xs text-gray-400 mb-1 block">Mode Thumbnail</label>
                                            <div className="flex items-start gap-4">
                                                {/* Preview */}
                                                <div className="w-20 h-20 bg-black/40 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden shrink-0 group relative">
                                                    {modeData.coverImage ? (
                                                        <>
                                                            <img src={modeData.coverImage} alt="Mode Thumbnail" className="w-full h-full object-cover" />
                                                            <button
                                                                onClick={() => setModeData({ ...modeData, coverImage: "" })}
                                                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                                                                disabled={!isEditorActive}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="flex items-center justify-center w-full h-full text-gray-600">
                                                            {isUploading ? <Loader2 size={24} className="animate-spin text-blue-400" /> : <Camera size={24} />}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Upload Input */}
                                                <div className="flex-1 flex flex-col gap-2">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleImageUpload}
                                                        disabled={!isEditorActive || isSaving || isUploading}
                                                        className="text-sm text-slate-300 file:mr-3 file:py-2.5 file:px-5 file:rounded-xl file:border file:border-amber-400/50 file:text-sm file:font-bold file:bg-amber-500/30 file:text-amber-200 hover:file:bg-amber-500/50 hover:file:border-amber-400/70 hover:file:text-white file:transition-all file:duration-300 file:shadow-lg file:shadow-amber-500/20 file:cursor-pointer cursor-pointer disabled:opacity-50"
                                                    />
                                                    <p className="text-[10px] text-slate-500">
                                                        Max size: 3MB. Formats: JPG, PNG, WEBP.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Mode Name</label>
                                            <input
                                                type="text"
                                                value={modeData.name}
                                                onChange={(e) => setModeData({ ...modeData, name: e.target.value })}
                                                disabled={!isEditorActive}
                                                className="w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 text-white focus:border-red-500/50 focus:bg-black/60 focus:shadow-lg focus:shadow-red-500/10 outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed placeholder-slate-500"
                                                placeholder="Mode Template"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Category</label>
                                            <div className="glass-dropdown-wrapper w-full">
                                                <GlassDropdown
                                                    value={modeData.category || "Cinematic / Movie"}
                                                    onChange={(newCategory) => setModeData({ ...modeData, category: newCategory })}
                                                    disabled={!isEditorActive}
                                                    options={[
                                                        "Cinematic / Movie",
                                                        "Short Film / Story",
                                                        "Product Showcase / Commercial",
                                                        "Real Estate / Architecture",
                                                        "Vlog / Lifestyle",
                                                        "Time-lapse / Hyper-lapse",
                                                        "Documentary / News",
                                                        "How-to / Tutorial",
                                                        "Relaxation / Lo-fi / ASMR"
                                                    ].map(cat => ({ value: cat, label: cat }))}
                                                    buttonClassName="glass-dropdown w-full disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Description</label>
                                            <textarea
                                                className="w-full h-20 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 text-white focus:border-red-500/50 focus:bg-black/60 focus:shadow-lg focus:shadow-red-500/10 outline-none transition-all duration-300 resize-none disabled:opacity-50 disabled:cursor-not-allowed placeholder-slate-500"
                                                placeholder="What does this mode do?"
                                                value={modeData.description}
                                                onChange={(e) => setModeData({ ...modeData, description: e.target.value })}
                                                disabled={!isEditorActive}
                                            />
                                        </div>

                                        {/* Story Overview Section */}
                                        <div className="border-t border-white/10 pt-4 mt-2">
                                            <h3 className="text-sm font-bold text-orange-200 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                📖 Story Overview (ภาพรวมเรื่อง)
                                            </h3>
                                            
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs text-gray-400 mb-1 block">Synopsis (เนื้อเรื่องย่อ)</label>
                                                    <textarea
                                                        className="w-full h-24 bg-black/20 border border-orange-500/20 rounded-lg px-3 py-2 text-white focus:border-orange-500/50 outline-none transition-colors resize-none disabled:opacity-50"
                                                        placeholder="สรุปเนื้อเรื่องทั้งหมด เช่น: เรื่องราวของนักรบผู้พ่ายแพ้ที่ต้องกลับมาต่อสู้อีกครั้ง..."
                                                        value={modeData.storyOverview?.synopsis || ''}
                                                        onChange={(e) => handleUpdateStoryOverview('synopsis', e.target.value)}
                                                        disabled={!isEditorActive}
                                                    />
                                                </div>
                                                
                                                <div>
                                                    <label className="text-xs text-gray-400 mb-1 block">Theme (แก่นเรื่อง)</label>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-black/20 border border-orange-500/20 rounded-lg px-3 py-2 text-white focus:border-orange-500/50 outline-none disabled:opacity-50"
                                                        placeholder="เช่น: การต่อสู้เพื่ออิสรภาพ, ความรักข้ามกาลเวลา"
                                                        value={modeData.storyOverview?.theme || ''}
                                                        onChange={(e) => handleUpdateStoryOverview('theme', e.target.value)}
                                                        disabled={!isEditorActive}
                                                    />
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <label className="text-xs text-gray-400 mb-1 block">Tone (บรรยากาศ)</label>
                                                        <div className="glass-dropdown-wrapper w-full">
                                                            <GlassDropdown
                                                                value={modeData.storyOverview?.tone || 'epic'}
                                                                onChange={(newTone) => handleUpdateStoryOverview('tone', newTone)}
                                                                disabled={!isEditorActive}
                                                                options={[
                                                                    { value: 'epic', label: '🎬 Epic (ยิ่งใหญ่)' },
                                                                    { value: 'dark', label: '🌑 Dark (มืดหม่น)' },
                                                                    { value: 'romantic', label: '💕 Romantic (โรแมนติก)' },
                                                                    { value: 'comedy', label: '😄 Comedy (ตลก)' },
                                                                    { value: 'horror', label: '👻 Horror (สยองขวัญ)' },
                                                                    { value: 'action', label: '💥 Action (แอ็คชั่น)' },
                                                                    { value: 'drama', label: '🎭 Drama (ดราม่า)' }
                                                                ]}
                                                                buttonClassName="glass-dropdown w-full disabled:opacity-50"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="w-1/3">
                                                        <label className="text-xs text-gray-400 mb-1 block">Duration</label>
                                                        <div className="bg-black/20 border border-orange-500/20 rounded-lg px-3 py-2 text-center">
                                                            <div className="text-lg font-bold text-orange-300">
                                                                {(() => {
                                                                    const totalScenes = (modeData.blocks || []).reduce((acc, block) => 
                                                                        acc + (block.evolution?.length || 0), 0);
                                                                    const totalSeconds = totalScenes * 8;
                                                                    const mins = Math.floor(totalSeconds / 60);
                                                                    const secs = totalSeconds % 60;
                                                                    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
                                                                })()}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500">
                                                                {(modeData.blocks || []).reduce((acc, block) => 
                                                                    acc + (block.evolution?.length || 0), 0)} scenes
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-gray-400 mb-1 block">System Instruction (The Brain)</label>
                                            <textarea
                                                className="w-full h-32 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-red-500/50 outline-none transition-colors resize-none font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                placeholder="You are an expert video director..."
                                                value={modeData.systemInstruction}
                                                onChange={(e) => setModeData({ ...modeData, systemInstruction: e.target.value })}
                                                disabled={!isEditorActive}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Characters Section */}
                                <div className="border-t border-white/10 pt-6">
                                    <h3 className="text-sm font-bold text-cyan-200 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        👥 Characters (ตัวละคร)
                                    </h3>
                                    <p className="text-xs text-gray-500 mb-4">กำหนดตัวละครพร้อมรูปร่าง เสื้อผ้า และสไตล์เสียง</p>

                                    {/* Character List - Compact Card View */}
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        {(modeData.characters || []).map((character) => (
                                            <div key={character.id} className="relative group bg-cyan-500/5 border border-cyan-500/20 rounded-xl overflow-hidden animate-in slide-in-from-left-2">
                                                {/* Image */}
                                                <div className="aspect-square bg-slate-800 relative">
                                                    {character.image ? (
                                                        <img src={character.image} alt={character.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-3xl">👤</div>
                                                    )}
                                                    {/* Role Badge */}
                                                    <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] rounded-full ${
                                                        character.role === 'main' ? 'bg-yellow-500/80 text-yellow-900' :
                                                        character.role === 'villain' ? 'bg-red-500/80 text-white' :
                                                        'bg-blue-500/80 text-white'
                                                    }`}>
                                                        {character.role === 'main' ? '⭐' : character.role === 'villain' ? '😈' : '👤'}
                                                    </span>
                                                    {/* Delete Button */}
                                                    <button
                                                        onClick={() => handleDeleteCharacter(character.id)}
                                                        disabled={!isEditorActive}
                                                        className="absolute top-2 left-2 p-1.5 bg-red-500/20 hover:bg-red-500/50 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                                                    >
                                                        <Trash2 size={12} className="text-red-400" />
                                                    </button>
                                                </div>
                                                {/* Info */}
                                                <div className="p-2">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <h4 className="font-medium text-white text-xs truncate flex-1">{character.name}</h4>
                                                        {/* Eye Icon for Preview */}
                                                        <button
                                                            onClick={() => setPreviewingCharacter(character)}
                                                            className="p-1 bg-cyan-500/20 hover:bg-cyan-500/40 rounded-lg transition-colors flex-shrink-0"
                                                            title="ดูรายละเอียด"
                                                        >
                                                            <Eye size={14} className="text-cyan-400" />
                                                        </button>
                                                    </div>
                                                    {/* Tags */}
                                                    {character.tags?.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {character.tags.slice(0, 2).map(tag => (
                                                                <span key={tag} className="px-1.5 py-0.5 bg-white/10 text-slate-400 text-[9px] rounded">
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                            {character.tags.length > 2 && (
                                                                <span className="text-[9px] text-slate-500">+{character.tags.length - 2}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={openCharacterLibrary}
                                        disabled={!isEditorActive}
                                        className="w-full text-center p-4 border border-dashed border-yellow-500/30 rounded-lg text-yellow-500/50 text-sm hover:bg-yellow-500/5 cursor-pointer transition-colors active:scale-95 select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                                    >
                                        📚 นำเข้าจาก Library
                                    </button>
                                </div>


                            </>
                        )}
                    </div>
                </div>

                {/* Right Column (Library + Canvas) */}
                <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'gap-4' : 'gap-0'}`}>
                    {/* 1. Mode Library Grid */}
                    {activeTab === 'library' && (
                        <div className="flex-1 overflow-y-auto min-h-0 p-1 animate-in fade-in zoom-in-95 duration-300">
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                                {/* --- NEW MODE CARD (Animated Border Beam) --- */}
                                <div
                                    onClick={handleCreateNewMode}
                                    className="relative group h-full min-h-[180px] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]"
                                >
                                    {/* Animated Border Gradient (Behind) */}
                                    <div className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_90deg,#22c55e_180deg,transparent_360deg)] animate-spin opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"></div>

                                    {/* Inner Mask (Foreground) - Solid to block center */}
                                    <div className="absolute inset-[2px] bg-gray-900 rounded-xl z-10 flex flex-col items-center justify-center transition-colors">

                                        {/* SCALING CONTENT CONTAINER */}
                                        <div className="flex flex-col items-center justify-center transition-transform duration-300 group-hover:scale-110">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-green-500/20 transition-colors duration-300">
                                                <Plus size={32} className="text-gray-600 group-hover:text-green-400 transition-all duration-300" />
                                            </div>
                                            <h3 className="text-gray-500 font-medium mt-2 group-hover:text-green-100 transition-colors duration-300">New Mode</h3>
                                        </div>

                                    </div>
                                </div>
                                {allModes.map(mode => {
                                    const isActive = selectedLibraryId === mode.id;
                                    const isEditable = modeData.docId === mode.id && isEditorActive;

                                    return (
                                        <div
                                            key={mode.id}
                                            onClick={() => handleSelectMode(mode)}
                                            className={`
                                            aspect-[4/3] rounded-2xl p-4 flex flex-col justify-between relative group cursor-pointer border transition-all
                                            ${isActive
                                                    ? 'bg-gray-800/80 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.15)] ring-1 ring-green-500/50'
                                                    : 'bg-gray-800/40 border-white/5 hover:border-white/20 hover:bg-gray-800/60'}
                                        `}
                                        >
                                            {/* Top Half - Thumbnail Area */}
                                            <div className="h-28 bg-white/5 rounded-xl flex items-center justify-center relative mb-3 group-hover:bg-white/10 transition-colors overflow-hidden">
                                                {mode.coverImage ? (
                                                    <img src={mode.coverImage} alt={mode.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    /* Centered Icon */
                                                    <div className={`p-3 rounded-full ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-500'}`}>
                                                        <Layers size={32} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Bottom Half - Info */}
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h3 className={`font-bold truncate text-sm ${isActive ? 'text-white' : 'text-gray-200'}`}>
                                                        {mode.name}
                                                    </h3>
                                                </div>

                                                <p className="text-xs text-gray-500 line-clamp-2 h-8 leading-4">
                                                    {mode.description || "No description provided."}
                                                </p>

                                                {/* Badges */}
                                                <div className="flex items-center gap-2 mt-2 pt-3 border-t border-white/5">
                                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md border border-white/5">
                                                        <Type size={10} className="text-purple-400" />
                                                        <span className="text-[10px] text-gray-400 font-mono">{mode.variables?.length || 0}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md border border-white/5">
                                                        <Layers size={10} className="text-blue-400" />
                                                        <span className="text-[10px] text-gray-400 font-mono">{mode.blocks?.length || 0}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Buttons (Floating above Overlay) */}
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none group-hover:pointer-events-auto">
                                                <button
                                                    onClick={(e) => handleLoadMode(e, mode)}
                                                    className={`p-1.5 rounded-lg transition-all ${isEditable ? 'bg-green-500 text-white shadow-lg' : 'bg-black/50 hover:bg-white text-white/70 hover:text-black backdrop-blur-sm'}`}
                                                    title="Edit Mode"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteMode(e, mode.id)}
                                                    className="p-1.5 bg-black/50 hover:bg-red-500 text-white/70 hover:text-white rounded-lg backdrop-blur-sm transition-all"
                                                    title="Delete Mode"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>

                                            {/* HOVER OVERLAY (Full Card) */}
                                            <div className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-md border border-blue-500/20 h-full w-full flex flex-col p-5 overflow-y-auto custom-scrollbar opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto rounded-2xl">
                                                {/* Header */}
                                                <div className="flex items-center gap-2 border-b border-blue-500/20 pb-3 mb-3 shrink-0">
                                                    <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                                                        <Sparkles size={14} />
                                                    </div>
                                                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Mode Details</h4>
                                                </div>

                                                {/* Content - Brain */}
                                                <div className="flex flex-col gap-2 mb-4 shrink-0">
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
                                                        🧠 Brain Instruction
                                                    </span>
                                                    <p className="text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                                                        {mode.systemInstruction || "No specific system instructions provided."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 2. Logic Canvas (Existing) */}
                    {activeTab === 'editor' && (
                        <div className={`flex-1 bg-gray-900/40 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl relative overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300`}>
                            {/* Canvas Header */}
                            <div className="p-4 border-b border-white/10 bg-black/20 flex justify-between items-center backdrop-blur-sm z-10">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    {/* Sidebar Toggle (Internal) */}
                                    <button
                                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                        className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors mr-2 border border-transparent hover:border-white/10"
                                        title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                                    >
                                        {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                                    </button>
                                    <Box size={18} className="text-red-400" /> Logic Canvas
                                </h3>

                                {isEditorActive ? (
                                    <div className="flex items-center gap-2">
                                        {/* Undo / Redo Controls */}
                                        <div className="flex items-center bg-white/5 rounded-lg border border-white/5 p-1 mr-2">
                                            <button
                                                onClick={handleUndo}
                                                disabled={historyRef.current.past.length === 0}
                                                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                title={`Undo (Ctrl+Z) - ${historyRef.current.past.length} steps`}
                                            >
                                                <RotateCcw size={16} />
                                            </button>
                                            <button
                                                onClick={handleRedo}
                                                disabled={historyRef.current.future.length === 0}
                                                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                title={`Redo (Ctrl+Y) - ${historyRef.current.future.length} steps`}
                                            >
                                                <RotateCw size={16} />
                                            </button>
                                        </div>

                                        <button
                                            onClick={addBlock}
                                            className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-lg shadow-purple-900/20"
                                        >
                                            <Plus size={16} /> Add Block
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-xs text-yellow-400 font-mono">READ ONLY (Click Pencil to Edit)</span>
                                )}
                            </div>

                            {/* Scrollable Area */}
                            <div className="flex-1 overflow-y-auto p-8 pb-96 relative scroll-smooth">
                                {/* Grid Background */}
                                <div className="absolute inset-0 opacity-10 pointer-events-none"
                                    style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                                ></div>

                                <div className="flex flex-col gap-6 w-full max-w-full relative z-10">

                                    {modeData.blocks.length === 0 && isEditorActive && (
                                        <div className="text-center py-20 text-white/20">
                                            <Box size={48} className="mx-auto mb-4 opacity-50" />
                                            <p>No blocks added. Click "Add Block" to start.</p>
                                        </div>
                                    )}

                                    {modeData.blocks.length === 0 && !isEditorActive && (
                                        <div className="text-center py-20 text-white/20">
                                            <div className="inline-block p-4 rounded-full bg-white/5 mb-4">
                                                <Pencil size={32} className="opacity-50" />
                                            </div>
                                            <p>Select a mode and click the <strong className="text-white">Pencil Icon</strong> to edit.</p>
                                        </div>
                                    )}

                                    {modeData.blocks.map((block) => (
                                        <div key={block.id} className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
                                            {/* Block Header */}
                                            <div
                                                className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors"
                                                onClick={() => toggleBlock(block.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div onClick={(e) => e.stopPropagation()}>
                                                        <GripVertical size={20} className="text-gray-500 cursor-move" />
                                                    </div>
                                                    <div className="bg-purple-500/10 p-1.5 rounded-lg border border-purple-500/20">
                                                        <Film size={18} className="text-purple-400" />
                                                    </div>
                                                    {/* EDITABLE TITLE INPUT */}
                                                    <input
                                                        type="text"
                                                        value={block.title}
                                                        onChange={(e) => updateBlockTitle(block.id, e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        placeholder="Untitled Sequence"
                                                        disabled={!isEditorActive}
                                                        className="bg-transparent border-none text-white font-bold text-lg outline-none placeholder-gray-500 w-full min-w-[200px] disabled:opacity-50"
                                                    />
                                                    {/* PERCENTAGE INPUT (Block Level) */}
                                                    <div className="flex flex-row items-center gap-2 mr-2 min-w-fit">
                                                        <span className="text-sm font-bold text-gray-400 uppercase whitespace-nowrap">SEQ %</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={block.sequencePercentage || 0}
                                                            onChange={(e) => updateBlockPercentage(block.id, parseInt(e.target.value) || 0)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            disabled={!isEditorActive}
                                                            className="w-12 bg-gray-800 text-white text-sm text-center border border-gray-600 rounded py-1 focus:border-purple-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        />
                                                    </div>
                                                    <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30 font-medium whitespace-nowrap flex-shrink-0">Dynamic Evolution</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {block.isExpanded ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                                                    <div className="w-px h-6 bg-white/10 mx-2"></div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteBlock(block.id);
                                                        }}
                                                        disabled={!isEditorActive}
                                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-colors group disabled:opacity-0"
                                                        title="Delete Sequence"
                                                    >
                                                        <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Evolution Stages List */}
                                            {block.isExpanded && (
                                                <div className="p-4 space-y-4 animate-in slide-in-from-top-4 duration-200">
                                                    {(block.evolution || []).map((stage, index) => (
                                                        <div key={stage.id} className="border border-white/10 rounded-lg bg-black/20 transition-all">

                                                            {/* Stage Header (Collapsible) */}
                                                            <div
                                                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5"
                                                                onClick={() => toggleStage(block.id, stage.id)}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <span className="w-6 h-6 rounded-full bg-white/10 text-xs flex items-center justify-center font-mono text-gray-400">{index + 1}</span>
                                                                    <span className="text-sm text-gray-300 font-medium truncate max-w-md">
                                                                        {stage.rawPrompt || "New Cinematic Step"}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {stage.isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                                                                </div>
                                                            </div>

                                                            {/* Stage Body (Expanded) */}
                                                            {stage.isExpanded && (
                                                                <div className="p-4 pt-0 border-t border-white/5 animate-in slide-in-from-top-2">
                                                                    <CinematicStep
                                                                        stage={stage}
                                                                        onUpdate={(field, val) => updateStage(block.id, stage.id, field, val)}
                                                                        onRemove={() => deleteStage(block.id, stage.id)}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}

                                                    {/* Add Cinematic Step - ลบแล้ว เพราะ Expander จะขยายให้อัตโนมัติ */}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Mode Architect (Consultant) - ช่วยสร้างชื่อฉาก */}
            <ModeConsultant modeData={modeData} setModeData={setModeData} expanderList={expanderList} />

            {/* Character Library Modal */}
            {isCharacterLibraryOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h2 className="text-lg font-bold text-white">📚 Character Library</h2>
                            <button
                                onClick={() => setIsCharacterLibraryOpen(false)}
                                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Filter Bar */}
                        <div className="p-4 border-b border-white/10 space-y-3">
                            {/* Search + Dropdowns */}
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Search */}
                                <div className="relative flex-1 min-w-[200px]">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        value={libSearchQuery}
                                        onChange={(e) => setLibSearchQuery(e.target.value)}
                                        placeholder="ค้นหาตัวละคร..."
                                        className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                                {/* Role Dropdown */}
                                <div className="glass-dropdown-wrapper">
                                    <GlassDropdown
                                        value={libRoleFilter}
                                        onChange={setLibRoleFilter}
                                        options={[
                                            { value: 'all', label: '👤 บทบาท' },
                                            { value: 'main', label: '⭐ ตัวเอก' },
                                            { value: 'villain', label: '😈 ตัวร้าย' },
                                            { value: 'supporting', label: '👤 ตัวประกอบ' }
                                        ]}
                                        buttonClassName="glass-dropdown"
                                    />
                                </div>
                                {/* Tag Dropdown */}
                                <div className="glass-dropdown-wrapper">
                                    <GlassDropdown
                                        value={libTagFilter}
                                        onChange={setLibTagFilter}
                                        placeholder="🏷️ ทุก Tag"
                                        options={[
                                            { value: '', label: '🏷️ ทุก Tag' },
                                            ...[...new Set(libraryCharacters.flatMap(c => c.tags || []))].map(tag => ({ value: tag, label: tag }))
                                        ]}
                                        buttonClassName="glass-dropdown"
                                    />
                                </div>
                            </div>
                            {/* Role Filter Tabs */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setLibRoleFilter('all')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                                        libRoleFilter === 'all'
                                            ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                                            : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    🔴 ทั้งหมด
                                </button>
                                <button
                                    onClick={() => setLibRoleFilter('main')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                                        libRoleFilter === 'main'
                                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                                            : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    ⭐ ตัวเอก
                                </button>
                                <button
                                    onClick={() => setLibRoleFilter('villain')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                                        libRoleFilter === 'villain'
                                            ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                                            : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    💀 ตัวร้าย
                                </button>
                                <button
                                    onClick={() => setLibRoleFilter('supporting')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                                        libRoleFilter === 'supporting'
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                            : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    👤 ตัวประกอบ
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto max-h-[50vh]">
                            {loadingLibrary ? (
                                <div className="text-center py-8">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-cyan-500" />
                                    <p className="text-slate-400 mt-2">กำลังโหลด...</p>
                                </div>
                            ) : libraryCharacters.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-slate-400 mb-4">ยังไม่มีตัวละครใน Library</p>
                                    <a
                                        href="/characters"
                                        className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors"
                                    >
                                        ไปสร้างตัวละคร →
                                    </a>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {libraryCharacters
                                        .filter(c => libRoleFilter === 'all' || c.role === libRoleFilter)
                                        .filter(c => !libSearchQuery || c.name?.toLowerCase().includes(libSearchQuery.toLowerCase()))
                                        .filter(c => !libTagFilter || (c.tags || []).includes(libTagFilter))
                                        .map((char) => {
                                        const isAdded = (modeData.characters || []).some(c => c.id === char.id);
                                        return (
                                            <div
                                                key={char.id}
                                                className={`relative bg-white/5 border rounded-xl overflow-hidden transition-all ${
                                                    isAdded 
                                                        ? 'border-green-500/50 opacity-60' 
                                                        : 'border-white/10 hover:border-cyan-500/50 cursor-pointer'
                                                }`}
                                                onClick={() => !isAdded && addCharacterFromLibrary(char)}
                                            >
                                                {/* Image */}
                                                <div className="aspect-square bg-slate-800 relative">
                                                    {char.image ? (
                                                        <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-2xl">👤</div>
                                                    )}
                                                    {/* Added Badge */}
                                                    {isAdded && (
                                                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-500/80 text-white text-[10px] rounded-full">
                                                            ✓
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Name + Tags */}
                                                <div className="p-2">
                                                    <h4 className="font-medium text-white text-xs truncate">{char.name}</h4>
                                                    {char.tags?.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {char.tags.slice(0, 2).map(tag => (
                                                                <span key={tag} className="px-1 py-0.5 bg-white/10 text-slate-400 text-[9px] rounded">
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex justify-end p-4 border-t border-white/10">
                            <button
                                onClick={() => setIsCharacterLibraryOpen(false)}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Character Preview Modal */}
            {previewingCharacter && (
                <div 
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
                    onClick={() => setPreviewingCharacter(null)}
                >
                    <div 
                        className="bg-slate-900 border border-white/20 rounded-2xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Image */}
                        <div className="aspect-video bg-gradient-to-br from-slate-700 to-slate-800 relative">
                            {previewingCharacter.image ? (
                                <img src={previewingCharacter.image} alt={previewingCharacter.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500 text-5xl">👤</div>
                            )}
                            {/* Role Badge */}
                            <span className={`absolute top-3 right-3 px-3 py-1 text-sm font-medium rounded-full ${
                                previewingCharacter.role === 'main' ? 'bg-yellow-500/80 text-yellow-900' :
                                previewingCharacter.role === 'villain' ? 'bg-red-500/80 text-white' :
                                'bg-blue-500/80 text-white'
                            }`}>
                                {previewingCharacter.role === 'main' ? '⭐ ตัวเอก' : previewingCharacter.role === 'villain' ? '😈 ตัวร้าย' : '👤 ตัวประกอบ'}
                            </span>
                        </div>

                        {/* Info */}
                        <div className="p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">{previewingCharacter.name}</h2>
                                {previewingCharacter.gender && (
                                    <span className="text-sm text-slate-400">{previewingCharacter.gender}</span>
                                )}
                            </div>

                            {previewingCharacter.personality && (
                                <div>
                                    <p className="text-xs text-cyan-300 mb-1">บุคลิก</p>
                                    <p className="text-sm text-white">{previewingCharacter.personality}</p>
                                </div>
                            )}

                            {previewingCharacter.visualDescription && (
                                <div>
                                    <p className="text-xs text-cyan-300 mb-1">🎨 รูปร่าง/เสื้อผ้า (สำคัญ!)</p>
                                    <p className="text-sm text-cyan-200 leading-relaxed bg-black/20 border border-cyan-500/30 rounded-lg p-2">{previewingCharacter.visualDescription}</p>
                                </div>
                            )}

                            {previewingCharacter.tags?.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {previewingCharacter.tags.map(tag => (
                                        <span key={tag} className="px-2 py-1 bg-white/10 text-slate-300 text-xs rounded-lg">
                                            🏷️ {tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Close Button */}
                            <div className="flex justify-end pt-3 border-t border-white/10">
                                <button
                                    onClick={() => setPreviewingCharacter(null)}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                                >
                                    ปิด
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ModeCreator;
