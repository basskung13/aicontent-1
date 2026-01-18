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

    const { userId, isAdmin } = keyData || {};

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

    // Fetch user's projects on mount
    useEffect(() => {
        if (!userId) {
            setError('Invalid key: no user ID');
            setIsLoadingProjects(false);
            return;
        }

        const fetchProjects = async () => {
            try {
                const token = await getAuthToken();
                const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}/projects?key=${API_KEY}`;
                const res = await fetch(url, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const data = await res.json();

                if (data.documents) {
                    const projectList = data.documents.map(doc => ({
                        id: doc.name.split('/').pop(),
                        name: doc.fields?.name?.stringValue || doc.name.split('/').pop().substring(0, 12),
                        status: doc.fields?.status?.stringValue || 'idle'
                    }));
                    setProjects(projectList);

                    // Auto-select first project
                    if (projectList.length > 0) {
                        handleSelectProject(projectList[0]);
                    }
                } else {
                    setProjects([]);
                }
                setIsLoadingProjects(false);
            } catch (err) {
                console.error('Error fetching projects:', err);
                setError(err.message);
                setIsLoadingProjects(false);
            }
        };

        fetchProjects();
    }, [userId]);

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

    const [activeTab, setActiveTab] = useState('projects'); // 'projects' | 'jobs'

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
                    <div className="flex items-center gap-2">
                        {isAdmin && selectedProjectId && (
                            <button
                                onClick={() => onEnterAdminMode(selectedProjectId, selectedProjectName)}
                                className="text-xs px-3 py-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/30 font-bold"
                            >
                                🎬 Record
                            </button>
                        )}
                        <button
                            onClick={onLogout}
                            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                        >
                            Disconnect
                        </button>
                    </div>
                </div>
            </header>

            {/* Connected Status Bar */}
            {selectedProjectId && (
                <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-green-400 font-bold text-xs">Connected to: {selectedProjectName}</span>
                </div>
            )}

            {/* Tab Navigation */}
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
                            <div className="text-center text-gray-600 py-4 text-sm">
                                No projects found.
                            </div>
                        ) : (
                            <div className="space-y-2">
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
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 text-center">
                <p className="text-xs text-gray-600">
                    Keep this tab open for scheduled automation. v2.0
                </p>
            </div>
        </div>
    );
}
