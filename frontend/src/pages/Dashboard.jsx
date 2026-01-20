import { useState, useEffect, useMemo } from 'react';
import { 
    LayoutDashboard, Wallet, FolderKanban, Share2, Layers, TrendingUp, TrendingDown,
    Clock, Users, Video, Eye, Heart, Play, Search, ChevronDown, Filter,
    Facebook, Instagram, Youtube, Loader2, ArrowUpRight, ArrowDownRight,
    ShoppingBag, Gift, DollarSign, Activity, BarChart3, PieChart, Calendar,
    CheckCircle, AlertCircle, Zap, Target, Award, Sparkles, CalendarDays, CalendarRange, Download
} from 'lucide-react';
import GlassDropdown from '../components/ui/GlassDropdown';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, doc, onSnapshot, query, orderBy, getDocs, where, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Platform Icon Mapping
const PlatformIcon = ({ platform, size = 16 }) => {
    const icons = {
        facebook: <Facebook size={size} className="text-blue-400" />,
        instagram: <Instagram size={size} className="text-pink-400" />,
        youtube: <Youtube size={size} className="text-red-400" />,
        tiktok: <Video size={size} className="text-cyan-400" />
    };
    return icons[platform?.toLowerCase()] || <Share2 size={size} className="text-slate-400" />;
};

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, subValue, trend, trendUp, color, loading }) => (
    <div className={`group relative bg-gradient-to-br from-${color}-900/30 to-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/10 p-5 hover:border-${color}-500/30 hover:scale-[1.03] transition-all duration-500 cursor-pointer overflow-hidden`}>
        {/* Animated Glow Effect */}
        <div className={`absolute inset-0 bg-gradient-to-r from-${color}-500/0 via-${color}-500/5 to-${color}-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000`} />
        <div className={`absolute top-0 right-0 w-32 h-32 bg-${color}-500/10 rounded-full blur-3xl group-hover:bg-${color}-500/20 transition-all duration-500`} />
        
        <div className="flex items-start justify-between relative">
            <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-${color}-400 to-${color}-600 flex items-center justify-center shadow-lg shadow-${color}-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <Icon className="text-white" size={28} />
                </div>
                <div>
                    {loading ? (
                        <Loader2 size={24} className="animate-spin text-slate-400" />
                    ) : (
                        <p className="text-3xl font-black text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-${color}-200 transition-all">{value}</p>
                    )}
                    <p className="text-sm text-slate-400 font-medium">{label}</p>
                    {subValue && <p className="text-xs text-slate-500 mt-0.5">{subValue}</p>}
                </div>
            </div>
            {trend !== undefined && (
                <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold ${trendUp ? 'bg-green-500/20 text-green-400 shadow-lg shadow-green-500/20' : 'bg-red-500/20 text-red-400 shadow-lg shadow-red-500/20'}`}>
                    {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {trend}%
                </div>
            )}
        </div>
    </div>
);

// Mini Chart Component (Simple Bar)
const MiniBarChart = ({ data, color }) => {
    const max = Math.max(...data, 1);
    return (
        <div className="flex items-end gap-1 h-12">
            {data.map((val, i) => (
                <div
                    key={i}
                    className={`w-2 rounded-t bg-gradient-to-t from-${color}-600 to-${color}-400 transition-all hover:opacity-80`}
                    style={{ height: `${(val / max) * 100}%`, minHeight: val > 0 ? '4px' : '2px' }}
                />
            ))}
        </div>
    );
};

export default function Dashboard() {
    const { t } = useTranslation();
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Data States
    const [walletBalance, setWalletBalance] = useState(0);
    const [accounts, setAccounts] = useState([]);
    const [projects, setProjects] = useState([]);
    const [expanders, setExpanders] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [contentQueue, setContentQueue] = useState([]);
    
    // Filter States
    const [platformFilter, setPlatformFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Chart Filter States
    const [chartPeriod, setChartPeriod] = useState('7d');
    const [hoveredBar, setHoveredBar] = useState(null);
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
    
    // Auth listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (!user) setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    // Fetch all data when user is authenticated
    useEffect(() => {
        if (!currentUser) return;
        
        const unsubscribes = [];
        
        // Wallet Balance
        unsubscribes.push(
            onSnapshot(doc(db, 'users', currentUser.uid, 'wallet', 'main'), (snap) => {
                setWalletBalance(snap.exists() ? (snap.data().balance || 0) : 0);
            })
        );
        
        // Accounts (Platforms)
        unsubscribes.push(
            onSnapshot(collection(db, 'users', currentUser.uid, 'accounts'), (snap) => {
                setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            })
        );
        
        // Projects
        unsubscribes.push(
            onSnapshot(query(collection(db, 'users', currentUser.uid, 'projects'), orderBy('createdAt', 'desc')), (snap) => {
                setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            })
        );
        
        // Expanders
        unsubscribes.push(
            onSnapshot(collection(db, 'users', currentUser.uid, 'expanders'), (snap) => {
                setExpanders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            })
        );
        
        // Transactions (History)
        unsubscribes.push(
            onSnapshot(query(collection(db, 'users', currentUser.uid, 'transactions'), orderBy('date', 'desc'), limit(10)), (snap) => {
                setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            })
        );
        
        // Content Queue
        unsubscribes.push(
            onSnapshot(collection(db, 'users', currentUser.uid, 'content_queue'), (snap) => {
                setContentQueue(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            })
        );
        
        setLoading(false);
        
        return () => unsubscribes.forEach(unsub => unsub());
    }, [currentUser]);
    
    // Computed Statistics
    const stats = useMemo(() => {
        const totalAccounts = accounts.length;
        const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followers || 0), 0);
        const totalVideos = accounts.reduce((sum, acc) => sum + (acc.videoCount || 0), 0);
        const totalProjects = projects.length;
        const activeProjects = projects.filter(p => p.status === 'active').length;
        const totalExpanders = expanders.length;
        const publishedExpanders = expanders.filter(e => e.isPublished || e.isPublishedFree).length;
        const pendingQueue = contentQueue.filter(c => c.status === 'pending').length;
        const todayPosts = contentQueue.filter(c => {
            if (!c.scheduledAt) return false;
            const scheduled = c.scheduledAt.seconds ? new Date(c.scheduledAt.seconds * 1000) : new Date(c.scheduledAt);
            const today = new Date();
            return scheduled.toDateString() === today.toDateString();
        }).length;
        
        // Platform breakdown
        const platformStats = {};
        accounts.forEach(acc => {
            const platform = acc.platform?.toLowerCase() || 'other';
            if (!platformStats[platform]) {
                platformStats[platform] = { count: 0, followers: 0, videos: 0 };
            }
            platformStats[platform].count++;
            platformStats[platform].followers += acc.followers || 0;
            platformStats[platform].videos += acc.videoCount || 0;
        });
        
        return {
            totalAccounts, totalFollowers, totalVideos, totalProjects, activeProjects,
            totalExpanders, publishedExpanders, pendingQueue, todayPosts, platformStats
        };
    }, [accounts, projects, expanders, contentQueue]);
    
    // Filtered Accounts for Table
    const filteredAccounts = useMemo(() => {
        let filtered = [...accounts];
        
        if (platformFilter !== 'all') {
            filtered = filtered.filter(acc => acc.platform?.toLowerCase() === platformFilter);
        }
        
        if (searchQuery.trim()) {
            const search = searchQuery.toLowerCase();
            filtered = filtered.filter(acc => 
                acc.name?.toLowerCase().includes(search) ||
                acc.platform?.toLowerCase().includes(search)
            );
        }
        
        return filtered;
    }, [accounts, platformFilter, searchQuery]);
    
    // Activity Badge Style
    const getActivityBadge = (type) => {
        const badges = {
            purchase: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '💰', label: 'ซื้อ' },
            free: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: '🎁', label: 'รับฟรี' },
            trial: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: '⏳', label: 'ทดลอง' },
            publish_free: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: '📤', label: 'แจกฟรี' },
            publish_sale: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '🏷️', label: 'ขาย' },
            sale_success: { bg: 'bg-green-500/20', text: 'text-green-400', icon: '✅', label: 'ขายได้' },
        };
        return badges[type] || { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: '📋', label: type };
    };
    
    // Chart data based on period filter
    const chartData = useMemo(() => {
        const now = new Date();
        let labels = [];
        let postsData = [];
        let followersData = [];
        
        switch (chartPeriod) {
            case '1d':
                // 24 ชั่วโมง
                labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
                postsData = Array.from({ length: 24 }, () => Math.floor(Math.random() * 10));
                followersData = Array.from({ length: 24 }, () => Math.floor(Math.random() * 50));
                break;
            case '7d':
                // 7 วัน
                labels = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
                postsData = [12, 19, 8, 25, 15, 22, 18];
                followersData = [150, 220, 180, 350, 280, 420, 380];
                break;
            case '1m':
                // 30 วัน (แบ่งเป็น 4 สัปดาห์)
                labels = ['สัปดาห์ 1', 'สัปดาห์ 2', 'สัปดาห์ 3', 'สัปดาห์ 4'];
                postsData = [85, 92, 78, 110];
                followersData = [1200, 1450, 980, 1680];
                break;
            case '1y':
                // 12 เดือน
                labels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                postsData = [320, 280, 350, 420, 380, 450, 520, 480, 390, 410, 460, 500];
                followersData = [4500, 5200, 4800, 6100, 5800, 7200, 8100, 7500, 6800, 7100, 7800, 8500];
                break;
            case 'custom':
                labels = ['ช่วงที่เลือก'];
                postsData = [Math.floor(Math.random() * 100)];
                followersData = [Math.floor(Math.random() * 1000)];
                break;
            default:
                labels = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
                postsData = [12, 19, 8, 25, 15, 22, 18];
                followersData = [150, 220, 180, 350, 280, 420, 380];
        }
        
        const maxPosts = Math.max(...postsData, 1);
        const maxFollowers = Math.max(...followersData, 1);
        
        return { labels, postsData, followersData, maxPosts, maxFollowers };
    }, [chartPeriod, customDateRange]);
    
    // Period filter options
    const periodOptions = [
        { value: '1d', label: '1 วัน', icon: Clock },
        { value: '7d', label: '7 วัน', icon: CalendarDays },
        { value: '1m', label: '1 เดือน', icon: Calendar },
        { value: '1y', label: '1 ปี', icon: CalendarRange },
        { value: 'custom', label: 'กำหนดเอง', icon: Filter },
    ];

    return (
        <div className="min-h-screen flex flex-col p-8 gap-6 bg-gradient-to-br from-red-900 via-slate-900 to-slate-950 text-white font-sans overflow-auto relative">
            {/* Subtle Background Effect */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/10 via-transparent to-transparent" />
            </div>

            {/* Header - Unified Box Style */}
            <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl overflow-hidden z-10">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                                <LayoutDashboard className="text-white" size={32} />
                            </div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-red-100 to-orange-200 tracking-tight">
                                Dashboard
                            </h1>
                            <p className="text-base text-slate-400 font-light flex items-center gap-2 mt-1">
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                                ภาพรวมทั้งหมดในที่เดียว
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            to="/learn?section=extension-update"
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600/20 to-blue-600/20 hover:from-purple-600/40 hover:to-blue-600/40 backdrop-blur-xl rounded-xl border border-purple-500/30 hover:border-purple-500/50 text-sm text-purple-300 hover:text-white transition-all group"
                        >
                            <Download size={16} className="group-hover:animate-bounce" />
                            <span className="font-medium">Update Extension</span>
                        </Link>
                        <div className="px-4 py-2 bg-black/30 backdrop-blur-xl rounded-xl border border-white/10 text-sm text-slate-300">
                            <Calendar size={16} className="inline mr-2 text-orange-400" />
                            {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Stats Grid - Unified Color Scheme */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 relative z-10">
                <StatCard 
                    icon={Wallet} 
                    label="ยอดเงินคงเหลือ" 
                    value={`${walletBalance.toLocaleString()} ฿`}
                    color="red"
                    loading={loading}
                />
                <StatCard 
                    icon={FolderKanban} 
                    label="โปรเจคทั้งหมด" 
                    value={stats.totalProjects}
                    subValue={`${stats.activeProjects} กำลังทำงาน`}
                    color="red"
                    loading={loading}
                />
                <StatCard 
                    icon={Share2} 
                    label="แพลตฟอร์มเชื่อมต่อ" 
                    value={stats.totalAccounts}
                    subValue={`${stats.totalFollowers.toLocaleString()} ผู้ติดตาม`}
                    color="orange"
                    loading={loading}
                />
                <StatCard 
                    icon={Layers} 
                    label="Expanders" 
                    value={stats.totalExpanders}
                    subValue={`${stats.publishedExpanders} กำลังขาย/แจกฟรี`}
                    color="orange"
                    loading={loading}
                />
                <StatCard 
                    icon={Clock} 
                    label="คิวรอโพสต์" 
                    value={stats.pendingQueue}
                    subValue={`${stats.todayPosts} โพสต์วันนี้`}
                    color="amber"
                    loading={loading}
                />
            </div>

            {/* Charts & Activity Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
                {/* Activity Chart */}
                <div className="lg:col-span-2 group relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-orange-500/30 transition-all duration-300 overflow-hidden">
                    {/* Subtle Glow Effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/3 to-orange-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                                    <BarChart3 size={20} className="text-white" />
                                </div>
                                กิจกรรมและสถิติ
                            </h3>
                            <p className="text-sm text-slate-400 mt-1">ภาพรวมการใช้งานระบบ</p>
                        </div>
                        
                        {/* Period Filter Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                            {periodOptions.map((option) => {
                                const Icon = option.icon;
                                const isActive = chartPeriod === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            setChartPeriod(option.value);
                                            if (option.value === 'custom') {
                                                setShowCustomDatePicker(true);
                                            } else {
                                                setShowCustomDatePicker(false);
                                            }
                                        }}
                                        className={`group/btn relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
                                            isActive
                                                ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg shadow-orange-500/30'
                                                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <Icon size={14} className={`transition-transform duration-300 ${isActive ? 'animate-pulse' : 'group-hover/btn:rotate-12'}`} />
                                        {option.label}
                                        {isActive && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Custom Date Picker */}
                    {showCustomDatePicker && chartPeriod === 'custom' && (
                        <div className="flex items-center gap-3 mb-4 p-3 bg-black/30 rounded-xl border border-white/10">
                            <input
                                type="date"
                                value={customDateRange.start}
                                onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                            <span className="text-slate-500">ถึง</span>
                            <input
                                type="date"
                                value={customDateRange.end}
                                onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    )}
                    
                    {/* Legend */}
                    <div className="flex items-center gap-6 mb-4 text-sm">
                        <span className="flex items-center gap-2">
                            <span className="w-4 h-4 bg-gradient-to-t from-blue-600 to-blue-400 rounded shadow-lg shadow-blue-500/30" />
                            <span className="text-slate-300">โพสต์</span>
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="w-4 h-4 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded shadow-lg shadow-emerald-500/30" />
                            <span className="text-slate-300">ผู้ติดตามใหม่</span>
                        </span>
                    </div>
                    
                    {/* Enhanced Bar Chart */}
                    <div className="flex items-end justify-between h-48 px-2 gap-1">
                        {chartData.labels.map((label, i) => (
                            <div 
                                key={i} 
                                className="flex flex-col items-center gap-2 flex-1 group/bar"
                                onMouseEnter={() => setHoveredBar(i)}
                                onMouseLeave={() => setHoveredBar(null)}
                            >
                                {/* Tooltip */}
                                {hoveredBar === i && (
                                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-black/90 backdrop-blur-xl px-4 py-3 rounded-xl border border-white/20 shadow-2xl z-50 whitespace-nowrap animate-fadeIn">
                                        <p className="text-xs text-slate-400 mb-1">{label}</p>
                                        <p className="text-sm font-bold text-blue-400 flex items-center gap-1">
                                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                                            โพสต์: {chartData.postsData[i]}
                                        </p>
                                        <p className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                                            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                                            ผู้ติดตาม: +{chartData.followersData[i].toLocaleString()}
                                        </p>
                                    </div>
                                )}
                                
                                {/* Bars */}
                                <div className="relative flex items-end gap-1 h-36 w-full justify-center">
                                    {/* Posts Bar */}
                                    <div 
                                        className={`w-5 bg-gradient-to-t from-blue-600 via-blue-500 to-blue-400 rounded-t-lg transition-all duration-500 cursor-pointer shadow-lg ${
                                            hoveredBar === i ? 'shadow-blue-500/50 scale-110 opacity-100' : 'shadow-blue-500/20 opacity-80 hover:opacity-100'
                                        }`}
                                        style={{ 
                                            height: `${(chartData.postsData[i] / chartData.maxPosts) * 100}%`, 
                                            minHeight: '12px',
                                            transform: hoveredBar === i ? 'scaleY(1.05)' : 'scaleY(1)',
                                            transformOrigin: 'bottom'
                                        }}
                                    />
                                    {/* Followers Bar */}
                                    <div 
                                        className={`w-5 bg-gradient-to-t from-emerald-600 via-emerald-500 to-emerald-400 rounded-t-lg transition-all duration-500 cursor-pointer shadow-lg ${
                                            hoveredBar === i ? 'shadow-emerald-500/50 scale-110 opacity-100' : 'shadow-emerald-500/20 opacity-80 hover:opacity-100'
                                        }`}
                                        style={{ 
                                            height: `${(chartData.followersData[i] / chartData.maxFollowers) * 100}%`, 
                                            minHeight: '12px',
                                            transform: hoveredBar === i ? 'scaleY(1.05)' : 'scaleY(1)',
                                            transformOrigin: 'bottom'
                                        }}
                                    />
                                </div>
                                
                                {/* Label */}
                                <span className={`text-xs transition-all duration-300 ${
                                    hoveredBar === i ? 'text-white font-bold scale-110' : 'text-slate-500'
                                }`}>
                                    {label}
                                </span>
                            </div>
                        ))}
                    </div>
                    
                    {/* Summary Stats */}
                    <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                            <p className="text-2xl font-black text-blue-400">{chartData.postsData.reduce((a, b) => a + b, 0)}</p>
                            <p className="text-xs text-slate-400">โพสต์ทั้งหมด</p>
                        </div>
                        <div className="text-center p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <p className="text-2xl font-black text-emerald-400">+{chartData.followersData.reduce((a, b) => a + b, 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-400">ผู้ติดตามใหม่</p>
                        </div>
                        <div className="text-center p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                            <p className="text-2xl font-black text-purple-400">{Math.round(chartData.postsData.reduce((a, b) => a + b, 0) / chartData.labels.length)}</p>
                            <p className="text-xs text-slate-400">เฉลี่ยโพสต์/ช่วง</p>
                        </div>
                        <div className="text-center p-3 bg-orange-500/10 rounded-xl border border-orange-500/20">
                            <p className="text-2xl font-black text-orange-400">{Math.max(...chartData.postsData)}</p>
                            <p className="text-xs text-slate-400">โพสต์สูงสุด</p>
                        </div>
                    </div>
                </div>

                {/* Platform Distribution */}
                <div className="group relative bg-gradient-to-br from-purple-900/30 to-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/10 p-6 hover:border-purple-500/30 transition-all duration-500 overflow-hidden">
                    {/* Glow Effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    
                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:animate-pulse">
                            <PieChart size={20} className="text-white" />
                        </div>
                        แพลตฟอร์มของคุณ
                    </h3>
                    
                    <div className="space-y-4">
                        {Object.entries(stats.platformStats).length > 0 ? (
                            Object.entries(stats.platformStats).map(([platform, data]) => {
                                const colors = {
                                    facebook: 'blue', instagram: 'pink', youtube: 'red', tiktok: 'cyan'
                                };
                                const color = colors[platform] || 'slate';
                                const percentage = stats.totalAccounts > 0 ? Math.round((data.count / stats.totalAccounts) * 100) : 0;
                                
                                return (
                                    <div key={platform} className="group/item p-3 bg-black/20 rounded-xl hover:bg-black/30 transition-all duration-300 cursor-pointer hover:scale-[1.02]">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-lg bg-${color}-500/20 flex items-center justify-center`}>
                                                    <PlatformIcon platform={platform} size={18} />
                                                </div>
                                                <span className="text-sm font-semibold text-white capitalize">{platform}</span>
                                            </div>
                                            <span className="text-sm font-bold text-white">{percentage}%</span>
                                        </div>
                                        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full bg-gradient-to-r from-${color}-600 to-${color}-400 rounded-full transition-all duration-500 group-hover/item:shadow-lg group-hover/item:shadow-${color}-500/30`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-400 mt-2">
                                            <span className="flex items-center gap-1"><Users size={12} /> {data.followers?.toLocaleString() || 0}</span>
                                            <span className="flex items-center gap-1"><Video size={12} /> {data.videos || 0} วีดีโอ</span>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-10 text-slate-500">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                                    <Share2 size={32} className="opacity-50" />
                                </div>
                                <p className="text-sm mb-2">ยังไม่มีแพลตฟอร์มเชื่อมต่อ</p>
                                <Link to="/platforms" className="inline-flex items-center gap-1 text-purple-400 text-sm hover:underline font-semibold">
                                    เพิ่มแพลตฟอร์ม <ArrowUpRight size={14} />
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Platform Table */}
            <div className="group relative bg-gradient-to-br from-green-900/20 to-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/10 p-6 hover:border-green-500/30 transition-all duration-500 overflow-hidden z-10">
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/5 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                                <Share2 size={20} className="text-white" />
                            </div>
                            รายละเอียดแพลตฟอร์ม
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">ข้อมูลทุกบัญชีที่เชื่อมต่อ</p>
                    </div>
                    
                    {/* Filters */}
                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="ค้นหาบัญชี..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-green-500 transition-all w-48"
                            />
                        </div>
                        
                        {/* Platform Filter */}
                        <div className="relative">
                            <GlassDropdown
                                value={platformFilter}
                                onChange={setPlatformFilter}
                                options={[
                                    { value: 'all', label: 'ทุกแพลตฟอร์ม' },
                                    { value: 'facebook', label: 'Facebook' },
                                    { value: 'instagram', label: 'Instagram' },
                                    { value: 'youtube', label: 'YouTube' },
                                    { value: 'tiktok', label: 'TikTok' }
                                ]}
                                buttonClassName="appearance-none pl-4 pr-10 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-green-500 cursor-pointer"
                            />
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
                
                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-400">บัญชี</th>
                                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-400">แพลตฟอร์ม</th>
                                <th className="text-right py-3 px-4 text-sm font-semibold text-slate-400">ผู้ติดตามทั้งหมด</th>
                                <th className="text-right py-3 px-4 text-sm font-semibold text-slate-400">ผู้ติดตามวันนี้</th>
                                <th className="text-right py-3 px-4 text-sm font-semibold text-slate-400">วีดีโอทั้งหมด</th>
                                <th className="text-center py-3 px-4 text-sm font-semibold text-slate-400">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center">
                                        <Loader2 size={32} className="animate-spin mx-auto text-slate-400" />
                                    </td>
                                </tr>
                            ) : filteredAccounts.length > 0 ? (
                                filteredAccounts.map((account) => (
                                    <tr key={account.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={account.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(account.name || 'A')}&background=random`} 
                                                    alt={account.name}
                                                    className="w-10 h-10 rounded-xl border border-white/10 group-hover:border-green-500/50 transition-all"
                                                />
                                                <div>
                                                    <p className="font-semibold text-white">{account.name || 'Unnamed'}</p>
                                                    <p className="text-xs text-slate-500">{account.username || account.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-2">
                                                <PlatformIcon platform={account.platform} size={18} />
                                                <span className="text-sm text-slate-300 capitalize">{account.platform || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <span className="text-white font-semibold">{(account.followers || 0).toLocaleString()}</span>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <span className={`font-semibold ${(account.followersToday || 0) > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                                                {(account.followersToday || 0) > 0 ? '+' : ''}{(account.followersToday || 0).toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <span className="text-white">{(account.videoCount || 0).toLocaleString()}</span>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-lg">
                                                <CheckCircle size={12} /> เชื่อมต่อแล้ว
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-500">
                                        <Share2 size={40} className="mx-auto mb-3 opacity-30" />
                                        <p className="text-lg font-semibold mb-1">ไม่พบบัญชี</p>
                                        <p className="text-sm">{searchQuery ? 'ลองค้นหาด้วยคำอื่น' : 'เพิ่มแพลตฟอร์มเพื่อเริ่มต้น'}</p>
                                        {!searchQuery && (
                                            <Link to="/platforms" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-semibold hover:bg-green-500/30 transition-all">
                                                <Share2 size={16} /> เพิ่มแพลตฟอร์ม
                                            </Link>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                {[
                    { to: '/projects', icon: FolderKanban, label: 'จัดการโปรเจค', color: 'blue', desc: 'จัดการโปรเจคโพสต์' },
                    { to: '/platforms', icon: Share2, label: 'เพิ่มแพลตฟอร์ม', color: 'green', desc: 'เชื่อมต่อบัญชีใหม่' },
                    { to: '/expander', icon: Layers, label: 'สร้าง Expander', color: 'orange', desc: 'สร้างเนื้อหาอัตโนมัติ' },
                    { to: '/marketplace', icon: ShoppingBag, label: 'Marketplace', color: 'purple', desc: 'ซื้อขาย Expander' },
                ].map((action, i) => (
                    <Link
                        key={i}
                        to={action.to}
                        className={`group relative flex flex-col gap-3 p-5 bg-gradient-to-br from-${action.color}-900/30 to-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/10 hover:border-${action.color}-500/50 transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl hover:shadow-${action.color}-500/20 overflow-hidden`}
                    >
                        {/* Glow Effect */}
                        <div className={`absolute inset-0 bg-gradient-to-r from-${action.color}-500/0 via-${action.color}-500/10 to-${action.color}-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000`} />
                        
                        <div className="flex items-center gap-3">
                            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-${action.color}-400 to-${action.color}-600 flex items-center justify-center shadow-lg shadow-${action.color}-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                                <action.icon className="text-white" size={28} />
                            </div>
                            <div>
                                <span className="font-bold text-white text-lg block">{action.label}</span>
                                <span className="text-xs text-slate-400">{action.desc}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-end">
                            <span className={`inline-flex items-center gap-1 text-${action.color}-400 text-sm font-semibold group-hover:translate-x-1 transition-transform`}>
                                ไปเลย <ArrowUpRight size={16} />
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
