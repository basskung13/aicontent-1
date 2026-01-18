import React, { useState, useEffect } from 'react';
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Filter,
    Calendar,
    Search,
    Video,
    Facebook,
    Youtube,
    Activity,
    Clock
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { db, auth } from '../../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import GlassDropdown from '../ui/GlassDropdown';

export default function ProjectHistory({ projectId }) {
    const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, SUCCESS, ERROR
    const [filterPlatform, setFilterPlatform] = useState('ALL'); // ALL, TIKTOK, FACEBOOK, YOUTUBE
    const [filterTime, setFilterTime] = useState('ALL'); // 24H, 7D, 30D, ALL
    const [logs, setLogs] = useState([]);

    // Real-time Firestore Listener
    useEffect(() => {
        if (!projectId || !auth.currentUser) return;

        const logsRef = collection(db, 'users', auth.currentUser.uid, 'projects', projectId, 'logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedLogs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // Ensure robust date handling
                let rawDate = new Date();
                if (data.timestamp?.toDate) {
                    rawDate = data.timestamp.toDate();
                } else if (data.timestamp) {
                    rawDate = new Date(); // Fallback
                }

                loadedLogs.push({
                    id: doc.id,
                    ...data,
                    rawDate: rawDate,
                    timestamp: rawDate.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
                    scenes: data.sceneCount || data.scenes || '-',
                    videoLength: data.totalLength ? `${data.totalLength}s` : (data.videoLength || '-'),
                    duration: data.sceneDuration ? `${data.sceneDuration}s/scene` : (data.duration || '-')
                });
            });
            setLogs(loadedLogs);
        });

        return () => unsubscribe();
    }, [projectId]);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'success': return <CheckCircle2 size={14} className="text-green-400" />;
            case 'error': return <XCircle size={14} className="text-red-400" />;
            case 'warning': return <AlertTriangle size={14} className="text-yellow-400" />;
            default: return <Activity size={14} className="text-gray-400" />;
        }
    };

    const getPlatformIcon = (platform) => {
        switch (platform) {
            case 'TIKTOK': return <Video size={14} />;
            case 'FACEBOOK': return <Facebook size={14} />;
            case 'YOUTUBE': return <Youtube size={14} />;
            default: return <Activity size={14} />;
        }
    };

    const filteredLogs = logs.filter(log => {
        const statusMatch = filterStatus === 'ALL' || log.status === filterStatus.toLowerCase();
        const platformMatch = filterPlatform === 'ALL' || log.platform === filterPlatform;

        let timeMatch = true;
        if (filterTime !== 'ALL') {
            const now = new Date();
            const diffMs = now - log.rawDate;
            const diffHours = diffMs / (1000 * 60 * 60);

            if (filterTime === '24H') timeMatch = diffHours <= 24;
            else if (filterTime === '7D') timeMatch = diffHours <= (24 * 7);
            else if (filterTime === '30D') timeMatch = diffHours <= (24 * 30);
        }

        return statusMatch && platformMatch && timeMatch;
    });

    return (
        <div className="w-full h-full flex flex-col animate-in fade-in">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-4 bg-black/20 rounded-xl border border-white/5">
                <div className="flex items-center gap-2">

                    {/* TIME FILTER */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                        <Calendar size={14} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-300 uppercase">Time:</span>
                        <GlassDropdown
                            value={filterTime}
                            onChange={setFilterTime}
                            options={[
                                { value: 'ALL', label: 'ALL TIME' },
                                { value: '24H', label: 'LAST 24 HOURS' },
                                { value: '7D', label: 'LAST 7 DAYS' },
                                { value: '30D', label: 'LAST 30 DAYS' }
                            ]}
                            buttonClassName="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                        />
                    </div>

                    {/* STATUS FILTER */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                        <Filter size={14} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-300 uppercase">Status:</span>
                        <GlassDropdown
                            value={filterStatus}
                            onChange={setFilterStatus}
                            options={[
                                { value: 'ALL', label: 'ALL EVENTS' },
                                { value: 'SUCCESS', label: '✅ SUCCESS' },
                                { value: 'ERROR', label: '❌ ERRORS' }
                            ]}
                            buttonClassName="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                        />
                    </div>

                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/5">
                        {['ALL', 'TIKTOK', 'FACEBOOK', 'YOUTUBE'].map(p => (
                            <button
                                key={p}
                                onClick={() => setFilterPlatform(p)}
                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${filterPlatform === p
                                    ? 'bg-white/20 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-white'
                                    }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="text-xs text-gray-500 font-mono">
                    Showing {filteredLogs.length} records
                </div>
            </div>

            {/* Data Grid */}
            <div className="flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/40 flex flex-col">
                {/* Header */}
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-white/5 border-b border-white/5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <div className="col-span-2">Time</div>
                    <div className="col-span-2">Platform</div>
                    <div className="col-span-1 text-center">Status</div>
                    <div className="col-span-4">Details</div>
                    <div className="col-span-1 text-center">Scenes</div>
                    <div className="col-span-1 text-center">Length</div>
                    <div className="col-span-1 text-right">Exec.</div>
                </div>

                {/* Rows */}
                <div className="overflow-y-auto flex-1 p-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
                    {filteredLogs.map(log => (
                        <div
                            key={log.id}
                            className={twMerge(
                                "grid grid-cols-12 gap-4 px-3 py-2.5 rounded-lg items-center text-xs transition-colors border border-transparent",
                                log.status === 'error'
                                    ? "bg-red-500/5 hover:bg-red-500/10 border-red-500/10"
                                    : "hover:bg-white/5"
                            )}
                        >
                            <div className="col-span-2 text-gray-500 font-mono text-[10px]">{log.timestamp}</div>

                            <div className="col-span-2 flex items-center gap-2 font-bold text-gray-300">
                                <span className={twMerge(
                                    "p-1.5 rounded-md bg-white/5",
                                    log.platform === 'TIKTOK' && "text-pink-400 bg-pink-500/10",
                                    log.platform === 'FACEBOOK' && "text-blue-400 bg-blue-500/10",
                                    log.platform === 'YOUTUBE' && "text-red-400 bg-red-500/10",
                                )}>
                                    {getPlatformIcon(log.platform)}
                                </span>
                                {log.platform}
                            </div>

                            <div className="col-span-1 flex justify-center">
                                {getStatusIcon(log.status)}
                            </div>

                            <div className={twMerge(
                                "col-span-4 truncate font-medium",
                                log.status === 'error' ? "text-red-300" : "text-gray-300"
                            )}>
                                {log.message}
                            </div>

                            <div className="col-span-1 text-center text-gray-400 font-mono">
                                {log.scenes}
                            </div>

                            <div className="col-span-1 text-center text-gray-400 font-mono">
                                {log.videoLength}
                            </div>

                            <div className="col-span-1 text-right text-gray-600 font-mono text-[10px]">
                                {log.duration}
                            </div>
                        </div>
                    ))}

                    {filteredLogs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                            <Search size={24} className="mb-2 opacity-50" />
                            <p>No logs found matching filters</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
