import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, FolderKanban, Settings, LogIn, LogOut, User, Share2, Wand2, ShoppingBag, Shield, Users, Sparkles, Coins, Video, ChevronDown, Mic, Music, Clock, BookOpen, Download, Menu, X } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Platforms from './pages/Platforms';
import Admin from './pages/Admin';

import ModeCreator from './pages/ModeCreator';
import Marketplace from './pages/Marketplace';
import Characters from './pages/Characters';
import ExpanderCreator from './pages/ExpanderCreator';
import Payments from './pages/Payments';
import PodcastCreator from './pages/PodcastCreator';
import MusicCreator from './pages/MusicCreator';
import Learn from './pages/Learn';

const SettingsPage = () => (
  <div className="p-8">
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 text-white">
      <h1 className="text-3xl font-bold">Settings</h1>
    </div>
  </div>
);

function NavItem({ to, icon: Icon, label }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`group relative flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 overflow-hidden ${isActive
        ? 'bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white shadow-xl shadow-red-500/40 scale-[1.03]'
        : 'text-red-100 hover:bg-white/10 hover:text-white hover:scale-[1.02] hover:shadow-lg'
        }`}
    >
      {/* Sweep effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
      <Icon size={20} className={`relative z-10 transition-all duration-300 ${isActive ? 'animate-bounce' : 'group-hover:rotate-12 group-hover:scale-110'}`} />
      <span className="relative z-10 font-semibold">{label}</span>
      {isActive && <span className="absolute inset-0 rounded-2xl bg-white/10 animate-pulse" />}
    </Link>
  );
}

// Dropdown Menu Component
function NavItemDropdown({ icon: Icon, label, children, childPaths = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isChildActive = childPaths.includes(location.pathname);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 overflow-hidden ${isChildActive
          ? 'bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white shadow-xl shadow-red-500/40 scale-[1.03]'
          : 'text-red-100 hover:bg-white/10 hover:text-white hover:scale-[1.02] hover:shadow-lg'
          }`}
      >
        <div className="flex items-center gap-3">
          <Icon size={20} className={`relative z-10 transition-all duration-300 ${isChildActive ? 'animate-pulse' : 'group-hover:rotate-12 group-hover:scale-110'}`} />
          <span className="relative z-10 font-semibold">{label}</span>
        </div>
        <ChevronDown size={16} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Dropdown Menu */}
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
        <div className="pl-4 space-y-1 py-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// Sub Nav Item for dropdown
function SubNavItem({ to, icon: Icon, label }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`group relative flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 overflow-hidden ${isActive
        ? 'bg-white/20 text-white shadow-lg'
        : 'text-red-200/80 hover:bg-white/10 hover:text-white'
        }`}
    >
      <Icon size={16} className={`relative z-10 transition-all duration-300 ${isActive ? '' : 'group-hover:scale-110'}`} />
      <span className="relative z-10 text-sm font-medium">{label}</span>
    </Link>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    console.log("Setting up auth listener");
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;
      console.log("Current User:", currentUser);
      setUser(currentUser);

      if (currentUser) {
        try {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          const role = userSnap.data()?.role;
          if (isMounted) setIsAdmin(role === 'admin');
        } catch (error) {
          console.error('Failed to load user role:', error);
          if (isMounted) setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }

      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    console.log("Login clicked");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Show loading spinner while checking auth
if (loading) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-slate-900 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white text-lg">Loading...</p>
      </div>
    </div>
  );
}

// Show landing page if not logged in
if (!user) {
  return <LandingPage />;
}

// Show main app if logged in
return (
  <div className="flex h-screen bg-gradient-to-br from-red-900 via-slate-900 to-slate-950 text-white overflow-hidden relative">
    {/* Animated Background */}
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
    </div>

    {/* Mobile Overlay */}
    {sidebarOpen && (
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        onClick={() => setSidebarOpen(false)}
      />
    )}

    {/* Sidebar */}
    <aside className={`
      fixed md:relative inset-y-0 left-0 w-64 bg-black/30 backdrop-blur-2xl border-r border-white/10 flex flex-col shadow-2xl z-50
      transform transition-transform duration-300 ease-in-out
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      <div className="h-16 px-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30">
            <Sparkles className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-red-200 tracking-tight">Auto Post</h1>
            <p className="text-[10px] text-red-300/60 font-medium">Content Automation</p>
          </div>
        </div>
        {/* Close button for mobile */}
        <button 
          onClick={() => setSidebarOpen(false)}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X size={20} className="text-white" />
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto custom-scrollbar" onClick={() => setSidebarOpen(false)}>
        <NavItem to="/" icon={LayoutDashboard} label={t('common.dashboard')} />
        
        {/* VDO Creator Dropdown */}
        <NavItemDropdown icon={Video} label="VDO Creator" childPaths={['/projects', '/mode-creator', '/expander', '/characters']}>
          <SubNavItem to="/projects" icon={FolderKanban} label="Projects" />
          <SubNavItem to="/mode-creator" icon={Wand2} label="Mode System" />
          <SubNavItem to="/expander" icon={Sparkles} label="Expander" />
          <SubNavItem to="/characters" icon={Users} label="Characters" />
        </NavItemDropdown>
        
        <NavItem to="/marketplace" icon={ShoppingBag} label="Marketplace" />
        <NavItem to="/platforms" icon={Share2} label={t('common.platforms', 'Platforms')} />
        <NavItem to="/payments" icon={Coins} label="Payments" />
        {isAdmin && <NavItem to="/admin" icon={Shield} label="Admin Panel" />}
        <NavItem to="/settings" icon={Settings} label={t('common.settings')} />
        
        {/* Coming Soon Dropdown */}
        <NavItemDropdown icon={Clock} label="Coming Soon" childPaths={['/podcast-creator', '/music-creator']}>
          <SubNavItem to="/podcast-creator" icon={Mic} label="Podcast Creator" />
          <SubNavItem to="/music-creator" icon={Music} label="Music Creator" />
        </NavItemDropdown>

        {/* Learn / Help Section */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <NavItem to="/learn" icon={BookOpen} label="เรียนรู้" />
        </div>
      </nav>
    </aside>

    <div className="flex-1 flex flex-col min-w-0 relative z-10">
      {/* Header */}
      <header className="h-16 bg-black/20 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 md:px-8 shadow-lg">
        {/* Mobile Menu Button */}
        <button 
          onClick={() => setSidebarOpen(true)}
          className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors mr-2"
        >
          <Menu size={24} className="text-white" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse hidden sm:block" />
          <h2 className="text-base md:text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-white to-red-200 truncate">Studio Dashboard</h2>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {user ? (
            <div className="flex items-center gap-2 md:gap-4">
              <div className="group flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 bg-white/10 rounded-xl border border-white/10 hover:bg-white/20 hover:border-white/20 transition-all duration-300 cursor-pointer">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-lg border-2 border-white/20 group-hover:scale-110 transition-transform" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                    <User size={16} />
                  </div>
                )}
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold text-white">{user.displayName || 'User'}</p>
                  <p className="text-[10px] text-slate-400">{user.email?.split('@')[0]}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 md:p-2.5 bg-red-500/20 hover:bg-red-500 rounded-xl transition-all duration-300 text-red-300 hover:text-white hover:scale-110 border border-red-500/30"
                title={t('common.logout')}
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 hover:from-red-500 hover:to-red-400 transition-all hover:scale-105"
            >
              <LogIn size={18} />
              {t('common.login')}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/platforms" element={<Platforms />} />
          <Route path="/mode-creator" element={<ModeCreator />} />
          <Route path="/expander" element={<ExpanderCreator />} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/podcast-creator" element={<PodcastCreator />} />
          <Route path="/music-creator" element={<MusicCreator />} />
          {isAdmin && <Route path="/admin" element={<Admin />} />}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  </div>
);
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
