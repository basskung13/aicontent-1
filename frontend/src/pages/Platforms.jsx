import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Plus, Trash2, CheckCircle, AlertCircle, Facebook, Instagram, Youtube, Video, Pencil, Check, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const TABS = [
    { id: 'all', label: 'All Platforms' },
    { id: 'facebook', label: 'Facebook', icon: Facebook },
    { id: 'tiktok', label: 'TikTok', icon: Video },
    { id: 'instagram', label: 'Instagram', icon: Instagram },
    { id: 'youtube', label: 'YouTube', icon: Youtube }
];

const Toast = ({ message, isVisible }) => {
    if (!isVisible) return null;
    return (
        <div className="fixed bottom-8 right-8 bg-green-500 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 z-50">
            <CheckCircle size={20} />
            <span className="font-bold">{message}</span>
        </div>
    );
};

const AccountCard = ({ account, userId, onRemove, onShowToast }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempName, setTempName] = useState(account.name);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!tempName.trim()) return;
        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'users', userId, 'accounts', account.id), {
                name: tempName
            });
            setIsEditing(false);
            onShowToast("Account name updated successfully.");
        } catch (error) {
            console.error("Error updating name:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="group relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-green-500/30 hover:shadow-2xl hover:shadow-green-500/10 transition-all duration-500 overflow-hidden hover:scale-[1.02]">
            {/* Glow Effect on Hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/5 to-green-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <div className="flex items-start justify-between mb-4 relative">
                <div className="flex items-center gap-4 w-full">
                    <div className="relative">
                        <img src={account.avatar} alt={account.name} className="w-14 h-14 rounded-2xl border-2 border-green-500/30 shadow-lg shadow-green-500/20 group-hover:border-green-400/50 transition-all duration-300" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse" />
                    </div>

                    <div className="flex-1 min-w-0">
                        {isEditing ? (
                            <div className="flex items-center gap-2 animate-in fade-in duration-200">
                                <input
                                    type="text"
                                    value={tempName}
                                    onChange={(e) => setTempName(e.target.value)}
                                    className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-1 text-white text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-white/20"
                                    autoFocus
                                    placeholder="Account Name"
                                />
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="p-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300 rounded-lg transition-all"
                                    title="Save"
                                >
                                    <Check size={16} />
                                </button>
                                <button
                                    onClick={() => { setIsEditing(false); setTempName(account.name); }}
                                    className="p-1.5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-all"
                                    title="Cancel"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group/edit">
                                <h3 className="font-bold text-white text-lg truncate">{account.name}</h3>
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="text-slate-400 hover:text-white transition-colors opacity-0 group-hover/edit:opacity-100 p-1.5 hover:bg-white/5 rounded-full"
                                    title="Edit Name"
                                >
                                    <Pencil size={14} />
                                </button>
                            </div>
                        )}

                        <span className="text-xs text-gray-400 capitalize flex items-center gap-1 mt-0.5">
                            {account.platform} <CheckCircle size={12} className="text-green-500" />
                        </span>
                    </div>
                </div>

                {!isEditing && (
                    <div className={`ml-2 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg ${account.status === 'active' ? 'bg-gradient-to-r from-green-500/30 to-emerald-500/30 text-green-300 border border-green-500/30 shadow-green-500/20' : 'bg-gradient-to-r from-red-500/30 to-rose-500/30 text-red-300 border border-red-500/30 shadow-red-500/20'}`}>
                        {account.status}
                    </div>
                )}
            </div>

            <button
                onClick={() => onRemove(account.id)}
                className="group/btn relative w-full mt-4 py-3 flex items-center justify-center gap-2 text-red-300 hover:text-white rounded-xl transition-all duration-300 text-sm font-bold overflow-hidden border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/20 hover:shadow-lg hover:shadow-red-500/20"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/10 to-red-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-500" />
                <Trash2 size={16} className="group-hover/btn:rotate-12 transition-transform duration-300" /> Remove
            </button>
        </div>
    );
};

export default function Platforms() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('all');
    const [currentUser, setCurrentUser] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState({ message: '', isVisible: false });

    // Toast Helper
    const showToast = (message) => {
        setToast({ message, isVisible: true });
        setTimeout(() => setToast({ message: '', isVisible: false }), 3000);
    };

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user) {
                const accountsRef = collection(db, 'users', user.uid, 'accounts');
                const unsubscribeSnapshot = onSnapshot(accountsRef, (snapshot) => {
                    const loadedAccounts = [];
                    snapshot.forEach(doc => {
                        loadedAccounts.push({ id: doc.id, ...doc.data() });
                    });
                    setAccounts(loadedAccounts);
                    setIsLoading(false);
                });
                return () => unsubscribeSnapshot();
            } else {
                setAccounts([]);
                setIsLoading(false);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    const handleConnectAccount = async (platformId) => {
        if (!currentUser) return;

        // Mock Connection Logic
        const newAccount = {
            platform: platformId,
            name: `${platformId.charAt(0).toUpperCase() + platformId.slice(1)} Account`,
            connectedAt: new Date().toISOString(),
            status: 'active',
            avatar: `https://ui-avatars.com/api/?name=${platformId}&background=random`
        };

        try {
            await setDoc(doc(collection(db, 'users', currentUser.uid, 'accounts')), newAccount);
            showToast(`${newAccount.name} label added successfully.`);
        } catch (error) {
            console.error("Error connecting account:", error);
        }
    };

    const handleRemove = async (accountId) => {
        if (!currentUser) return;
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'accounts', accountId));
            showToast("Account label removed successfully.");
        } catch (error) {
            console.error("Error removing account:", error);
        }
    };

    const filteredAccounts = activeTab === 'all'
        ? accounts
        : accounts.filter(acc => acc.platform === activeTab);

    return (
        <div className="p-8 max-w-6xl mx-auto relative">
            <Toast message={toast.message} isVisible={toast.isVisible} />

            <header className="mb-8 flex items-center gap-4">
                <div className="relative group">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30 animate-pulse group-hover:scale-110 transition-transform duration-300">
                        <Share2 size={32} className="text-white group-hover:rotate-12 transition-transform duration-300" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 animate-ping" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-black">{accounts.length}</span>
                    </div>
                </div>
                <div>
                    <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-pink-200 drop-shadow-2xl tracking-tight">Managed Accounts</h1>
                    <p className="text-lg text-purple-200/60 font-light flex items-center gap-2 mt-1">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        กำหนด Label บัญชีสำหรับ Automation Agents
                    </p>
                </div>
            </header>

            {/* TABS */}
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide bg-black/30 backdrop-blur-xl p-2 rounded-2xl border border-white/10 w-fit">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={twMerge(
                                "group relative px-5 py-3 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap flex items-center gap-2",
                                activeTab === tab.id
                                    ? "bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white shadow-lg shadow-red-500/40 scale-105"
                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                            )}
                        >
                            {Icon && <Icon size={18} className={`transition-transform duration-300 ${activeTab === tab.id ? 'animate-bounce' : 'group-hover:rotate-12'}`} />}
                            {tab.label}
                            {activeTab === tab.id && <span className="absolute inset-0 rounded-xl bg-white/10 animate-pulse" />}
                        </button>
                    )
                })}
            </div>

            {/* CONNECT BUTTON (Contextual) */}
            {activeTab !== 'all' && (
                <div className="mb-8">
                    <button
                        onClick={() => handleConnectAccount(activeTab)}
                        className="group flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 hover:from-red-500 hover:to-red-400 transition-all hover:scale-105"
                    >
                        <Plus size={20} className="group-hover:rotate-90 transition-transform" />
                        Add New {TABS.find(t => t.id === activeTab)?.label} Label
                    </button>
                </div>
            )}

            {/* ACCOUNTS LIST */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    <div className="col-span-full text-center py-20 text-white/30">Loading accounts...</div>
                ) : filteredAccounts.length === 0 ? (
                    <div className="col-span-full relative flex flex-col items-center justify-center py-20 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 border-dashed overflow-hidden">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-red-500/10 rounded-full blur-3xl" />
                        <AlertCircle size={56} className="text-white/20 mb-4" />
                        <p className="text-slate-400 text-lg font-medium">No {activeTab !== 'all' ? activeTab : ''} accounts added yet.</p>
                        {activeTab === 'all' && <p className="text-slate-500 text-sm mt-2">Select a platform tab to add an account label.</p>}
                    </div>
                ) : (
                    filteredAccounts.map(account => (
                        <AccountCard
                            key={account.id}
                            account={account}
                            userId={currentUser?.uid}
                            onRemove={handleRemove}
                            onShowToast={showToast}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
