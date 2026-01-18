import { useState, useEffect } from 'react'
import './App.css'
import UserPanel from './UserPanel'
// import { auth, db } from './firebase' 
import { auth } from './firebase' // Only Auth
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'

const FIREBASE_PROJECT_ID = "content-auto-post";
const API_KEY = "AIzaSyDGEnGxtkor9PwWkgjiQvrr9SmZ_IHKapE"; // Public Key

// Helper to get Token
const getAuthToken = async () => {
  if (auth.currentUser) return await auth.currentUser.getIdToken();
  return null;
}

function App() {
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [recipeName, setRecipeName] = useState("")
  const [recipeType, setRecipeType] = useState("monitor") // Default type
  const [statusMessage, setStatusMessage] = useState("Ready")
  const [logs, setLogs] = useState([]) // 📜 Logs State
  const [recordedSteps, setRecordedSteps] = useState([]) // 💾 Raw Steps for Saving
  const [savedRecipes, setSavedRecipes] = useState([]) // 📚 List of Recipes
  const [activeTab, setActiveTab] = useState('record') // 'record' | 'recipes'

  // --- NEW: Dual Mode State ---
  const [appMode, setAppMode] = useState(null); // 'admin' | 'user' | null
  const [projectKey, setProjectKey] = useState(null); // Decoded key data
  const [keyInput, setKeyInput] = useState(''); // Key input field

  // Helper: Decode base64 key (Format: userId:ADMIN|USER:timestamp:random)
  const decodeKey = (key) => {
    try {
      const decoded = atob(key);
      const parts = decoded.split(':');
      if (parts.length >= 2) {
        return {
          userId: parts[0],
          isAdmin: parts[1] === 'ADMIN'
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  // 1. Initial Setup: Auth Anonymously & Load State
  useEffect(() => {
    const init = async () => {
      try {
        // Check for stored User Mode key first
        chrome.storage.local.get(['storedProjectKey'], (result) => {
          if (result.storedProjectKey) {
            const decoded = decodeKey(result.storedProjectKey);
            if (decoded) {
              console.log(`🔑 Found stored key (Admin: ${decoded.isAdmin}), entering User Mode`);
              setProjectKey(decoded);
              setAppMode('user');
              return; // Skip login screen
            }
          }

          // No key found - leave appMode as null to show login screen
          console.log("📋 No stored key, showing login options");
          // DO NOT call initAdminMode() here - let user choose
        });

      } catch (err) {
        console.error("Init Error:", err);
        setStatusMessage("Connection Failed: " + err.message);
      }
    };

    const initAdminMode = async () => {
      // Check if already signed in
      if (!auth.currentUser) {
        const userCred = await signInAnonymously(auth);
        setUser(userCred.user);
        console.log("Agent Connected (Anonymous):", userCred.user.uid);
      } else {
        setUser(auth.currentUser);
      }

      setAppMode('admin');

      // Listen for Auth Changes
      onAuthStateChanged(auth, (u) => {
        if (u) setUser(u);
        else setUser(null);
      });

      // Load Saved Project ID
      chrome.storage.local.get(['selectedProjectId'], (result) => {
        if (result.selectedProjectId) {
          setSelectedProjectId(result.selectedProjectId);
        }
      });
    };

    init();
  }, [])

  // 2. Fetch Projects (REST API)
  useEffect(() => {
    if (user) {
      setIsLoadingProjects(true);
      const fetchProjects = async () => {
        try {
          const token = await getAuthToken();
          const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/projects?key=${API_KEY}`;

          const res = await fetch(url, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
          const data = await res.json();

          if (data.documents) {
            const projectList = data.documents.map(doc => ({
              id: doc.name.split('/').pop(),
              ...doc.fields
            })).map(p => ({
              id: p.id,
              name: p.name?.stringValue || p.title?.stringValue || p.id
            }));
            setProjects(projectList);
          } else {
            setProjects([]);
          }
        } catch (error) {
          console.error("Error fetching projects:", error);
          setStatusMessage("Error loading projects (Check Permissions)");
        } finally {
          setIsLoadingProjects(false);
        }
      };
      fetchProjects();
    }
  }, [user]);

  // 3. Listen for Recorded Steps
  useEffect(() => {
    const handleMessage = (request) => {
      if (request.action === "RECORD_STEP") {
        const timestamp = new Date().toLocaleTimeString();
        const action = request.payload?.action || "ACTION";
        const selector = request.payload?.selector || "Unknown";
        const newLog = `[${timestamp}] ${action.toUpperCase()}: ${selector.substring(0, 25)}...`;
        setLogs(prev => [newLog, ...prev]);

        // Save Raw Step
        if (isRecording) {
          setRecordedSteps(prev => [...prev, request.payload]);
        }
      }
      if (request.action === "START_RECORDING") {
        setLogs(prev => [`[SYSTEM] Started Recording...`, ...prev]);
      }
      if (request.action === "STOP_RECORDING") {
        setLogs(prev => [`[SYSTEM] Stopped Recording.`, ...prev]);
      }
      // ⚠️ ERROR HANDLING from Background
      if (request.action === "SCRIPT_ERROR") {
        const msg = request.message || "Unknown Error";
        setLogs(prev => [`[ERROR] ${msg}`, ...prev]);
        setStatusMessage(msg); // Show in Status Bar
        alert(msg); // Force user attention
        setIsRecording(false);
      }
      if (request.action === "ASSET_READY") {
        const fileName = request.payload?.filename?.split(/[/\\]/).pop();
        setLogs(prev => [`[ASSET] 📦 Caught: ${fileName}`, ...prev]);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [isRecording]);

  // 3. Save Selection
  const handleProjectSelect = (e) => {
    const pId = e.target.value;
    setSelectedProjectId(pId);
    chrome.storage.local.set({ selectedProjectId: pId });
  };


  // 4. Start Recording
  const startRecording = async () => {
    if (!recipeName) return alert("Please enter a name!")
    if (!selectedProjectId) return alert("Please select a project first!");

    try {
      // 1. Get Current Tab URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const startUrl = tab?.url || "";

      const newRecipeId = `recipe_${Date.now()}`

      await chrome.storage.local.set({
        isRecording: true,
        currentRecipeId: newRecipeId,
        recipeType: recipeType,
        recipeName: recipeName,
        projectId: selectedProjectId,
        startUrl: startUrl // SAVE START URL
      });

      setIsRecording(true)

      // Immediate User Feedback
      setLogs(prev => [`[SYSTEM] Starting on: ${startUrl}`, ...prev]);

      chrome.runtime.sendMessage({
        action: "START_RECORDING",
        recipeId: newRecipeId,
        recipeType: recipeType,
        projectId: selectedProjectId
      })
    } catch (error) {
      console.error("Start Error:", error);
      alert("Start Error: " + error.message);
    }
  }

  // 4. Fetch Recipes (REST API Polling)
  useEffect(() => {
    let intervalId;

    const fetchRecipes = async () => {
      if (!selectedProjectId) return;

      // SYNC TO STORAGE
      chrome.storage.local.set({ activeProjectId: selectedProjectId });

      try {
        const token = await getAuthToken();
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/projects/${selectedProjectId}/recipes?key=${API_KEY}`;

        const res = await fetch(url, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();

        if (data.documents) {

          // Helper: Firestore Value -> JS
          const fromValue = (val) => {
            if (!val) return null;
            if (val.mapValue) {
              const out = {};
              const fields = val.mapValue.fields || {};
              for (const k in fields) out[k] = fromValue(fields[k]);
              return out;
            }
            if (val.arrayValue) {
              return (val.arrayValue.values || []).map(fromValue);
            }
            if (val.stringValue !== undefined) return val.stringValue;
            if (val.integerValue !== undefined) return Number(val.integerValue);
            if (val.doubleValue !== undefined) return Number(val.doubleValue);
            if (val.booleanValue !== undefined) return val.booleanValue;
            if (val.timestampValue !== undefined) return val.timestampValue;
            if (val.nullValue !== undefined) return null;
            return val;
          };

          const list = data.documents.map(doc => {
            const f = doc.fields;
            return {
              id: doc.name.split('/').pop(),
              name: f.name?.stringValue || "Untitled",
              type: f.type?.stringValue || "MONITOR",
              steps: f.steps?.arrayValue?.values?.map(fromValue) || [],
              startUrl: f.startUrl?.stringValue || "", // ADD THIS LINE
              createdAt: f.createdAt?.timestampValue
            };
          });

          // Client-side sort
          list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
          setSavedRecipes(list);
        } else {
          setSavedRecipes([]);
        }

      } catch (err) {
        console.error("Recipe List Error:", err);
        setLogs(prev => [`[ERROR] List Load: ${err.message}`, ...prev]);
      }
    };

    if (selectedProjectId) {
      fetchRecipes(); // Initial Fetch
      intervalId = setInterval(fetchRecipes, 15000); // Poll every 15 seconds (reduced from 5s to save quota)
    }

    return () => clearInterval(intervalId);
  }, [selectedProjectId]);

  const stopRecording = async () => {
    await chrome.storage.local.set({ isRecording: false, currentRecipeId: null, recipeType: null, recipeName: null, projectId: null })
    setIsRecording(false)
    chrome.runtime.sendMessage({ action: "STOP_RECORDING" })

    // SAVE TO FIRESTORE (REST API)
    if (recordedSteps.length === 0) {
      alert("No steps recorded! Cancelled save.");
      return;
    }

    try {
      const token = await getAuthToken();

      // Get Start URL from Storage
      const { startUrl } = await chrome.storage.local.get(['startUrl']);

      // Helper: Simple JS -> Firestore Value
      const toValue = (val) => {
        if (val === null || val === undefined) return { nullValue: null };
        if (typeof val === 'string') return { stringValue: val };
        if (typeof val === 'number') {
          if (Number.isInteger(val)) return { integerValue: val };
          return { doubleValue: val };
        }
        if (typeof val === 'boolean') return { booleanValue: val };
        if (Array.isArray(val)) return { arrayValue: { values: val.map(toValue) } };
        if (typeof val === 'object') {
          const fields = {};
          for (const k in val) fields[k] = toValue(val[k]);
          return { mapValue: { fields } };
        }
        return { stringValue: String(val) };
      };

      const body = {
        fields: {
          name: toValue(recipeName),
          type: toValue(recipeType),
          steps: toValue(recordedSteps),
          startUrl: toValue(startUrl || ""), // SAVE TO FIRESTORE
          createdAt: { timestampValue: new Date().toISOString() },
          createdBy: toValue(user.uid)
        }
      };

      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/projects/${selectedProjectId}/recipes?key=${API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(res.statusText + " " + await res.text());
      const data = await res.json();

      setStatusMessage(`Saved: ${recipeName}`);
      setRecipeName(""); // Reset
      setLogs(prev => [`[SUCCESS] Saved recipe: ${data.name?.split('/').pop()}`, ...prev]);
      setRecordedSteps([]);
    } catch (e) {
      console.error("Save Error:", e);
      alert("Failed to save: " + e.message);
    }
  }

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  // 5. RENAME RECIPE
  const renameRecipe = async (recipeId, currentName) => {
    const newName = prompt("Enter new name:", currentName);
    if (!newName || newName === currentName) return;

    try {
      const token = await getAuthToken();
      // Helper: Simple JS -> Firestore Value (Duplicate for now, should be refactored)
      const toValue = (val) => ({ stringValue: String(val) });

      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/projects/${selectedProjectId}/recipes/${recipeId}?updateMask.fieldPaths=name&key=${API_KEY}`;

      await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          fields: {
            name: toValue(newName)
          }
        })
      });

      // Optimistic Update
      setSavedRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, name: newName } : r));
    } catch (e) {
      console.error("Rename Error:", e);
      alert("Failed to rename: " + e.message);
    }
  };

  // 6. DELETE RECIPE
  const deleteRecipe = async (recipeId) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;

    try {
      const token = await getAuthToken();
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/projects/${selectedProjectId}/recipes/${recipeId}?key=${API_KEY}`;

      await fetch(url, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      // Optimistic Update
      setSavedRecipes(prev => prev.filter(r => r.id !== recipeId));
    } catch (e) {
      console.error("Delete Error:", e);
      alert("Failed to delete: " + e.message);
    }
  };

  // --- KEY AUTH HANDLERS ---
  const handleKeyLogin = () => {
    const decoded = decodeKey(keyInput.trim());
    if (!decoded) {
      alert('Invalid key format. Please check and try again.');
      return;
    }
    // Store key and set mode based on isAdmin flag
    chrome.storage.local.set({
      storedProjectKey: keyInput.trim()
    });
    setProjectKey(decoded);

    // If admin key, check if user wants admin mode or user mode
    if (decoded.isAdmin) {
      setAppMode('user'); // Start in user mode, can switch to admin from UserPanel
    } else {
      setAppMode('user');
    }
    console.log(`🔑 Key verified - Admin: ${decoded.isAdmin}, User: ${decoded.userId}`);
  };

  const handleUserLogout = () => {
    chrome.storage.local.remove(['storedProjectKey', 'activeProjectId']);
    setProjectKey(null);
    setAppMode(null);
    setKeyInput('');
    // Reload to reset state
    window.location.reload();
  };

  // Handler for admin to enter full admin mode from UserPanel
  const handleEnterAdminMode = async (projectId, projectName) => {
    // Init firebase auth for admin features
    if (!auth.currentUser) {
      const userCred = await signInAnonymously(auth);
      setUser(userCred.user);
    } else {
      setUser(auth.currentUser);
    }
    
    // Set project from UserPanel to skip Select Project screen
    if (projectId) {
      setSelectedProjectId(projectId);
      chrome.storage.local.set({ selectedProjectId: projectId });
      // Add project to list if not exists
      if (!projects.find(p => p.id === projectId)) {
        setProjects(prev => [...prev, { id: projectId, name: projectName || projectId }]);
      }
    }
    
    setAppMode('admin');
  };

  // --- RENDER ---

  // 🔵 0. USER MODE (Key-based)
  if (appMode === 'user' && projectKey) {
    return (
      <UserPanel
        keyData={projectKey}
        onLogout={handleUserLogout}
        onEnterAdminMode={handleEnterAdminMode}
      />
    );
  }

  // 🟡 1. MODE SELECTION (Login Screen)
  if (appMode === null) {
    return (
      <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 text-white p-6">

        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center space-y-6 text-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-red-600 to-orange-500 rounded-2xl shadow-xl shadow-red-900/40 flex items-center justify-center transform rotate-3 hover:rotate-6 transition-transform duration-300">
            <span className="text-4xl">🤖</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Content Auto Post
            </h1>
            <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest font-semibold">
              Agent Control Panel
            </p>
          </div>

          <div className="w-full max-w-xs space-y-4">
            {/* Key Input */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg blur opacity-30 group-hover:opacity-75 transition duration-200"></div>
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste User Key Here..."
                className="relative w-full bg-slate-900/90 text-white placeholder-slate-500 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 text-sm font-medium shadow-xl"
              />
            </div>

            <button
              onClick={handleKeyLogin}
              disabled={!keyInput.trim()}
              className={`
                w-full py-3 px-4 rounded-lg font-bold text-sm shadow-lg transition-all duration-200
                ${keyInput.trim()
                  ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white transform hover:-translate-y-0.5'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
              `}
            >
              {keyInput.trim() ? '🚀 Connect Agent' : 'Enter Key to Connect'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-[10px] text-slate-600 font-mono">
            v2.0.0 • Secure Connection
          </p>
        </div>
      </div>
    );
  }

  // 🟡 2. ADMIN MODE: Connecting...
  if (appMode === 'admin' && !user) {
    return (
      <div className="login-container" style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>
        <h2 style={{ marginBottom: '1rem' }}>Connecting...</h2>
        {statusMessage && statusMessage !== "Ready" && (
          <div style={{ background: '#7f1d1d', padding: '10px', borderRadius: '4px', fontSize: '0.9rem', marginBottom: '1rem' }}>
            {statusMessage}
          </div>
        )}
        <div className="loading-spinner" style={{ border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid white', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // 🟡 2. PROJECT SELECTION
  if (!selectedProjectId) {
    return (
      <div className="project-select-container" style={{ padding: '20px', color: 'white' }}>
        <h3>Select Project</h3>
        {isLoadingProjects && <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Loading projects...</p>}

        <select
          onChange={handleProjectSelect}
          className="project-dropdown"
          style={{
            width: '100%',
            padding: '10px',
            margin: '20px 0',
            background: '#334155',
            color: 'white',
            border: '1px solid #475569',
            borderRadius: '6px'
          }}
          defaultValue=""
        >
          <option value="" disabled>-- Choose a Project --</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name || p.title || p.id} ({p.id.substring(0, 4)})</option>
          ))}
        </select>

        {projects.length === 0 && !isLoadingProjects && (
          <div style={{ background: '#450a0a', padding: '10px', borderRadius: '6px', fontSize: '12px', color: '#fca5a5' }}>
            No projects found. Check Firestore Rules (allow read) if you have projects.
          </div>
        )}
      </div>
    )
  }

  // 🟢 3. MAIN UI
  return (
    <>
      <header className="header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ fontSize: '1rem', margin: 0 }}>Auto Post Agent</h1>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>PRJ: <b>{projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId.substring(0, 6)}</b></span>
        </div>
        <button 
          onClick={() => { 
            setSelectedProjectId(null); 
            chrome.storage.local.remove('selectedProjectId'); 
            setAppMode('user'); // กลับไปหน้า User Mode (Select Project)
          }} 
          style={{ 
            background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(249,115,22,0.2))',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#f87171',
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.target.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(249,115,22,0.3))'}
          onMouseOut={(e) => e.target.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(249,115,22,0.2))'}
        >
          ← Back
        </button>
      </header>

      {/* 🟢 TAB NAVIGATION */}
      <div className="tab-nav" style={{ display: 'flex', background: '#0f172a', borderBottom: '1px solid #334155' }}>
        <button
          onClick={() => setActiveTab('record')}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'record' ? '#1e293b' : 'transparent',
            color: activeTab === 'record' ? '#fff' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'record' ? '2px solid #ef4444' : 'none',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🔴 Record
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'recipes' ? '#1e293b' : 'transparent',
            color: activeTab === 'recipes' ? '#fff' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'recipes' ? '2px solid #ef4444' : 'none',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          📚 Recipes ({savedRecipes.length})
        </button>
      </div>

      <div className="main-content">

        {/* 🎬 TAB 1: RECORDER */}
        {activeTab === 'record' && (
          <>
            <div className="card">
              <div className="input-group">
                <label>Recipe Type</label>
                <div className="type-toggle">
                  <div
                    className={`toggle-btn ${recipeType === 'PRODUCER' ? 'active' : ''}`}
                    onClick={() => !isRecording && setRecipeType('PRODUCER')}
                  >
                    Producer
                  </div>
                  <div
                    className={`toggle-btn ${recipeType === 'DISTRIBUTOR' ? 'active' : ''}`}
                    onClick={() => !isRecording && setRecipeType('DISTRIBUTOR')}
                  >
                    Distributor
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label>Recipe Name</label>
                <input
                  type="text"
                  placeholder="e.g. TikTok Upload Flow"
                  value={recipeName}
                  onChange={(e) => setRecipeName(e.target.value)}
                  disabled={isRecording}
                />
              </div>
            </div>

            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              {isRecording ? '⏹ STOP RECORDING' : '🔴 START RECORDING'}
            </button>

            {isRecording && (
              <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                Recording to <b>{selectedProjectId}</b>
                <br />Status: {statusMessage}
              </div>
            )}

            {/* 📜 LIVE LOG CONSOLE */}
            <div className="log-console" style={{
              flex: 1,
              marginTop: '1rem',
              background: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '6px',
              padding: '10px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#22c55e',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              maxHeight: '200px'
            }}>
              <div style={{ borderBottom: '1px solid #333', paddingBottom: '4px', marginBottom: '4px', color: '#888', fontWeight: 'bold' }}>
                TERMINAL OUTPUT
              </div>
              {logs.length === 0 ? (
                <span style={{ color: '#444' }}>Waiting for actions...</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))
              )}
            </div>
          </>
        )}

        {/* 📚 TAB 2: RECIPE LIST */}
        {activeTab === 'recipes' && (
          <div className="recipe-list" style={{ marginTop: '0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              {savedRecipes.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                  No recipes saved yet. Go record some!
                </div>
              )}
              {savedRecipes.map(recipe => (
                <div key={recipe.id} style={{
                  background: '#1e293b',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ flex: 1, overflow: 'hidden', marginRight: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recipe.name}</div>
                      <button onClick={() => renameRecipe(recipe.id, recipe.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0', fontSize: '0.8rem' }}>✏️</button>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{recipe.type} • {recipe.steps?.length || 0} steps</div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      onClick={() => alert(`Review Mode:\n${JSON.stringify(recipe.steps, null, 2)}`)}
                      style={{
                        background: '#334155',
                        color: 'white',
                        border: 'none',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                      title="View Steps"
                    >
                      🔍
                    </button>
                    <button
                      onClick={() => deleteRecipe(recipe.id)}
                      style={{
                        background: '#450a0a',
                        color: '#fca5a5',
                        border: '1px solid #7f1d1d',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                      title="Delete Recipe"
                    >
                      🗑️
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Run ${recipe.name}?`)) {
                          chrome.runtime.sendMessage({
                            action: "RUN_RECIPE",
                            recipeId: recipe.id,
                            recipe: recipe
                          });
                        }
                      }}
                      style={{
                        background: '#22c55e',
                        color: 'black',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.75rem'
                      }}
                    >
                      ▶ RUN
                    </button>
                  </div>
                </div>

              ))}
            </div>
          </div>
        )}

      </div>
    </>
  )
}
export default App
