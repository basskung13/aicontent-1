import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, GripVertical, Loader2, Sparkles, Check, ChevronDown, Send, X, Play, Pause, History, RotateCcw } from 'lucide-react';
import { db, auth, functions } from '../../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { twMerge } from 'tailwind-merge';

const ContentQueue = ({ projectId }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [episodes, setEpisodes] = useState([]);
    const [episodeHistory, setEpisodeHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'history'
    
    // AI Chat State
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [aiInput, setAiInput] = useState('');
    const [aiMessages, setAiMessages] = useState([
        { role: 'assistant', content: 'สวัสดีครับ! ผมคือ AI Episode Director 🎬\n\nบอกหัวข้อหรือธีมที่ต้องการ แล้วผมจะช่วยสร้าง Episode List ให้ครับ\n\nเช่น: "สอนเทคนิคบาสเก็ตบอลสำหรับมือใหม่ 10 ตอน"' }
    ]);
    const [isAiThinking, setIsAiThinking] = useState(false);
    const chatEndRef = useRef(null);

    // New Episode Form
    const [newEpisode, setNewEpisode] = useState({ title: '', description: '' });

    // Auth & Data Fetching
    useEffect(() => {
        let unsubEpisodes = null;
        let unsubHistory = null;
        
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            
            // Cleanup previous listeners if exists
            if (unsubEpisodes) {
                unsubEpisodes();
                unsubEpisodes = null;
            }
            if (unsubHistory) {
                unsubHistory();
                unsubHistory = null;
            }
            
            if (user && projectId) {
                // Listen to episodes
                const episodesRef = collection(db, 'users', user.uid, 'projects', projectId, 'episodes');
                const q = query(episodesRef, orderBy('order', 'asc'));
                
                unsubEpisodes = onSnapshot(q, 
                    (snapshot) => {
                        const loadedEpisodes = [];
                        snapshot.forEach(doc => {
                            loadedEpisodes.push({ id: doc.id, ...doc.data() });
                        });
                        setEpisodes(loadedEpisodes);
                        setIsLoading(false);
                    },
                    (error) => {
                        console.warn('ContentQueue: Firebase listener error:', error.code);
                        setEpisodes([]);
                        setIsLoading(false);
                    }
                );

                // Listen to episode history
                const historyRef = collection(db, 'users', user.uid, 'projects', projectId, 'episodeHistory');
                const hq = query(historyRef, orderBy('usedAt', 'desc'));
                
                unsubHistory = onSnapshot(hq,
                    (snapshot) => {
                        const loadedHistory = [];
                        snapshot.forEach(doc => {
                            loadedHistory.push({ id: doc.id, ...doc.data() });
                        });
                        setEpisodeHistory(loadedHistory);
                    },
                    (error) => {
                        console.warn('ContentQueue: History listener error:', error.code);
                        setEpisodeHistory([]);
                    }
                );
            } else {
                setEpisodes([]);
                setEpisodeHistory([]);
                setIsLoading(false);
            }
        });
        
        return () => {
            unsubscribeAuth();
            if (unsubEpisodes) unsubEpisodes();
            if (unsubHistory) unsubHistory();
        };
    }, [projectId]);

    // Scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiMessages]);

    // Add Episode
    const handleAddEpisode = async () => {
        if (!newEpisode.title.trim() || !currentUser) return;
        setIsSaving(true);
        try {
            const episodeId = `ep_${Date.now()}`;
            const episodeRef = doc(db, 'users', currentUser.uid, 'projects', projectId, 'episodes', episodeId);
            await setDoc(episodeRef, {
                title: newEpisode.title.trim(),
                description: newEpisode.description.trim(),
                status: 'pending', // pending | completed
                order: episodes.length,
                createdAt: serverTimestamp()
            });
            setNewEpisode({ title: '', description: '' });
        } catch (error) {
            console.error('Error adding episode:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Delete Episode
    const handleDeleteEpisode = async (episodeId) => {
        if (!currentUser) return;
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'projects', projectId, 'episodes', episodeId));
        } catch (error) {
            console.error('Error deleting episode:', error);
        }
    };

    // Toggle Episode Status
    const handleToggleStatus = async (episode) => {
        if (!currentUser) return;
        try {
            const episodeRef = doc(db, 'users', currentUser.uid, 'projects', projectId, 'episodes', episode.id);
            await setDoc(episodeRef, { 
                status: episode.status === 'completed' ? 'pending' : 'completed' 
            }, { merge: true });
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    // AI Generate Episodes
    const handleAiSubmit = async () => {
        if (!aiInput.trim() || isAiThinking) return;
        
        const userMessage = aiInput.trim();
        setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setAiInput('');
        setIsAiThinking(true);

        try {
            // Call Cloud Function
            const generateEpisodes = httpsCallable(functions, 'generateEpisodes');
            const result = await generateEpisodes({ prompt: userMessage });
            
            if (result.data?.episodes) {
                // Add AI response
                const episodeList = result.data.episodes.map((ep, i) => `${i + 1}. **${ep.title}**\n   ${ep.description}`).join('\n\n');
                setAiMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: `🎬 สร้าง ${result.data.episodes.length} Episodes:\n\n${episodeList}\n\n✅ กดปุ่ม "เพิ่มทั้งหมด" ด้านล่างเพื่อเพิ่มเข้า Queue`,
                    episodes: result.data.episodes
                }]);
            } else {
                setAiMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: '❌ ไม่สามารถสร้าง Episodes ได้ กรุณาลองใหม่อีกครั้ง'
                }]);
            }
        } catch (error) {
            console.error('AI Error:', error);
            setAiMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `❌ เกิดข้อผิดพลาด: ${error.message}`
            }]);
        } finally {
            setIsAiThinking(false);
        }
    };

    // Add AI-generated episodes to queue
    const handleAddAiEpisodes = async (generatedEpisodes) => {
        if (!currentUser || !generatedEpisodes) return;
        setIsSaving(true);
        try {
            for (let i = 0; i < generatedEpisodes.length; i++) {
                const ep = generatedEpisodes[i];
                const episodeId = `ep_${Date.now()}_${i}`;
                const episodeRef = doc(db, 'users', currentUser.uid, 'projects', projectId, 'episodes', episodeId);
                await setDoc(episodeRef, {
                    title: ep.title,
                    description: ep.description || '',
                    status: 'pending',
                    order: episodes.length + i,
                    createdAt: serverTimestamp()
                });
            }
            setAiMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `✅ เพิ่ม ${generatedEpisodes.length} Episodes เข้า Queue เรียบร้อยแล้ว!`
            }]);
        } catch (error) {
            console.error('Error adding AI episodes:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const pendingCount = episodes.filter(e => e.status === 'pending').length;
    const processingCount = episodes.filter(e => e.status === 'processing').length;
    const usedCount = episodes.filter(e => e.status === 'used').length;

    // Status Badge Helper
    const getStatusBadge = (status) => {
        const styles = {
            pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '⏳ รอดำเนินการ' },
            processing: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '🔄 กำลังทำงาน' },
            used: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', label: '✅ ใช้แล้ว' },
            completed: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', label: '✅ เสร็จแล้ว' }
        };
        return styles[status] || styles.pending;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-yellow-400" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                            <Sparkles className="text-yellow-400" size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Content Queue</h3>
                            <p className="text-xs text-yellow-400/70">Episode List สำหรับสร้างวิดีโออัตโนมัติ</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-lg text-sm font-medium">
                            ⏳ {pendingCount} รอ
                        </span>
                        {processingCount > 0 && (
                            <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-sm font-medium">
                                🔄 {processingCount} กำลังทำ
                            </span>
                        )}
                        <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-lg text-sm font-medium">
                            ✅ {episodeHistory.length} ใช้แล้ว
                        </span>
                    </div>
                </div>
                <p className="text-sm text-white/60">
                    💡 เมื่อ Schedule ทำงาน ระบบจะดึง Episode ถัดไปที่ยัง "รอดำเนินการ" มาสร้างวิดีโอ โดยใช้ Mode Template + Expander ที่ตั้งค่าไว้
                </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveTab('queue')}
                    className={twMerge(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                        activeTab === 'queue'
                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                            : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                    )}
                >
                    <Sparkles size={16} />
                    Queue ({pendingCount + processingCount})
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={twMerge(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                        activeTab === 'history'
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                    )}
                >
                    <History size={16} />
                    History ({episodeHistory.length})
                </button>
            </div>

            {/* AI Episode Generator Button - Only show in Queue tab */}
            {activeTab === 'queue' && (
            <button
                onClick={() => setIsAiOpen(!isAiOpen)}
                className="w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl p-4 hover:from-purple-500/30 hover:to-pink-500/30 transition-all group"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Sparkles className="text-purple-300" size={20} />
                        </div>
                        <div className="text-left">
                            <h4 className="font-bold text-white">AI Episode Director</h4>
                            <p className="text-xs text-purple-300/70">ให้ AI ช่วยสร้าง Episode List จากหัวข้อที่ต้องการ</p>
                        </div>
                    </div>
                    <ChevronDown className={twMerge("text-purple-300 transition-transform", isAiOpen && "rotate-180")} size={20} />
                </div>
            </button>
            )}

            {/* AI Chat Panel - Only show in Queue tab */}
            {activeTab === 'queue' && isAiOpen && (
                <div className="bg-slate-900/80 border border-purple-500/20 rounded-xl overflow-hidden">
                    {/* Chat Messages */}
                    <div className="h-64 overflow-y-auto p-4 space-y-3">
                        {aiMessages.map((msg, idx) => (
                            <div key={idx} className={twMerge("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                <div className={twMerge(
                                    "max-w-[80%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap",
                                    msg.role === 'user' 
                                        ? "bg-purple-500/30 text-white" 
                                        : "bg-white/10 text-gray-200"
                                )}>
                                    {msg.content}
                                    {msg.episodes && (
                                        <button
                                            onClick={() => handleAddAiEpisodes(msg.episodes)}
                                            disabled={isSaving}
                                            className="mt-3 w-full bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg py-2 text-xs font-bold hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                        >
                                            {isSaving ? <Loader2 className="animate-spin mx-auto" size={14} /> : '✨ เพิ่มทั้งหมดเข้า Queue'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isAiThinking && (
                            <div className="flex justify-start">
                                <div className="bg-white/10 rounded-xl px-4 py-2">
                                    <Loader2 className="animate-spin text-purple-400" size={16} />
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Chat Input */}
                    <div className="border-t border-purple-500/20 p-3 flex gap-2">
                        <input
                            type="text"
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
                            placeholder="บอกหัวข้อที่ต้องการ เช่น 'สอนบาส 10 ตอน'"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 outline-none"
                        />
                        <button
                            onClick={handleAiSubmit}
                            disabled={isAiThinking || !aiInput.trim()}
                            className="px-4 py-2 bg-purple-500/30 text-purple-300 rounded-lg hover:bg-purple-500/40 transition-colors disabled:opacity-50"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Manual Add Episode - Only show in Queue tab */}
            {activeTab === 'queue' && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">➕ เพิ่ม Episode ด้วยตนเอง</h4>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={newEpisode.title}
                        onChange={(e) => setNewEpisode({ ...newEpisode, title: e.target.value })}
                        placeholder="หัวข้อ Episode เช่น 'วิธีดริบเบิลแบบ Crossover'"
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-yellow-500 outline-none"
                    />
                    <button
                        onClick={handleAddEpisode}
                        disabled={isSaving || !newEpisode.title.trim()}
                        className="px-6 py-3 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/30 font-bold transition-colors disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                    </button>
                </div>
            </div>
            )}

            {/* Episode List - Queue Tab */}
            {activeTab === 'queue' && (
            <div className="space-y-2">
                {episodes.filter(e => e.status !== 'used').length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <p className="text-lg mb-2">ยังไม่มี Episode</p>
                        <p className="text-sm">เพิ่ม Episode ด้วยตนเอง หรือใช้ AI ช่วยสร้าง</p>
                    </div>
                ) : (
                    episodes.filter(e => e.status !== 'used').map((episode, idx) => {
                        const badge = getStatusBadge(episode.status);
                        return (
                        <div
                            key={episode.id}
                            className={twMerge(
                                "flex items-center gap-3 bg-white/5 border rounded-xl p-4 group transition-all",
                                episode.status === 'processing' 
                                    ? "border-blue-500/30 bg-blue-500/5" 
                                    : "border-white/10 hover:border-yellow-500/30"
                            )}
                        >
                            {/* Drag Handle */}
                            <GripVertical className="text-gray-600 cursor-grab" size={16} />

                            {/* Order Number */}
                            <span className={twMerge(
                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                badge.bg, badge.text
                            )}>
                                {idx + 1}
                            </span>

                            {/* Episode Info */}
                            <div className="flex-1 min-w-0">
                                <h5 className="font-medium truncate text-white">
                                    {episode.title}
                                </h5>
                                {episode.description && (
                                    <p className="text-xs text-gray-500 truncate">{episode.description}</p>
                                )}
                            </div>

                            {/* Status Badge */}
                            <span className={twMerge(
                                "px-3 py-1 rounded-lg text-xs font-medium",
                                badge.bg, badge.text
                            )}>
                                {badge.label}
                            </span>

                            {/* Actions */}
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleToggleStatus(episode)}
                                    className={twMerge(
                                        "p-2 rounded-lg transition-colors",
                                        episode.status === 'completed'
                                            ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                                            : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                    )}
                                    title={episode.status === 'completed' ? 'ทำเครื่องหมายว่ายังไม่เสร็จ' : 'ทำเครื่องหมายว่าเสร็จแล้ว'}
                                >
                                    <Check size={14} />
                                </button>
                                <button
                                    onClick={() => handleDeleteEpisode(episode.id)}
                                    className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                                    title="ลบ Episode"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                        );
                    })
                )}
            </div>
            )}

            {/* Episode History Tab */}
            {activeTab === 'history' && (
            <div className="space-y-2">
                {episodeHistory.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <p className="text-lg mb-2">ยังไม่มีประวัติ</p>
                        <p className="text-sm">Episode ที่ใช้แล้วจะแสดงที่นี่</p>
                    </div>
                ) : (
                    episodeHistory.map((episode, idx) => (
                        <div
                            key={episode.id}
                            className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl p-4"
                        >
                            {/* Order Number */}
                            <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-green-500/20 text-green-400">
                                {idx + 1}
                            </span>

                            {/* Episode Info */}
                            <div className="flex-1 min-w-0">
                                <h5 className="font-medium truncate text-green-300">
                                    {episode.title}
                                </h5>
                                {episode.description && (
                                    <p className="text-xs text-gray-500 truncate">{episode.description}</p>
                                )}
                                {episode.usedAt && (
                                    <p className="text-xs text-gray-600 mt-1">
                                        ใช้เมื่อ: {episode.usedAt?.toDate?.()?.toLocaleDateString('th-TH') || 'N/A'}
                                    </p>
                                )}
                            </div>

                            {/* Status Badge */}
                            <span className="px-3 py-1 rounded-lg text-xs font-medium bg-green-500/20 text-green-400">
                                ✅ ใช้แล้ว
                            </span>

                            {/* Restore Button */}
                            <button
                                onClick={async () => {
                                    // Move back to queue (optional feature)
                                    // This would require implementing a restore function
                                }}
                                className="p-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors opacity-50 cursor-not-allowed"
                                title="ย้ายกลับ Queue (เร็วๆ นี้)"
                                disabled
                            >
                                <RotateCcw size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
            )}
        </div>
    );
};

export default ContentQueue;
