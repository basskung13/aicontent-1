import { useState, useEffect } from 'react';
import './App.css';
import { auth } from './firebase';
import { signInAnonymously } from 'firebase/auth';

/**
 * UserPanel - Extension UI for User Mode (Key-based auth)
 * - Shows list of user's projects to select from
 * - Shows job queue for selected project
 * - NO recording features (unless isAdmin)
 * 
 * Props:
 * - keyData: { userId, isAdmin } from decoded key
 * - onLogout: Callback to clear key and return to login
 * - onEnterAdminMode: Callback when admin user wants full access
 */
export default function UserPanel({ keyData, onLogout, onEnterAdminMode }) {
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [selectedProjectName, setSelectedProjectName] = useState('');
    const [jobs, setJobs] = useState([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isLoadingJobs, setIsLoadingJobs] = useState(false);
    const [error, setError] = useState(null);

    const FIREBASE_PROJECT_ID = "content-auto-post";
    const API_KEY = "AIzaSyDGEnGxtkor9PwWkgjiQvrr9SmZ_IHKapE";
    const CURRENT_VERSION = "1.0.0"; // ต้องตรงกับ manifest.json
    const FRONTEND_URL = "https://content-auto-post.web.app"; // URL ของ Frontend

    const { userId, isAdmin } = keyData || {};

    // Version Check States
    const [hasUpdate, setHasUpdate] = useState(false);
    const [latestVersion, setLatestVersion] = useState(null);
    const [updateDismissed, setUpdateDismissed] = useState(false);

    // Desktop Agent Status States
    const [agentStatus, setAgentStatus] = useState('unknown'); // 'online' | 'offline' | 'unknown'
    const [agentLastSeen, setAgentLastSeen] = useState(null);
    const [showAgentCommand, setShowAgentCommand] = useState(false);
    const [commandCopied, setCommandCopied] = useState(false);

    // Helper to get Auth Token
    const getAuthToken = async () => {
        try {
            if (!auth.currentUser) {
                await signInAnonymously(auth);
            }
            return await auth.currentUser.getIdToken();
        } catch (e) {
            console.error('Auth error:', e);
            return null;
        }
    };

    // Version Check on Mount
    useEffect(() => {
        const checkVersion = async () => {
            try {
                const token = await getAuthToken();
                const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/extension?key=${API_KEY}`;
                const res = await fetch(url, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const data = await res.json();
                
                if (data.fields?.latestVersion?.stringValue) {
                    const serverVersion = data.fields.latestVersion.stringValue;
                    if (serverVersion !== CURRENT_VERSION) {
                        setLatestVersion(serverVersion);
                        setHasUpdate(true);
                        console.log(`🆕 Update available: ${CURRENT_VERSION} → ${serverVersion}`);
                    }
                }
            } catch (err) {
                console.log('Version check skipped:', err.message);
            }
        };
        checkVersion();
    }, []);

    // Fetch user's projects on mount
    useEffect(() => {
        console.log('🔑 UserPanel mounted with keyData:', keyData);
        console.log('👤 userId from key:', userId);
        console.log('👑 isAdmin:', isAdmin);

        if (!userId) {
            console.error('❌ No userId in keyData!');
            setError('Invalid key: no user ID');
            setIsLoadingProjects(false);
            return;
        }

        const fetchProjects = async () => {
            try {
                console.log('🔄 Fetching projects for userId:', userId);
                const token = await getAuthToken();
                console.log('🎫 Got auth token:', token ? 'Yes' : 'No');
                
                const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}/projects?key=${API_KEY}`;
                console.log('📡 Fetch URL:', url);
                
                const res = await fetch(url, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                
                console.log('📥 Response status:', res.status);
                const data = await res.json();
                console.log('📦 API Response:', data);

                if (data.error) {
                    console.error('❌ Firestore Error:', data.error);
                    setError(`Firestore Error: ${data.error.message}`);
                    setIsLoadingProjects(false);
                    return;
                }

                if (data.documents && data.documents.length > 0) {
                    console.log(`✅ Found ${data.documents.length} projects`);
                    const projectList = data.documents.map(doc => ({
                        id: doc.name.split('/').pop(),
                        name: doc.fields?.name?.stringValue || doc.name.split('/').pop().substring(0, 12),
                        status: doc.fields?.status?.stringValue || 'idle'
                    }));
                    console.log('📋 Project list:', projectList);
                    setProjects(projectList);

                    // Auto-select first project
                    if (projectList.length > 0) {
                        setSelectedProjectId(projectList[0].id);
                        setSelectedProjectName(projectList[0].name);
                        chrome.storage.local.set({ 
                            activeProjectId: projectList[0].id,
                            activeProjectName: projectList[0].name 
                        });
                    }
                } else {
                    console.warn('⚠️ No documents found in response');
                    console.warn('⚠️ Check if userId matches a real user in Firestore:', userId);
                    setProjects([]);
                }
                setIsLoadingProjects(false);
            } catch (err) {
                console.error('❌ Error fetching projects:', err);
                setError(err.message);
                setIsLoadingProjects(false);
            }
        };

        fetchProjects();

        // Auto-refresh projects every 5 seconds to sync status
        const refreshInterval = setInterval(() => {
            fetchProjects();
        }, 5000);

        return () => clearInterval(refreshInterval);
    }, [userId, isAdmin]);

    // Fetch jobs when project is selected
    useEffect(() => {
        if (!selectedProjectId || !userId) return;

        const fetchJobs = async () => {
            setIsLoadingJobs(true);
            console.log(`🔍 Fetching jobs for projectId: ${selectedProjectId}`);
            try {
                const token = await getAuthToken();
                // Use simple GET to fetch all jobs, then filter client-side
                const jobsUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agent_jobs?key=${API_KEY}`;
                const jobsRes = await fetch(jobsUrl, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const jobsData = await jobsRes.json();
                console.log(`📦 Jobs API Response:`, jobsData);

                if (jobsData.documents && Array.isArray(jobsData.documents)) {
                    const jobList = jobsData.documents
                        .filter(doc => doc.fields?.projectId?.stringValue === selectedProjectId)
                        .map(doc => {
                            console.log(`📄 Job found:`, doc.fields);
                            return {
                                id: doc.name.split('/').pop(),
                                status: doc.fields?.status?.stringValue || 'unknown',
                                scheduledTime: doc.fields?.scheduledTime?.stringValue,
                                createdAt: doc.fields?.createdAt?.timestampValue
                            };
                        })
                        .slice(0, 20); // Limit to 20
                    console.log(`✅ Parsed ${jobList.length} jobs for project ${selectedProjectId}`);
                    setJobs(jobList);
                } else {
                    console.log(`⚠️ No documents in response`);
                    setJobs([]);
                }
            } catch (err) {
                console.error('Error fetching jobs:', err);
            } finally {
                setIsLoadingJobs(false);
            }
        };

        fetchJobs();
        const interval = setInterval(fetchJobs, 30000);
        return () => clearInterval(interval);
    }, [selectedProjectId, userId]);

    // Check Desktop Agent Status
    useEffect(() => {
        if (!selectedProjectId) return;

        const checkAgentStatus = async () => {
            try {
                const token = await getAuthToken();
                const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agent_status/${selectedProjectId}?key=${API_KEY}`;
                const res = await fetch(url, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const data = await res.json();
                
                if (data.fields && data.fields.lastSeen) {
                    const lastSeen = new Date(data.fields.lastSeen.timestampValue);
                    const now = new Date();
                    const diffSeconds = (now - lastSeen) / 1000;
                    
                    setAgentLastSeen(lastSeen);
                    // ถ้า lastSeen ภายใน 60 วินาที = online
                    setAgentStatus(diffSeconds < 60 ? 'online' : 'offline');
                } else {
                    setAgentStatus('offline');
                }
            } catch (err) {
                console.error('Error checking agent status:', err);
                setAgentStatus('unknown');
            }
        };

        checkAgentStatus();
        const interval = setInterval(checkAgentStatus, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, [selectedProjectId]);

    // Launch Desktop Agent via URL protocol
    const launchDesktopAgent = () => {
        window.open('autopost://start', '_blank');
        // Check status after 5 seconds
        setTimeout(() => {
            setAgentStatus('unknown');
        }, 5000);
    };

    // Copy agent command to clipboard (fallback)
    const copyAgentCommand = () => {
        const command = `cd /d C:\\content-auto-post\\legacy_desktop_agent && python main.py`;
        navigator.clipboard.writeText(command);
        setCommandCopied(true);
        setTimeout(() => setCommandCopied(false), 2000);
    };

    const handleSelectProject = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        if (project) {
            setSelectedProjectId(project.id);
            setSelectedProjectName(project.name);
            // Save to chrome.storage for persistence
            chrome.storage.local.set({ 
                activeProjectId: project.id,
                activeProjectName: project.name 
            });
            console.log(`📌 Saved active project: ${project.name} (${project.id})`);
        }
    };

    // Load saved project on mount
    useEffect(() => {
        chrome.storage.local.get(['activeProjectId', 'activeProjectName'], (result) => {
            if (result.activeProjectId && projects.length > 0) {
                const savedProject = projects.find(p => p.id === result.activeProjectId);
                if (savedProject) {
                    setSelectedProjectId(savedProject.id);
                    setSelectedProjectName(savedProject.name);
                    console.log(`📂 Restored active project: ${savedProject.name}`);
                }
            }
        });
    }, [projects]);

    // Toggle project status (Run/Stop)
    const toggleProjectStatus = async (e, project) => {
        e.stopPropagation(); // Prevent dropdown from closing
        const newStatus = project.status === 'running' ? 'idle' : 'running';
        
        try {
            const token = await getAuthToken();
            const docPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}/projects/${project.id}`;
            const url = `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=status&key=${API_KEY}`;
            
            const res = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    fields: {
                        status: { stringValue: newStatus }
                    }
                })
            });
            
            if (res.ok) {
                // Update local state
                setProjects(prev => prev.map(p => 
                    p.id === project.id ? { ...p, status: newStatus } : p
                ));
                console.log(`✅ Project ${project.name} status changed to: ${newStatus}`);
            } else {
                console.error('Failed to update status:', await res.text());
            }
        } catch (err) {
            console.error('Error toggling status:', err);
        }
    };

    // Status badge colors
    const getStatusColor = (status) => {
        switch (status?.toUpperCase()) {
            case 'PENDING': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'RUNNING': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'COMPLETED': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'FAILED': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    if (error) {
        return (
            <div className="p-4 text-center">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                    <p className="text-red-400 text-sm">❌ {error}</p>
                </div>
                <button
                    onClick={onLogout}
                    className="text-sm text-gray-400 hover:text-white underline"
                >
                    Enter Different Key
                </button>
            </div>
        );
    }

    const [activeTab, setActiveTab] = useState('projects'); // 'projects' | 'jobs' | 'record'
    const [recordSubTab, setRecordSubTab] = useState('record'); // 'record' | 'library' | 'builder'
    
    // Recording States
    const [isRecording, setIsRecording] = useState(false);
    const [recipeName, setRecipeName] = useState('');
    const [recipeType, setRecipeType] = useState('ONCE');
    const [logs, setLogs] = useState([]);
    const [recordedSteps, setRecordedSteps] = useState([]);

    // Block Library States
    const [savedBlocks, setSavedBlocks] = useState([]);
    const [loadingBlocks, setLoadingBlocks] = useState(false);

    // Template Builder States
    const [templateName, setTemplateName] = useState('');
    const [templateBlocks, setTemplateBlocks] = useState([]); // Blocks in current template
    const [savedTemplates, setSavedTemplates] = useState([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    // Testing States
    const [isTestingBlock, setIsTestingBlock] = useState(false);
    const [testingBlockName, setTestingBlockName] = useState('');
    const [testStatus, setTestStatus] = useState(''); // 'running' | 'completed' | 'failed'
    const [currentStepInfo, setCurrentStepInfo] = useState({ index: 0, total: 0, action: '', selector: '' });

    // Code Viewer/Editor States
    const [isCodeViewerOpen, setIsCodeViewerOpen] = useState(false);
    const [viewingBlockCode, setViewingBlockCode] = useState(null);
    const [viewingBlockId, setViewingBlockId] = useState(null);
    const [editedCodeText, setEditedCodeText] = useState('');
    const [codeCopied, setCodeCopied] = useState(false);
    const [isSavingCode, setIsSavingCode] = useState(false);

    // AI Assistant States
    const [isAIChatOpen, setIsAIChatOpen] = useState(false);
    const [aiMessages, setAiMessages] = useState([]);
    const [aiInput, setAiInput] = useState('');
    const [isAILoading, setIsAILoading] = useState(false);
    const [selectedBlockForAI, setSelectedBlockForAI] = useState(null);
    const [aiEditMode, setAiEditMode] = useState('edit'); // 'edit' | 'copy'
    const [fullBlockData, setFullBlockData] = useState(null); // Full block data with steps

    // Debug Logs States
    const [debugLogs, setDebugLogs] = useState([]);
    const [loadingDebugLogs, setLoadingDebugLogs] = useState(false)

    // Fetch full block data for AI
    const fetchBlockDetails = async (blockId) => {
        try {
            const token = await getAuthToken();
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks/${blockId}?key=${API_KEY}`;
            const res = await fetch(url, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            
            if (data.fields) {
                const parseValue = (val) => {
                    if (val.stringValue !== undefined) return val.stringValue;
                    if (val.integerValue !== undefined) return parseInt(val.integerValue);
                    if (val.doubleValue !== undefined) return val.doubleValue;
                    if (val.booleanValue !== undefined) return val.booleanValue;
                    if (val.arrayValue) return (val.arrayValue.values || []).map(parseValue);
                    if (val.mapValue) {
                        const obj = {};
                        for (const k in val.mapValue.fields) {
                            obj[k] = parseValue(val.mapValue.fields[k]);
                        }
                        return obj;
                    }
                    return null;
                };
                
                return {
                    id: blockId,
                    name: parseValue(data.fields.name),
                    type: parseValue(data.fields.type),
                    steps: parseValue(data.fields.steps) || [],
                    startUrl: parseValue(data.fields.startUrl),
                    variables: parseValue(data.fields.variables) || []
                };
            }
            return null;
        } catch (err) {
            console.error('Error fetching block details:', err);
            return null;
        }
    };

    // Handle AI Chat Send
    const handleAISend = async () => {
        if (!aiInput.trim() || isAILoading || !selectedBlockForAI) return;
        
        const userMessage = aiInput.trim();
        setAiInput('');
        setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsAILoading(true);

        try {
            // Fetch full block data if not already loaded
            let blockData = fullBlockData;
            if (!blockData) {
                blockData = await fetchBlockDetails(selectedBlockForAI.id);
                setFullBlockData(blockData);
            }

            const token = await getAuthToken();
            const response = await fetch(
                `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/aiBlockEditor`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        data: {
                            message: userMessage,
                            blockData: blockData,
                            chatHistory: aiMessages.filter(m => m.role !== 'system'),
                            editMode: aiEditMode
                        }
                    })
                }
            );

            const result = await response.json();
            
            if (result.result?.success) {
                setAiMessages(prev => [...prev, { role: 'assistant', content: result.result.response }]);
                
                // Handle update action if AI wants to update
                if (result.result.updateAction) {
                    await handleAIBlockUpdate(result.result.updateAction, blockData);
                }
            } else {
                throw new Error(result.error?.message || 'AI request failed');
            }
        } catch (err) {
            console.error('AI Chat error:', err);
            setAiMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `❌ เกิดข้อผิดพลาด: ${err.message}\n\nกรุณาลองใหม่อีกครั้งครับ` 
            }]);
        } finally {
            setIsAILoading(false);
        }
    };

    // Handle AI Block Update
    const handleAIBlockUpdate = async (updateAction, originalBlock) => {
        try {
            const token = await getAuthToken();
            const toValue = (val) => {
                if (val === null || val === undefined) return { nullValue: null };
                if (typeof val === 'string') return { stringValue: val };
                if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
                if (typeof val === 'boolean') return { booleanValue: val };
                if (Array.isArray(val)) return { arrayValue: { values: val.map(toValue) } };
                if (typeof val === 'object') {
                    const fields = {};
                    for (const k in val) fields[k] = toValue(val[k]);
                    return { mapValue: { fields } };
                }
                return { stringValue: String(val) };
            };

            if (aiEditMode === 'edit') {
                // Update existing block
                const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks/${originalBlock.id}?updateMask.fieldPaths=steps&key=${API_KEY}`;
                const res = await fetch(url, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify({
                        fields: {
                            steps: toValue(updateAction.steps)
                        }
                    })
                });
                
                if (res.ok) {
                    setAiMessages(prev => [...prev, { 
                        role: 'assistant', 
                        content: `✅ **อัปเดต Block "${originalBlock.name}" สำเร็จแล้วครับ!**\n\n${updateAction.changes}` 
                    }]);
                    fetchBlocks(); // Refresh block list
                }
            } else {
                // Create new copy
                const newName = `${originalBlock.name}_v2`;
                const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks?key=${API_KEY}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: JSON.stringify({
                        fields: {
                            name: toValue(newName),
                            type: toValue(originalBlock.type),
                            category: toValue('general'),
                            steps: toValue(updateAction.steps),
                            startUrl: toValue(originalBlock.startUrl || ''),
                            variables: toValue(originalBlock.variables || []),
                            createdAt: { timestampValue: new Date().toISOString() }
                        }
                    })
                });
                
                if (res.ok) {
                    setAiMessages(prev => [...prev, { 
                        role: 'assistant', 
                        content: `✅ **สร้าง Block ใหม่ "${newName}" สำเร็จแล้วครับ!**\n\nBlock เดิมยังคงอยู่ไม่เปลี่ยนแปลง\n\n${updateAction.changes}` 
                    }]);
                    fetchBlocks(); // Refresh block list
                }
            }
        } catch (err) {
            console.error('Block update error:', err);
            setAiMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `❌ เกิดข้อผิดพลาดในการอัปเดต Block: ${err.message}` 
            }]);
        }
    };

    // Listen for recorded steps and test status updates
    useEffect(() => {
        const handleMessage = (request) => {
            if (request.action === "RECORD_STEP" && isRecording) {
                const timestamp = new Date().toLocaleTimeString();
                const action = request.payload?.action || "ACTION";
                const selector = request.payload?.selector || "Unknown";
                setLogs(prev => [`[${timestamp}] ${action.toUpperCase()}: ${selector.substring(0, 30)}...`, ...prev]);
                setRecordedSteps(prev => [...prev, request.payload]);
            }
            // Listen for test status updates
            if (request.action === "RECIPE_STATUS_UPDATE") {
                const timestamp = new Date().toLocaleTimeString();
                if (request.status === "COMPLETED") {
                    setLogs(prev => [`[${timestamp}] ✅ ทดสอบสำเร็จ: ${request.recipeId}`, ...prev]);
                    setIsTestingBlock(false);
                    setTestStatus('completed');
                    setCurrentStepInfo({ index: 0, total: 0, action: '', selector: '' });
                    setTimeout(() => setTestStatus(''), 3000);
                } else if (request.status === "FAILED") {
                    setLogs(prev => [`[${timestamp}] ❌ ทดสอบล้มเหลว: ${request.error || 'Unknown error'}`, ...prev]);
                    setIsTestingBlock(false);
                    setTestStatus('failed');
                    setCurrentStepInfo({ index: 0, total: 0, action: '', selector: '' });
                    setTimeout(() => setTestStatus(''), 5000);
                } else if (request.status === "STEP_STARTED") {
                    const stepAction = request.stepAction || 'unknown';
                    const stepSelector = request.stepSelector || '';
                    setCurrentStepInfo({
                        index: request.stepIndex,
                        total: request.totalSteps,
                        action: stepAction,
                        selector: stepSelector
                    });
                    setLogs(prev => [`[${timestamp}] ▶ Step ${request.stepIndex + 1}/${request.totalSteps}: ${stepAction} ${stepSelector ? `(${stepSelector.substring(0, 25)}...)` : ''}`, ...prev]);
                } else if (request.status === "STEP_COMPLETED") {
                    setLogs(prev => [`[${timestamp}] ✓ Step ${request.stepIndex + 1} สำเร็จ`, ...prev]);
                }
            }
        };
        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, [isRecording]);

    // Start Recording
    const startRecording = async () => {
        if (!recipeName.trim()) return alert('Please enter a recipe name!');
        if (!selectedProjectId) return alert('Please select a project first!');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const startUrl = tab?.url || '';
        
        await chrome.storage.local.set({
            isRecording: true,
            currentRecipeId: `recipe_${Date.now()}`,
            recipeType,
            recipeName,
            projectId: selectedProjectId,
            startUrl
        });
        
        setIsRecording(true);
        setLogs([`[SYSTEM] Recording started on: ${startUrl}`]);
        setRecordedSteps([]);
        
        chrome.runtime.sendMessage({
            action: "START_RECORDING",
            recipeId: `recipe_${Date.now()}`,
            recipeType,
            projectId: selectedProjectId
        });
    };

    // Stop Recording
    const stopRecording = async () => {
        await chrome.storage.local.set({ isRecording: false });
        setIsRecording(false);
        chrome.runtime.sendMessage({ action: "STOP_RECORDING" });
        setLogs(prev => [`[SYSTEM] Recording stopped. ${recordedSteps.length} steps captured.`, ...prev]);
        
        if (recordedSteps.length === 0) {
            alert('No steps recorded!');
            return;
        }
        
        // Save to Firestore
        try {
            const token = await getAuthToken();
            const storageData = await chrome.storage.local.get(['startUrl']);
            const startUrl = storageData.startUrl || '';
            console.log('📍 Saving Block with startUrl:', startUrl);
            setLogs(prev => [`[SAVE] startUrl: ${startUrl || '(empty)'}`, ...prev]);
            
            const toValue = (val) => {
                if (val === null || val === undefined) return { nullValue: null };
                if (typeof val === 'string') return { stringValue: val };
                if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
                if (typeof val === 'boolean') return { booleanValue: val };
                if (Array.isArray(val)) return { arrayValue: { values: val.map(toValue) } };
                if (typeof val === 'object') {
                    const fields = {};
                    for (const k in val) fields[k] = toValue(val[k]);
                    return { mapValue: { fields } };
                }
                return { stringValue: String(val) };
            };
            
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks?key=${API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    fields: {
                        name: toValue(recipeName),
                        type: toValue(recipeType),
                        category: toValue('general'),
                        steps: toValue(recordedSteps),
                        startUrl: toValue(startUrl || ''),
                        variables: toValue([]),
                        createdAt: { timestampValue: new Date().toISOString() }
                    }
                })
            });
            
            if (res.ok) {
                alert(`✅ Block "${recipeName}" saved successfully!`);
                setRecipeName('');
                setRecordedSteps([]);
            } else {
                throw new Error(await res.text());
            }
        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save: ' + err.message);
        }
    };

    // Inject Variable Marker
    const injectVariable = async (variableName) => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { action: "INJECT_VARIABLE", variable: `{{${variableName}}}` });
            setLogs(prev => [`[VAR] Injected: {{${variableName}}}`, ...prev]);
        }
    };

    // Fetch Saved Blocks from Firestore
    const fetchBlocks = async () => {
        setLoadingBlocks(true);
        try {
            const token = await getAuthToken();
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks?key=${API_KEY}`;
            const res = await fetch(url, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            
            if (data.documents) {
                const blocks = data.documents.map(doc => ({
                    id: doc.name.split('/').pop(),
                    name: doc.fields?.name?.stringValue || doc.name.split('/').pop(),
                    type: doc.fields?.type?.stringValue || 'ONCE',
                    category: doc.fields?.category?.stringValue || 'general'
                }));
                setSavedBlocks(blocks);
                console.log('📦 Loaded blocks:', blocks);
            }
        } catch (err) {
            console.error('Error fetching blocks:', err);
        } finally {
            setLoadingBlocks(false);
        }
    };

    // Fetch Saved Templates from Firestore
    const fetchTemplates = async () => {
        setLoadingTemplates(true);
        try {
            const token = await getAuthToken();
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/recipe_templates?key=${API_KEY}`;
            const res = await fetch(url, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            
            if (data.documents) {
                const templates = data.documents.map(doc => ({
                    id: doc.name.split('/').pop(),
                    name: doc.fields?.name?.stringValue || doc.name.split('/').pop(),
                    blocks: doc.fields?.blocks?.arrayValue?.values?.map(v => v.stringValue) || []
                }));
                setSavedTemplates(templates);
                console.log('📋 Loaded templates:', templates);
            }
        } catch (err) {
            console.error('Error fetching templates:', err);
        } finally {
            setLoadingTemplates(false);
        }
    };

    // Add Block to Template Builder
    const addBlockToTemplate = (blockId) => {
        setTemplateBlocks(prev => [...prev, blockId]);
    };

    // Remove Block from Template Builder
    const removeBlockFromTemplate = (index) => {
        setTemplateBlocks(prev => prev.filter((_, i) => i !== index));
    };

    // Move Block Up/Down in Template
    const moveBlock = (index, direction) => {
        const newBlocks = [...templateBlocks];
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= newBlocks.length) return;
        [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
        setTemplateBlocks(newBlocks);
    };

    // View Block Code
    const viewBlockCode = async (blockId) => {
        try {
            const token = await getAuthToken();
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks/${blockId}?key=${API_KEY}`;
            const res = await fetch(url, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.fields) {
                const blockData = {
                    name: data.fields.name?.stringValue || '',
                    type: data.fields.type?.stringValue || 'ONCE',
                    startUrl: data.fields.startUrl?.stringValue || '',
                    steps: data.fields.steps?.arrayValue?.values?.map(v => {
                        const m = v.mapValue?.fields || {};
                        return {
                            action: m.action?.stringValue || '',
                            selector: m.selector?.stringValue || '',
                            value: m.value?.stringValue || '',
                            delay: parseInt(m.delay?.integerValue || '1000')
                        };
                    }) || []
                };
                setViewingBlockCode(blockData);
                setViewingBlockId(blockId);
                setEditedCodeText(JSON.stringify(blockData, null, 2));
                setIsCodeViewerOpen(true);
                setCodeCopied(false);
            }
        } catch (err) {
            console.error('View block code error:', err);
            alert('ไม่สามารถโหลดโค้ด Block ได้');
        }
    };

    // Save Edited Block Code
    const saveBlockCode = async () => {
        if (!viewingBlockId || !editedCodeText) return;
        
        try {
            setIsSavingCode(true);
            const parsed = JSON.parse(editedCodeText);
            
            // Convert to Firestore format
            const toValue = (val) => {
                if (typeof val === 'string') return { stringValue: val };
                if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
                if (typeof val === 'boolean') return { booleanValue: val };
                if (Array.isArray(val)) return { arrayValue: { values: val.map(toValue) } };
                if (typeof val === 'object' && val !== null) {
                    const fields = {};
                    for (const k in val) fields[k] = toValue(val[k]);
                    return { mapValue: { fields } };
                }
                return { nullValue: null };
            };

            const token = await getAuthToken();
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks/${viewingBlockId}?key=${API_KEY}`;
            
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    fields: {
                        name: toValue(parsed.name),
                        type: toValue(parsed.type),
                        startUrl: toValue(parsed.startUrl || ''),
                        steps: toValue(parsed.steps || [])
                    }
                })
            });

            if (res.ok) {
                alert('✅ บันทึกการแก้ไขสำเร็จ!');
                setViewingBlockCode(parsed);
                fetchBlocks();
            } else {
                throw new Error(await res.text());
            }
        } catch (err) {
            console.error('Save block code error:', err);
            alert('❌ บันทึกล้มเหลว: ' + err.message);
        } finally {
            setIsSavingCode(false);
        }
    };

    // Copy Block Code to Clipboard
    const copyBlockCode = () => {
        if (editedCodeText) {
            navigator.clipboard.writeText(editedCodeText);
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 2000);
        }
    };

    // Delete Block from Firestore
    const deleteBlock = async (blockId, blockName) => {
        if (!confirm(`ลบ Block "${blockName}" หรือไม่?`)) return;
        try {
            const token = await getAuthToken();
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/global_recipe_blocks/${blockId}?key=${API_KEY}`;
            const res = await fetch(url, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (res.ok) {
                alert(`✅ ลบ Block "${blockName}" สำเร็จ!`);
                fetchBlocks();
            } else {
                throw new Error(await res.text());
            }
        } catch (err) {
            console.error('Delete block error:', err);
            alert('ลบ Block ล้มเหลว: ' + err.message);
        }
    };

    // Test Block - Run single block (NO ALERT - starts immediately)
    const testBlock = async (blockName) => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                setLogs(prev => [`[ERROR] ไม่พบ Tab ที่ active`, ...prev]);
                return;
            }
            
            // Set testing state
            setIsTestingBlock(true);
            setTestingBlockName(blockName);
            setTestStatus('running');
            
            setLogs(prev => [`[TEST] 🧪 เริ่มทดสอบ Block: ${blockName}`, ...prev]);
            console.log('🧪 Starting block test:', blockName, 'on tab:', tab.id);
            
            chrome.runtime.sendMessage({
                action: 'TEST_BLOCK',
                blockName: blockName,
                tabId: tab.id
            });
        } catch (err) {
            console.error('Test block error:', err);
            setLogs(prev => [`[ERROR] ทดสอบล้มเหลว: ${err.message}`, ...prev]);
            setIsTestingBlock(false);
            setTestStatus('failed');
        }
    };

    // Stop Test - Send stop signal to background
    const stopTest = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.runtime.sendMessage({
                action: 'STOP_TEST',
                tabId: tab?.id
            });
            setLogs(prev => [`[TEST] ⏹ หยุดการทดสอบ`, ...prev]);
            setIsTestingBlock(false);
            setTestStatus('');
            setCurrentStepInfo({ index: 0, total: 0, action: '', selector: '' });
        } catch (err) {
            console.error('Stop test error:', err);
        }
    };

    // Test Template - Run all blocks in sequence (NO ALERT - starts immediately)
    const testTemplate = async (blocks) => {
        if (!blocks || blocks.length === 0) {
            setLogs(prev => [`[ERROR] ไม่มี Block ใน Template`, ...prev]);
            return;
        }
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                setLogs(prev => [`[ERROR] ไม่พบ Tab ที่ active`, ...prev]);
                return;
            }
            
            // Set testing state
            setIsTestingBlock(true);
            setTestingBlockName(`Template (${blocks.length} blocks)`);
            setTestStatus('running');
            
            setLogs(prev => [`[TEST] 🧪 เริ่มทดสอบ Template (${blocks.length} blocks)`, ...prev]);
            console.log('🧪 Starting template test:', blocks, 'on tab:', tab.id);
            
            chrome.runtime.sendMessage({
                action: 'TEST_TEMPLATE',
                blocks: blocks,
                tabId: tab.id
            });
        } catch (err) {
            console.error('Test template error:', err);
            setLogs(prev => [`[ERROR] ทดสอบล้มเหลว: ${err.message}`, ...prev]);
        }
    };

    // Delete Template from Firestore
    const deleteTemplate = async (templateId, templateName) => {
        if (!confirm(`ลบ Template "${templateName}" หรือไม่?`)) return;
        try {
            const token = await getAuthToken();
            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/recipe_templates/${templateId}?key=${API_KEY}`;
            const res = await fetch(url, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (res.ok) {
                setLogs(prev => [`[OK] ลบ Template "${templateName}" สำเร็จ`, ...prev]);
                fetchTemplates();
            } else {
                throw new Error(await res.text());
            }
        } catch (err) {
            console.error('Delete template error:', err);
            setLogs(prev => [`[ERROR] ลบ Template ล้มเหลว: ${err.message}`, ...prev]);
        }
    };

    // Save Template to Firestore
    const saveTemplate = async () => {
        if (!templateName.trim()) return alert('กรุณาใส่ชื่อ Template!');
        if (templateBlocks.length === 0) return alert('กรุณาเพิ่ม Block อย่างน้อย 1 ตัว!');

        try {
            const token = await getAuthToken();
            const toValue = (val) => {
                if (Array.isArray(val)) return { arrayValue: { values: val.map(v => ({ stringValue: v })) } };
                return { stringValue: String(val) };
            };

            const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/recipe_templates?key=${API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    fields: {
                        name: toValue(templateName),
                        blocks: toValue(templateBlocks),
                        createdAt: { timestampValue: new Date().toISOString() }
                    }
                })
            });

            if (res.ok) {
                alert(`✅ Template "${templateName}" บันทึกสำเร็จ!`);
                setTemplateName('');
                setTemplateBlocks([]);
                fetchTemplates();
            } else {
                throw new Error(await res.text());
            }
        } catch (err) {
            console.error('Save template error:', err);
            alert('บันทึก Template ล้มเหลว: ' + err.message);
        }
    };

    // Load blocks and templates when entering Record tab
    useEffect(() => {
        if (activeTab === 'record' && isAdmin) {
            fetchBlocks();
            fetchTemplates();
        }
    }, [activeTab, isAdmin]);

    // Debug: Log userId on mount
    useEffect(() => {
        console.log('🔑 UserPanel keyData:', keyData);
        console.log('👤 userId from key:', userId);
    }, [keyData, userId]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <header className="bg-gradient-to-r from-red-900/50 to-slate-900 p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-bold text-white">🤖 Auto Post Agent</h1>
                        <p className="text-xs text-gray-400">
                            {isAdmin ? '👑 Admin Mode' : '👤 User Mode'}
                        </p>
                    </div>
                    <button
                        onClick={onLogout}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                        Disconnect
                    </button>
                </div>
            </header>

            {/* Update Available Banner */}
            {hasUpdate && !updateDismissed && (
                <div className="px-4 py-3 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b border-purple-500/30 relative">
                    <div className="flex items-center gap-3">
                        <span className="text-xl animate-bounce">🆕</span>
                        <div className="flex-1">
                            <p className="text-white text-xs font-bold">มี Update ใหม่! v{latestVersion}</p>
                            <p className="text-gray-400 text-[10px]">กรุณาดาวน์โหลดและติดตั้งใหม่</p>
                        </div>
                        <div className="flex gap-2">
                            <a
                                href={`${FRONTEND_URL}/learn?section=extension-update`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold rounded-lg transition-colors"
                            >
                                📥 อัปเดต
                            </a>
                            <button
                                onClick={() => setUpdateDismissed(true)}
                                className="text-gray-400 hover:text-white text-lg"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Connected Status Bar */}
            {selectedProjectId && (
                <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-green-400 font-bold text-xs">Connected to: {selectedProjectName}</span>
                </div>
            )}

            {/* Tab Navigation - 3 Tabs */}
            <div className="flex border-b border-white/10">
                <button
                    onClick={() => setActiveTab('projects')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'projects'
                            ? 'text-white border-b-2 border-red-500 bg-white/5'
                            : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    📁 Projects
                </button>
                <button
                    onClick={() => setActiveTab('jobs')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'jobs'
                            ? 'text-white border-b-2 border-red-500 bg-white/5'
                            : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    📋 Jobs ({jobs.length})
                </button>
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('record')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                            activeTab === 'record'
                                ? 'text-white border-b-2 border-red-500 bg-white/5'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        🔴 Record
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                            activeTab === 'logs'
                                ? 'text-white border-b-2 border-red-500 bg-white/5'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        📊 Logs
                    </button>
                )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-4">
                {/* Projects Tab */}
                {activeTab === 'projects' && (
                    <>
                        {isLoadingProjects ? (
                            <div className="text-center text-gray-500 py-4">
                                <div className="animate-spin w-5 h-5 border-2 border-gray-600 border-t-white rounded-full mx-auto"></div>
                            </div>
                        ) : projects.length === 0 ? (
                            <div className="text-center py-8">
                                <div className="text-5xl mb-4">📂</div>
                                <p className="text-white font-bold text-base mb-2">ตอนนี้คุณยังไม่มี Project</p>
                                <p className="text-gray-400 text-sm">กรุณาสร้างก่อนการเริ่มใช้งานนะคะ 🙏</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Desktop Agent Status Card */}
                                {selectedProjectId && (
                                    <div className={`p-3 rounded-lg border mb-3 ${
                                        agentStatus === 'online' 
                                            ? 'bg-green-500/10 border-green-500/30' 
                                            : 'bg-orange-500/10 border-orange-500/30'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${
                                                    agentStatus === 'online' ? 'bg-green-500 animate-pulse' : 'bg-orange-500'
                                                }`}></div>
                                                <span className={`text-xs font-medium ${
                                                    agentStatus === 'online' ? 'text-green-400' : 'text-orange-400'
                                                }`}>
                                                    🖥️ Desktop Agent: {agentStatus === 'online' ? 'ออนไลน์' : 'ออฟไลน์'}
                                                </span>
                                            </div>
                                            {agentStatus !== 'online' && (
                                                <button
                                                    onClick={() => setShowAgentCommand(!showAgentCommand)}
                                                    className="text-[10px] px-2 py-1 bg-orange-500/20 text-orange-400 rounded border border-orange-500/30 hover:bg-orange-500/30"
                                                >
                                                    {showAgentCommand ? 'ซ่อน' : 'วิธีเปิด'}
                                                </button>
                                            )}
                                        </div>
                                        {showAgentCommand && agentStatus !== 'online' && (
                                            <div className="mt-2 p-2 bg-black/30 rounded text-[10px]">
                                                <button
                                                    onClick={launchDesktopAgent}
                                                    className="w-full mb-2 py-2 bg-green-500/20 text-green-400 rounded border border-green-500/30 hover:bg-green-500/40 font-bold"
                                                >
                                                    🚀 เปิด Desktop Agent
                                                </button>
                                                <p className="text-gray-500 text-center text-[9px]">
                                                    (ต้องรัน install_protocol.bat ก่อน 1 ครั้ง)
                                                </p>
                                                <hr className="border-white/10 my-2" />
                                                <p className="text-gray-400 mb-1">หรือรันคำสั่งนี้เอง:</p>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 text-yellow-400 font-mono bg-black/50 px-2 py-1 rounded truncate">
                                                        cd /d C:\content-auto-post\legacy_desktop_agent && python main.py
                                                    </code>
                                                    <button
                                                        onClick={copyAgentCommand}
                                                        className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30 hover:bg-blue-500/30"
                                                    >
                                                        {commandCopied ? '✅' : '📋'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {projects.map(project => {
                                    const isRunning = project.status === 'running';
                                    const isSelected = selectedProjectId === project.id;
                                    return (
                                        <div 
                                            key={project.id}
                                            onClick={() => handleSelectProject(project.id)}
                                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                                                isSelected 
                                                    ? 'bg-green-500/20 border-green-500/50' 
                                                    : 'bg-slate-800/50 border-white/10 hover:bg-slate-700/50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                {isRunning && (
                                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0"></div>
                                                )}
                                                <span className={`text-sm font-medium truncate ${isSelected ? 'text-green-400' : 'text-white'}`}>
                                                    {project.name}
                                                </span>
                                            </div>
                                            <button
                                                onClick={(e) => toggleProjectStatus(e, project)}
                                                className={`shrink-0 ml-2 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                                                    isRunning
                                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                                                        : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                                                }`}
                                            >
                                                {isRunning ? 'Stop' : 'Run'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* Jobs Tab */}
                {activeTab === 'jobs' && (
                    <>
                        {isLoadingJobs ? (
                            <div className="text-center text-gray-500 py-8">
                                <div className="animate-spin w-6 h-6 border-2 border-gray-600 border-t-white rounded-full mx-auto mb-2"></div>
                                Loading...
                            </div>
                        ) : !selectedProjectId ? (
                            <div className="text-center text-gray-600 py-8 text-sm">
                                Select a project first.
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="text-center text-gray-600 py-8 text-sm">
                                No jobs scheduled yet.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {jobs.map(job => {
                                    let displayTime = 'Manual Run';
                                    if (job.scheduledTime) {
                                        displayTime = `⏰ ${job.scheduledTime}`;
                                    } else if (job.createdAt) {
                                        const date = new Date(job.createdAt);
                                        displayTime = `📅 ${date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })} ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
                                    }
                                    
                                    return (
                                        <div
                                            key={job.id}
                                            className="bg-black/30 border border-white/5 rounded-lg p-3 flex items-center justify-between"
                                        >
                                            <div>
                                                <p className="text-white text-sm">{displayTime}</p>
                                                <p className="text-gray-600 text-xs font-mono">{job.id.substring(0, 12)}...</p>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(job.status)}`}>
                                                {job.status?.toUpperCase() || 'UNKNOWN'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* Record Tab (Admin Only) - With Sub-tabs */}
                {activeTab === 'record' && isAdmin && (
                    <div className="space-y-3">
                        {/* Sub-tab Navigation */}
                        <div className="flex gap-1 bg-black/30 p-1 rounded-lg">
                            <button
                                onClick={() => setRecordSubTab('record')}
                                className={`flex-1 py-2 text-xs font-bold rounded ${
                                    recordSubTab === 'record' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                🔴 Record
                            </button>
                            <button
                                onClick={() => setRecordSubTab('library')}
                                className={`flex-1 py-2 text-xs font-bold rounded ${
                                    recordSubTab === 'library' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                📦 Blocks ({savedBlocks.length})
                            </button>
                            <button
                                onClick={() => setRecordSubTab('builder')}
                                className={`flex-1 py-2 text-xs font-bold rounded ${
                                    recordSubTab === 'builder' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                🔗 Builder
                            </button>
                        </div>

                        {/* Sub-tab: Record New Block */}
                        {recordSubTab === 'record' && (
                            <div className="space-y-3">
                                <div className="bg-slate-800/50 border border-white/10 rounded-lg p-3">
                                    <label className="text-xs text-gray-400 block mb-1">Block Name</label>
                                    <input
                                        type="text"
                                        value={recipeName}
                                        onChange={(e) => setRecipeName(e.target.value)}
                                        placeholder="e.g. ADD_SCENE_TEXT"
                                        disabled={isRecording}
                                        className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                                    />
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={() => setRecipeType('LOOP')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded ${
                                                recipeType === 'LOOP' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'
                                            }`}
                                        >
                                            🔁 LOOP
                                        </button>
                                        <button
                                            onClick={() => setRecipeType('ONCE')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded ${
                                                recipeType === 'ONCE' ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-400'
                                            }`}
                                        >
                                            ⏺ ONCE
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={isRecording ? stopRecording : startRecording}
                                    className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${
                                        isRecording
                                            ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                                            : 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white'
                                    }`}
                                >
                                    {isRecording ? '⏹ STOP RECORDING' : '🔴 START RECORDING'}
                                </button>

                                {/* Variable Markers - Thai UI */}
                                <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-lg p-3">
                                    <p className="text-xs text-purple-300 font-bold mb-2">🎯 ตัวแปรพื้นฐาน</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => injectVariable('prompt')}
                                            className="flex flex-col items-center p-2 bg-green-500/10 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-all">
                                            <span className="text-green-400 text-xs font-mono">{'{{prompt}}'}</span>
                                            <span className="text-gray-400 text-[9px] mt-0.5">Prompt</span>
                                        </button>
                                        <button onClick={() => injectVariable('sceneIndex')}
                                            className="flex flex-col items-center p-2 bg-pink-500/10 border border-pink-500/30 rounded-lg hover:bg-pink-500/20 transition-all">
                                            <span className="text-pink-400 text-xs font-mono">{'{{sceneIndex}}'}</span>
                                            <span className="text-gray-400 text-[9px] mt-0.5">ลำดับ Scene</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Platform-specific Title/Tags */}
                                <div className="bg-gradient-to-br from-blue-900/30 to-cyan-900/30 border border-blue-500/30 rounded-lg p-3">
                                    <p className="text-xs text-blue-300 font-bold mb-2">📺 Title ตาม Platform</p>
                                    <div className="grid grid-cols-2 gap-1">
                                        <button onClick={() => injectVariable('title_youtube')}
                                            className="flex items-center justify-center p-1.5 bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 transition-all">
                                            <span className="text-red-400 text-[10px] font-mono">YouTube</span>
                                        </button>
                                        <button onClick={() => injectVariable('title_tiktok')}
                                            className="flex items-center justify-center p-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all">
                                            <span className="text-cyan-400 text-[10px] font-mono">TikTok</span>
                                        </button>
                                        <button onClick={() => injectVariable('title_facebook')}
                                            className="flex items-center justify-center p-1.5 bg-blue-500/10 border border-blue-500/30 rounded hover:bg-blue-500/20 transition-all">
                                            <span className="text-blue-400 text-[10px] font-mono">Facebook</span>
                                        </button>
                                        <button onClick={() => injectVariable('title_instagram')}
                                            className="flex items-center justify-center p-1.5 bg-pink-500/10 border border-pink-500/30 rounded hover:bg-pink-500/20 transition-all">
                                            <span className="text-pink-400 text-[10px] font-mono">Instagram</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-yellow-900/30 to-orange-900/30 border border-yellow-500/30 rounded-lg p-3">
                                    <p className="text-xs text-yellow-300 font-bold mb-2"># Tags ตาม Platform</p>
                                    <div className="grid grid-cols-2 gap-1">
                                        <button onClick={() => injectVariable('tags_youtube')}
                                            className="flex items-center justify-center p-1.5 bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 transition-all">
                                            <span className="text-red-400 text-[10px] font-mono">YouTube (10)</span>
                                        </button>
                                        <button onClick={() => injectVariable('tags_tiktok')}
                                            className="flex items-center justify-center p-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-all">
                                            <span className="text-cyan-400 text-[10px] font-mono">TikTok (5)</span>
                                        </button>
                                        <button onClick={() => injectVariable('tags_facebook')}
                                            className="flex items-center justify-center p-1.5 bg-blue-500/10 border border-blue-500/30 rounded hover:bg-blue-500/20 transition-all">
                                            <span className="text-blue-400 text-[10px] font-mono">Facebook (3)</span>
                                        </button>
                                        <button onClick={() => injectVariable('tags_instagram')}
                                            className="flex items-center justify-center p-1.5 bg-pink-500/10 border border-pink-500/30 rounded hover:bg-pink-500/20 transition-all">
                                            <span className="text-pink-400 text-[10px] font-mono">Instagram (30)</span>
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-gray-500 mt-2 text-center">💡 คลิกที่ช่อง input ในหน้าเว็บก่อน แล้วกดปุ่มด้านบน</p>
                                </div>

                                {/* Wait Actions - สำหรับรอ Progress และ Download */}
                                <div className="bg-gradient-to-br from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-lg p-3">
                                    <p className="text-xs text-orange-300 font-bold mb-2">⏳ Wait Actions <span className="text-gray-500 font-normal">(เพิ่ม step รอการทำงาน)</span></p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => {
                                            const selector = prompt('ใส่ selector ของ Progress element:', 'div.sc-b546f8b9-4.hQLkNR');
                                            if (selector) {
                                                setRecordedSteps(prev => [...prev, {
                                                    action: 'wait_for_progress_complete',
                                                    selector: selector,
                                                    timeout: 600000
                                                }]);
                                                setLogs(prev => [`[ADDED] wait_for_progress_complete: ${selector}`, ...prev]);
                                            }
                                        }}
                                            className="flex flex-col items-center p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-all">
                                            <span className="text-orange-400 text-xs font-bold">📊 Wait Progress</span>
                                            <span className="text-gray-400 text-[9px] mt-0.5">รอ % เสร็จ</span>
                                        </button>
                                        <button onClick={() => {
                                            const selector = prompt('ใส่ selector ของ Download button:', 'a.sc-fbdde67d-0.kUMoet');
                                            if (selector) {
                                                setRecordedSteps(prev => [...prev, {
                                                    action: 'wait_for_element_and_click',
                                                    selector: selector,
                                                    timeout: 600000
                                                }]);
                                                setLogs(prev => [`[ADDED] wait_for_element_and_click: ${selector}`, ...prev]);
                                            }
                                        }}
                                            className="flex flex-col items-center p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-all">
                                            <span className="text-cyan-400 text-xs font-bold">⬇️ Wait & Download</span>
                                            <span className="text-gray-400 text-[9px] mt-0.5">รอแล้วกด</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Log Console */}
                                <div className="bg-black/80 border border-white/10 rounded-lg p-2 max-h-28 overflow-auto font-mono text-xs">
                                    <div className="text-gray-600 border-b border-white/10 pb-1 mb-1">TERMINAL</div>
                                    {logs.length === 0 ? <span className="text-gray-700">Waiting...</span> : 
                                        logs.slice(0, 10).map((log, i) => <div key={i} className="text-green-400">{log}</div>)}
                                </div>
                            </div>
                        )}

                        {/* Sub-tab: Block Library */}
                        {recordSubTab === 'library' && (
                            <div className="space-y-2">
                                {/* Testing Status Banner */}
                                {isTestingBlock && (
                                    <div className="bg-gradient-to-r from-blue-600/30 to-cyan-600/30 border border-blue-500/50 rounded-lg p-3 mb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                                                <div>
                                                    <p className="text-blue-300 text-sm font-bold">🧪 กำลังทดสอบ: {testingBlockName}</p>
                                                    {currentStepInfo.total > 0 && (
                                                        <div className="mt-1">
                                                            <p className="text-cyan-400 text-xs font-bold">
                                                                Step {currentStepInfo.index + 1}/{currentStepInfo.total}: {currentStepInfo.action}
                                                            </p>
                                                            {currentStepInfo.selector && (
                                                                <p className="text-gray-400 text-[10px] truncate max-w-[200px]">{currentStepInfo.selector}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={stopTest}
                                                className="px-3 py-1.5 bg-red-500/30 text-red-300 text-xs rounded border border-red-500/50 hover:bg-red-500/50 font-bold"
                                            >
                                                ⏹ หยุด
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {testStatus === 'completed' && !isTestingBlock && (
                                    <div className="bg-gradient-to-r from-green-600/30 to-emerald-600/30 border border-green-500/50 rounded-lg p-3 mb-2">
                                        <p className="text-green-300 text-sm font-bold">✅ ทดสอบสำเร็จ!</p>
                                    </div>
                                )}
                                {testStatus === 'failed' && !isTestingBlock && (
                                    <div className="bg-gradient-to-r from-red-600/30 to-orange-600/30 border border-red-500/50 rounded-lg p-3 mb-2">
                                        <p className="text-red-300 text-sm font-bold">❌ ทดสอบล้มเหลว</p>
                                    </div>
                                )}

                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-gray-400">Blocks ที่บันทึกไว้</p>
                                    <button onClick={fetchBlocks} className="text-xs text-blue-400 hover:text-blue-300">🔄 Refresh</button>
                                </div>
                                {loadingBlocks ? (
                                    <div className="text-center py-4"><div className="animate-spin w-5 h-5 border-2 border-gray-600 border-t-white rounded-full mx-auto"></div></div>
                                ) : savedBlocks.length === 0 ? (
                                    <div className="text-center text-gray-500 py-4 text-sm">ยังไม่มี Block<br/><span className="text-xs">ไปที่ Tab Record เพื่อบันทึก Block ใหม่</span></div>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-auto">
                                        {savedBlocks.map(block => (
                                            <div key={block.id} className="bg-black/30 rounded-lg p-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex-1">
                                                        <p className="text-white text-sm font-medium">{block.name}</p>
                                                        <p className="text-gray-500 text-[10px]">{block.type === 'LOOP' ? '🔁 LOOP' : '⏺ ONCE'}</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => viewBlockCode(block.id)}
                                                            className="px-2 py-1 bg-purple-500/20 text-purple-400 text-[10px] rounded border border-purple-500/30 hover:bg-purple-500/30 font-bold"
                                                            title="ดูโค้ด"
                                                        >
                                                            {'</>'}
                                                        </button>
                                                        <button
                                                            onClick={() => addBlockToTemplate(block.name)}
                                                            className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/30 hover:bg-green-500/30 font-bold"
                                                        >
                                                            ➕
                                                        </button>
                                                        <button
                                                            onClick={() => testBlock(block.name)}
                                                            className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] rounded border border-blue-500/30 hover:bg-blue-500/30 font-bold"
                                                        >
                                                            🧪
                                                        </button>
                                                        <button
                                                            onClick={() => deleteBlock(block.id, block.name)}
                                                            className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/30 hover:bg-red-500/30 font-bold"
                                                        >
                                                            🗑
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sub-tab: Template Builder */}
                        {recordSubTab === 'builder' && (
                            <div className="space-y-3">
                                {/* Testing Status Banner */}
                                {isTestingBlock && (
                                    <div className="bg-gradient-to-r from-blue-600/30 to-cyan-600/30 border border-blue-500/50 rounded-lg p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                                                <div>
                                                    <p className="text-blue-300 text-sm font-bold">🧪 กำลังทดสอบ: {testingBlockName}</p>
                                                    {currentStepInfo.total > 0 && (
                                                        <div className="mt-1">
                                                            <p className="text-cyan-400 text-xs font-bold">
                                                                Step {currentStepInfo.index + 1}/{currentStepInfo.total}: {currentStepInfo.action}
                                                            </p>
                                                            {currentStepInfo.selector && (
                                                                <p className="text-gray-400 text-[10px] truncate max-w-[200px]">{currentStepInfo.selector}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={stopTest}
                                                className="px-3 py-1.5 bg-red-500/30 text-red-300 text-xs rounded border border-red-500/50 hover:bg-red-500/50 font-bold"
                                            >
                                                ⏹ หยุด
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {testStatus === 'completed' && !isTestingBlock && (
                                    <div className="bg-gradient-to-r from-green-600/30 to-emerald-600/30 border border-green-500/50 rounded-lg p-3">
                                        <p className="text-green-300 text-sm font-bold">✅ ทดสอบสำเร็จ!</p>
                                    </div>
                                )}
                                {testStatus === 'failed' && !isTestingBlock && (
                                    <div className="bg-gradient-to-r from-red-600/30 to-orange-600/30 border border-red-500/50 rounded-lg p-3">
                                        <p className="text-red-300 text-sm font-bold">❌ ทดสอบล้มเหลว</p>
                                    </div>
                                )}

                                {/* Template Name */}
                                <div className="bg-slate-800/50 border border-white/10 rounded-lg p-3">
                                    <label className="text-xs text-gray-400 block mb-1">Template Name</label>
                                    <input
                                        type="text"
                                        value={templateName}
                                        onChange={(e) => setTemplateName(e.target.value)}
                                        placeholder="e.g. FLOW_TEXT_VIDEO_YOUTUBE"
                                        className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                                    />
                                </div>

                                {/* Current Template Blocks */}
                                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                                    <p className="text-xs text-green-400 font-bold mb-2">🔗 Block Sequence ({templateBlocks.length})</p>
                                    {templateBlocks.length === 0 ? (
                                        <p className="text-gray-500 text-xs">ไปที่ Blocks Tab แล้วกด "+ Add" เพื่อเพิ่ม Block</p>
                                    ) : (
                                        <div className="space-y-1">
                                            {templateBlocks.map((blockName, index) => (
                                                <div key={index} className="flex items-center gap-2 bg-black/30 rounded p-2">
                                                    <span className="text-gray-500 text-xs w-5">{index + 1}.</span>
                                                    <span className="text-white text-sm flex-1">{blockName}</span>
                                                    <button onClick={() => moveBlock(index, -1)} className="text-gray-400 hover:text-white text-xs">⬆</button>
                                                    <button onClick={() => moveBlock(index, 1)} className="text-gray-400 hover:text-white text-xs">⬇</button>
                                                    <button onClick={() => removeBlockFromTemplate(index)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={saveTemplate}
                                        disabled={templateBlocks.length === 0 || !templateName.trim()}
                                        className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${
                                            templateBlocks.length > 0 && templateName.trim()
                                                ? 'bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white'
                                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        }`}
                                    >
                                        💾 บันทึก
                                    </button>
                                    <button
                                        onClick={() => testTemplate(templateBlocks)}
                                        disabled={templateBlocks.length === 0}
                                        className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${
                                            templateBlocks.length > 0
                                                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white'
                                                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        }`}
                                    >
                                        🧪 ทดสอบ
                                    </button>
                                </div>

                                {/* Saved Templates */}
                                <div className="bg-slate-800/50 border border-white/10 rounded-lg p-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-xs text-gray-400">Templates ที่บันทึกไว้</p>
                                        <button onClick={fetchTemplates} className="text-xs text-blue-400 hover:text-blue-300">🔄</button>
                                    </div>
                                    {loadingTemplates ? (
                                        <div className="text-center py-2"><div className="animate-spin w-4 h-4 border-2 border-gray-600 border-t-white rounded-full mx-auto"></div></div>
                                    ) : savedTemplates.length === 0 ? (
                                        <p className="text-gray-500 text-xs text-center py-2">ยังไม่มี Template</p>
                                    ) : (
                                        <div className="space-y-2 max-h-40 overflow-auto">
                                            {savedTemplates.map(template => (
                                                <div key={template.id} className="bg-black/30 rounded-lg p-2">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <p className="text-white text-sm font-medium flex-1">{template.name}</p>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={() => testTemplate(template.blocks)}
                                                                className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] rounded border border-blue-500/30 hover:bg-blue-500/30 font-bold"
                                                            >
                                                                🧪
                                                            </button>
                                                            <button
                                                                onClick={() => deleteTemplate(template.id, template.name)}
                                                                className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/30 hover:bg-red-500/30 font-bold"
                                                            >
                                                                🗑
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className="text-gray-500 text-[10px]">{template.blocks.join(' → ')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Logs Tab (Admin Only) */}
                {activeTab === 'logs' && isAdmin && (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-gray-400">📊 Debug Logs (Local)</p>
                            <button 
                                onClick={() => setDebugLogs([])} 
                                className="text-xs text-red-400 hover:text-red-300"
                            >
                                🗑 Clear
                            </button>
                        </div>
                        
                        {/* Log Display */}
                        <div className="bg-black/80 border border-white/10 rounded-lg p-3 max-h-80 overflow-auto font-mono text-xs space-y-1">
                            {logs.length === 0 && debugLogs.length === 0 ? (
                                <p className="text-gray-600 text-center py-4">ยังไม่มี Log<br/>เริ่มบันทึกหรือทดสอบ Block เพื่อดู Log</p>
                            ) : (
                                <>
                                    {logs.map((log, i) => (
                                        <div key={`log-${i}`} className={`py-1 px-2 rounded ${
                                            log.includes('[ERROR]') ? 'bg-red-500/20 text-red-400' :
                                            log.includes('[OK]') || log.includes('[SAVE]') ? 'bg-green-500/20 text-green-400' :
                                            log.includes('[TEST]') ? 'bg-blue-500/20 text-blue-400' :
                                            log.includes('[SYSTEM]') ? 'bg-purple-500/20 text-purple-400' :
                                            'text-gray-400'
                                        }`}>
                                            {log}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Log Stats */}
                        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-2">📈 สถิติ</p>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-black/30 rounded p-2">
                                    <p className="text-lg font-bold text-white">{logs.filter(l => l.includes('[TEST]')).length}</p>
                                    <p className="text-[9px] text-gray-500">Tests</p>
                                </div>
                                <div className="bg-black/30 rounded p-2">
                                    <p className="text-lg font-bold text-green-400">{logs.filter(l => l.includes('[OK]') || l.includes('[SAVE]')).length}</p>
                                    <p className="text-[9px] text-gray-500">Success</p>
                                </div>
                                <div className="bg-black/30 rounded p-2">
                                    <p className="text-lg font-bold text-red-400">{logs.filter(l => l.includes('[ERROR]')).length}</p>
                                    <p className="text-[9px] text-gray-500">Errors</p>
                                </div>
                            </div>
                        </div>

                        {/* AI Quick Help */}
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                            <p className="text-xs text-purple-300 font-bold mb-2">🤖 AI ช่วยวิเคราะห์</p>
                            <p className="text-[10px] text-gray-400 mb-2">ถ้ามี Error ให้กดปุ่ม AI เพื่อให้ช่วยวิเคราะห์และแก้ไข Block</p>
                            <button
                                onClick={() => {
                                    setActiveTab('record');
                                    setIsAIChatOpen(true);
                                }}
                                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                                🤖 เปิด AI Block Editor
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 text-center">
                <p className="text-xs text-gray-600">
                    Keep this tab open for scheduled automation. v2.0
                </p>
            </div>

            {/* AI Chat Floating Button - Only show in Record Tab for Admin */}
            {activeTab === 'record' && isAdmin && (
                <button
                    onClick={() => setIsAIChatOpen(true)}
                    className="fixed bottom-20 right-4 w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-500 rounded-full shadow-lg hover:shadow-purple-500/50 transition-all hover:scale-110 flex items-center justify-center text-xl z-50"
                    title="AI ช่วยแก้ไข Block"
                >
                    🤖
                </button>
            )}

            {/* AI Chat Panel Modal */}
            {isAIChatOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-purple-500/30 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl shadow-purple-500/20">
                        {/* AI Chat Header */}
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">🤖</span>
                                <div>
                                    <h3 className="text-white font-bold">AI Block Editor</h3>
                                    <p className="text-xs text-gray-400">พูดคุยเพื่อแก้ไข Block</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setIsAIChatOpen(false);
                                    setAiMessages([]);
                                    setSelectedBlockForAI(null);
                                }}
                                className="text-gray-400 hover:text-white text-xl"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Block Selector */}
                        {!selectedBlockForAI ? (
                            <div className="p-4 space-y-3 overflow-auto flex-1">
                                <p className="text-sm text-gray-300">เลือก Block ที่ต้องการให้ AI ช่วยแก้ไข:</p>
                                {savedBlocks.length === 0 ? (
                                    <p className="text-gray-500 text-sm text-center py-4">ยังไม่มี Block<br/>บันทึก Block ก่อนใช้งาน AI</p>
                                ) : (
                                    <div className="space-y-2">
                                        {savedBlocks.map(block => (
                                            <button
                                                key={block.id}
                                                onClick={() => {
                                                    setSelectedBlockForAI(block);
                                                    setAiMessages([{
                                                        role: 'assistant',
                                                        content: `สวัสดีครับ! ผมพร้อมช่วยแก้ไข Block "${block.name}" แล้ว\n\nก่อนเริ่ม ผมขอถามเพื่อเก็บข้อมูลก่อนนะครับ:\n\n1. **Block นี้ใช้ทำอะไร?** (เช่น อัปโหลดวิดีโอ, ใส่ข้อความ)\n2. **ต้องการแก้ไขอะไร?** (เช่น เพิ่มตัวแปร {{prompt}}, แก้ selector)\n3. **มีปัญหาอะไรตอนทดสอบไหม?**\n\nบอกผมได้เลยครับ 😊`
                                                    }]);
                                                }}
                                                className="w-full p-3 bg-black/30 border border-white/10 rounded-lg text-left hover:border-purple-500/50 hover:bg-purple-500/10 transition-all"
                                            >
                                                <p className="text-white font-medium">{block.name}</p>
                                                <p className="text-gray-500 text-xs">{block.type === 'LOOP' ? '🔁 LOOP' : '⏺ ONCE'}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Selected Block Info */}
                                <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-purple-400">📦</span>
                                        <span className="text-purple-300 text-sm font-medium">{selectedBlockForAI.name}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSelectedBlockForAI(null);
                                            setAiMessages([]);
                                        }}
                                        className="text-xs text-gray-400 hover:text-white"
                                    >
                                        เปลี่ยน Block
                                    </button>
                                </div>

                                {/* Chat Messages */}
                                <div className="flex-1 overflow-auto p-4 space-y-3">
                                    {aiMessages.map((msg, i) => (
                                        <div
                                            key={i}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] p-3 rounded-lg text-sm whitespace-pre-wrap ${
                                                    msg.role === 'user'
                                                        ? 'bg-blue-600 text-white rounded-br-none'
                                                        : 'bg-white/10 text-gray-200 rounded-bl-none'
                                                }`}
                                            >
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {isAILoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-white/10 p-3 rounded-lg rounded-bl-none">
                                                <div className="flex gap-1">
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Edit Mode Toggle */}
                                <div className="px-4 py-2 border-t border-white/10 flex gap-2">
                                    <button
                                        onClick={() => setAiEditMode('edit')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded ${aiEditMode === 'edit' ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-400'}`}
                                    >
                                        🔧 แก้ไขกล่องเดิม
                                    </button>
                                    <button
                                        onClick={() => setAiEditMode('copy')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded ${aiEditMode === 'copy' ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-400'}`}
                                    >
                                        📋 สร้าง Copy ใหม่
                                    </button>
                                </div>

                                {/* Chat Input */}
                                <div className="p-4 border-t border-white/10">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={aiInput}
                                            onChange={(e) => setAiInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAISend()}
                                            placeholder="พิมพ์ข้อความ..."
                                            disabled={isAILoading}
                                            className="flex-1 bg-black/50 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                                        />
                                        <button
                                            onClick={handleAISend}
                                            disabled={isAILoading || !aiInput.trim()}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-bold text-sm transition-colors"
                                        >
                                            ส่ง
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Code Editor Modal */}
            {isCodeViewerOpen && viewingBlockCode && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/20 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <div>
                                <h3 className="text-white font-bold">✏️ แก้ไข Block</h3>
                                <p className="text-gray-400 text-xs">{viewingBlockCode.name} • {viewingBlockCode.steps?.length || 0} steps</p>
                            </div>
                            <button
                                onClick={() => setIsCodeViewerOpen(false)}
                                className="text-gray-400 hover:text-white text-xl"
                            >
                                ✕
                            </button>
                        </div>
                        
                        {/* Code Editor */}
                        <div className="flex-1 overflow-auto p-4">
                            <textarea
                                value={editedCodeText}
                                onChange={(e) => setEditedCodeText(e.target.value)}
                                className="w-full h-64 bg-black/50 rounded-lg p-3 text-xs text-green-400 font-mono border border-white/10 focus:border-green-500 focus:outline-none resize-none"
                                spellCheck={false}
                            />
                        </div>
                        
                        {/* Footer */}
                        <div className="p-4 border-t border-white/10 flex gap-2">
                            <button
                                onClick={saveBlockCode}
                                disabled={isSavingCode}
                                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                                    isSavingCode 
                                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                                        : 'bg-green-600 hover:bg-green-500 text-white'
                                }`}
                            >
                                {isSavingCode ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
                            </button>
                            <button
                                onClick={copyBlockCode}
                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                                    codeCopied 
                                        ? 'bg-purple-600 text-white' 
                                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30'
                                }`}
                            >
                                {codeCopied ? '✅' : '📋'}
                            </button>
                            <button
                                onClick={() => setIsCodeViewerOpen(false)}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-sm"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
