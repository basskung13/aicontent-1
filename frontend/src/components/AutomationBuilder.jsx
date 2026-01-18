import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronDown, Loader2 } from 'lucide-react';
import GlassDropdown from './ui/GlassDropdown';

const AutomationBuilder = () => {
    const [recipes, setRecipes] = useState([]);
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [newStep, setNewStep] = useState({ type: 'GOTO', value: '' });



    // Project Selection for Recording
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [currentUser, setCurrentUser] = useState(null);

    // Load Projects
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user) {
                const q = query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc'));
                return onSnapshot(q, (snapshot) => {
                    const loaded = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    setProjects(loaded);
                    if (loaded.length > 0 && !selectedProjectId) {
                        setSelectedProjectId(loaded[0].id);
                    }
                });
            }
        });
        return () => unsubscribeAuth();
    }, []);
    useEffect(() => {
        const fetchRecipes = async () => {
            setIsLoading(true);
            try {
                const querySnapshot = await getDocs(collection(db, 'automation_recipes'));
                const loadedRecipes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setRecipes(loadedRecipes);
                if (loadedRecipes.length > 0 && !selectedRecipe) {
                    // Optional: Auto-select first one, or leave null
                }
            } catch (error) {
                console.error("Error loading recipes:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchRecipes();
    }, []);

    const handleCreateRecipe = async () => {
        const name = prompt("Enter new recipe name:");
        if (!name) return;

        const newRecipe = {
            name: name,
            steps: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        try {
            const docRef = await addDoc(collection(db, 'automation_recipes'), newRecipe);
            const created = { id: docRef.id, ...newRecipe };
            setRecipes([...recipes, created]);
            setSelectedRecipe(created);
        } catch (error) {
            console.error("Error creating recipe:", error);
            alert("Failed to create recipe.");
        }
    };

    const handleRecord = async () => {
        if (!selectedRecipe) return;
        if (!selectedProjectId) {
            alert("⚠️ Please create at least one Project in the 'Dashboard' first.");
            return;
        }

        console.log("🚀 [DEBUG] Initiating Record Request...");
        console.log("📍 Target Collection: 'agent_jobs'");
        console.log("📝 Target Project ID:", selectedProjectId);
        console.log("📝 Target Recipe ID:", selectedRecipe.id);

        const payload = {
            projectId: selectedProjectId,
            recipeId: 'CMD_RECORD',
            targetRecipeId: selectedRecipe.id,
            status: 'PENDING',
            createdAt: serverTimestamp(),
            type: 'RECORDING'
        };

        console.log("📦 Payload:", payload);

        try {
            const docRef = await addDoc(collection(db, 'agent_jobs'), payload);
            console.log("✅ [SUCCESS] Job written to Firestore! Doc ID:", docRef.id);
            alert(`🎥 Recording Request Sent!\nJob ID: ${docRef.id}\n1. The Agent will open Chrome.\n2. Perform your actions.\n3. Close Chrome to save steps to '${selectedRecipe.name}'.`);
        } catch (e) {
            console.error("🔥 [ERROR] Firebase Write Failed:", e);
            alert("Error sending record command: " + e.message);
        }
    };

    const handleSaveRecipe = async () => {
        if (!selectedRecipe) return;
        try {
            const recipeRef = doc(db, 'automation_recipes', selectedRecipe.id);
            await updateDoc(recipeRef, {
                steps: selectedRecipe.steps,
                updatedAt: serverTimestamp()
            });
            alert("✅ Recipe saved successfully!");
        } catch (error) {
            console.error("Error saving recipe:", error);
            alert("Failed to save changes.");
        }
    };

    const handleAddStep = () => {
        if (!selectedRecipe) return;

        // Basic validation
        if (!newStep.value && newStep.type !== 'SLEEP') {
            // Allow empty value for some types if needed, but generally require input
            // alert("Please enter a value."); 
        }

        const updatedSteps = [
            ...(selectedRecipe.steps || []),
            {
                ...newStep,
                order: (selectedRecipe.steps?.length || 0) + 1,
                id: Date.now().toString() // Temporary ID for UI key
            }
        ];

        setSelectedRecipe({ ...selectedRecipe, steps: updatedSteps });
        setNewStep({ type: 'GOTO', value: '' }); // Reset form
    };

    const handleDeleteStep = (index) => {
        if (!confirm("Delete this step?")) return;
        const updatedSteps = selectedRecipe.steps.filter((_, i) => i !== index);
        // Re-index orders? Optional, but good practice
        const reindexed = updatedSteps.map((step, i) => ({ ...step, order: i + 1 }));
        setSelectedRecipe({ ...selectedRecipe, steps: reindexed });
    };

    const handleDeleteRecipe = async (id, e) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this ENTIRE recipe?")) return;

        try {
            await deleteDoc(doc(db, 'automation_recipes', id));
            setRecipes(recipes.filter(r => r.id !== id));
            if (selectedRecipe?.id === id) setSelectedRecipe(null);
        } catch (error) {
            console.error("Error deleting recipe:", error);
        }
    };

    const handleRun = async () => {
        if (!selectedRecipe) return;
        if (!selectedProjectId) {
            alert("⚠️ Please select a Target Project from the left sidebar first.");
            return;
        }

        try {
            await addDoc(collection(db, 'agent_jobs'), {
                projectId: selectedProjectId,
                recipeId: selectedRecipe.id, // Sending the Recipe ID triggers playback
                status: 'PENDING',
                createdAt: serverTimestamp(),
                type: 'AUTOMATION'
            });
            alert(`🚀 Playback Started!\nThe Agent will now execute '${selectedRecipe.name}' on Chrome.`);
        } catch (e) {
            console.error(e);
            alert("Error sending run command.");
        }
    };

    return (
        <div className="h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-8 px-2">
                <div>
                    <h2 className="text-3xl font-bold text-white drop-shadow-md">
                        Agent Implementation
                    </h2>
                    <p className="text-red-200/60 text-sm mt-1">Design and train your automation workflows.</p>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-12 gap-8 min-h-0">
                {/* Sidebar: Recipe List */}
                <div className="col-span-3 bg-black/20 backdrop-blur-md rounded-2xl border border-white/5 flex flex-col overflow-hidden">

                    {/* Project Selector (Global Context) */}
                    <div className="p-4 border-b border-white/5 bg-red-900/10">
                        <label className="text-[10px] text-red-200 uppercase font-bold mb-2 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Target Project
                        </label>
                        <div className="relative">
                            <GlassDropdown
                                value={selectedProjectId}
                                onChange={setSelectedProjectId}
                                options={
                                    projects.length === 0
                                        ? [{ value: '', label: 'No Projects Found', disabled: true }]
                                        : projects.map(p => ({ value: p.id, label: p.name }))
                                }
                                buttonClassName="w-full appearance-none bg-black/40 border border-white/10 rounded-lg pl-3 pr-8 py-2.5 text-sm text-white focus:border-red-500 outline-none cursor-pointer hover:bg-black/60 transition-all font-medium"
                            />
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="p-4 border-b border-white/5 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Automation Recipes</h3>
                        {isLoading && <Loader2 size={14} className="animate-spin text-red-500" />}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {recipes.map(recipe => (
                            <div
                                key={recipe.id}
                                onClick={() => setSelectedRecipe(recipe)}
                                className={`w-full group relative text-left p-4 rounded-xl transition-all duration-200 border cursor-pointer ${selectedRecipe?.id === recipe.id
                                    ? 'bg-red-600/20 border-red-500/50 text-white shadow-[0_0_15px_rgba(220,38,38,0.2)]'
                                    : 'bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <div className="font-semibold pr-6 truncate">{recipe.name}</div>
                                <div className="text-xs opacity-60 mt-1">{(recipe.steps || []).length} steps</div>

                                <button
                                    onClick={(e) => handleDeleteRecipe(recipe.id, e)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}

                        <button
                            onClick={handleCreateRecipe}
                            className="w-full py-3 border border-dashed border-white/10 rounded-xl text-slate-500 hover:border-red-500 hover:text-red-500 transition-all text-sm font-medium mt-2 flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Create New Recipe
                        </button>
                    </div>
                </div>

                {/* Main: Step Editor */}
                <div className="col-span-9 bg-black/20 backdrop-blur-md rounded-2xl border border-white/5 flex flex-col overflow-hidden relative">
                    {selectedRecipe ? (
                        <>
                            {/* Toolbar */}
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                                    <span className="p-2 bg-red-500 rounded-lg shadow-lg">⚡</span>
                                    {selectedRecipe.name}
                                </h3>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleRun}
                                        disabled={!selectedProjectId}
                                        className={`px-5 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all transform hover:-translate-y-0.5 active:translate-y-0 ${selectedProjectId
                                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 shadow-green-900/20'
                                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                            }`}
                                    >
                                        <Play size={18} fill="currentColor" /> Play
                                    </button>
                                    <div className="w-px h-8 bg-white/10 mx-2"></div>
                                    <button
                                        onClick={handleRecord}
                                        disabled={!selectedProjectId}
                                        className={`px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all border ${selectedProjectId
                                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/60'
                                            : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                                            }`}
                                    >
                                        🔴 Record
                                    </button>
                                    <button
                                        onClick={handleSaveRecipe}
                                        className="px-5 py-2.5 bg-white/5 text-slate-300 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white transition-all font-semibold flex items-center gap-2"
                                    >
                                        <Save size={18} /> Save
                                    </button>
                                </div>
                            </div>

                            {/* Step List (Scrollable) */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                                {(!selectedRecipe.steps || selectedRecipe.steps.length === 0) && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500/50 gap-4">
                                        <div className="text-6xl grayscale opacity-20">📼</div>
                                        <p>No steps recorded. Start training or add steps manually.</p>
                                    </div>
                                )}
                                {(selectedRecipe.steps || []).map((step, index) => (
                                    <div key={index} className="group flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-red-500/30 transition-all relative">
                                        <div className="cursor-move text-slate-600 hover:text-slate-400">
                                            <GripVertical size={16} />
                                        </div>
                                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-black/40 rounded-full text-slate-500 text-xs font-mono border border-white/5">
                                            {index + 1}
                                        </div>

                                        <div className="flex flex-col flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded border ${step.type === 'GOTO' ? 'bg-blue-500/20 text-blue-300 border-blue-500/20' :
                                                    step.type === 'CLICK_SELECTOR' ? 'bg-orange-500/20 text-orange-300 border-orange-500/20' :
                                                        step.type === 'WAIT_UNTIL' ? 'bg-purple-500/20 text-purple-300 border-purple-500/20' :
                                                            'bg-red-500/20 text-red-300 border-red-500/20'
                                                    }`}>
                                                    {step.type}
                                                </span>
                                            </div>
                                            <span className="text-slate-200 text-sm font-medium font-mono">{step.value || step.description}</span>
                                        </div>

                                        <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                                            <button
                                                onClick={() => handleDeleteStep(index)}
                                                className="p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add Step Form (Bottom Fixed) */}
                            <div className="p-6 bg-white/5 border-t border-white/5">
                                <div className="flex gap-4 items-center">
                                    <div className="relative">
                                        <GlassDropdown
                                            value={newStep.type}
                                            onChange={(newType) => setNewStep({ ...newStep, type: newType })}
                                            options={[
                                                { value: 'GOTO', label: '🌐 GOTO URL' },
                                                { value: 'CLICK_SELECTOR', label: '🖱️ CLICK (Selector)' },
                                                { value: 'TYPE', label: '⌨️ TYPE Text' },
                                                { value: 'WAIT_UNTIL', label: '⏳ WAIT Condition' },
                                                { value: 'SLEEP', label: '💤 SLEEP (Time)' }
                                            ]}
                                            buttonClassName="appearance-none bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white focus:outline-none focus:border-red-500 font-medium cursor-pointer hover:bg-black/60 transition-colors"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
                                    </div>

                                    <input
                                        type="text"
                                        placeholder="Enter value (e.g. https://google.com or #submit-btn)"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 placeholder-slate-600 transition-all font-mono text-sm"
                                        value={newStep.value}
                                        onChange={(e) => setNewStep({ ...newStep, value: e.target.value })}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                                    />

                                    <button
                                        onClick={handleAddStep}
                                        className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-900/20 hover:shadow-red-900/40 hover:-translate-y-0.5 transition-all active:translate-y-0 flex items-center gap-2"
                                    >
                                        <Plus size={18} /> Add Step
                                    </button>
                                </div>
                                {newStep.type === 'CLICK_SELECTOR' && (
                                    <div className="text-xs text-orange-300 mt-2 flex items-center gap-2 px-2">
                                        <span>💡 Tip: Don't know the selector? Use the <strong className="text-white border border-white/20 px-1 rounded bg-white/5">🔴 Record</strong> button above to auto-capture clicks.</span>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 p-10 text-center">
                            <div className="w-20 h-20 mb-6 rounded-full bg-white/5 flex items-center justify-center text-4xl border border-white/5 animate-pulse">
                                👆
                            </div>
                            <h3 className="text-xl font-bold text-slate-300 mb-2">Select a Recipe</h3>
                            <p className="max-w-xs text-sm">Choose an automation workflow from the left sidebar to start editing or training.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AutomationBuilder;
