
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    User, 
    Key, 
    Shield, 
    Clock, 
    CheckCircle2, 
    Lock, 
    ChevronRight,
    AlertCircle,
    Zap,
    Database,
    FileSearch,
    Tags,
    Eraser,
    ShieldAlert,
    Link,
    Search,
    RefreshCcw,
    UserCheck,
    Highlighter,
    FileText,
    Table,
    Sparkles,
    RefreshCw,
    Settings,
    Monitor,
    Bell,
    LogOut,
    Globe,
    Cpu,
    Activity,
    MessageSquare
} from 'lucide-react';
import { useAuth, withRetry } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { supabase, supabaseUrl } from '../supabaseClient';
import { getDeviceId } from '../utils/device';
import LoadingOverlay from '../components/LoadingOverlay';
import Switch from '../components/Switch';
import { ToolId, UserProfile, DefaultAvatar } from '../types';

const TOOL_METADATA: Record<string, { title: string, Icon: React.FC<any>, color: string, hex: string }> = {
    [ToolId.XML_RENUMBER]: { title: "XML Normalizer", Icon: Database, color: "text-blue-600", hex: "#2563eb" },
    [ToolId.XML_RENUMBER_EXP]: { title: "XML Normalizer Pro (Experimental)", Icon: Database, color: "text-blue-600", hex: "#2563eb" },
    [ToolId.REF_EXTRACTOR]: { title: "Bibliography Extractor", Icon: FileSearch, color: "text-indigo-600", hex: "#4f46e5" },
    [ToolId.GRANT_TAGGER]: { title: "Grant Tagger", Icon: Tags, color: "text-emerald-600", hex: "#059669" },
    [ToolId.UNCITED_CLEANER]: { title: "Uncited Ref Cleaner", Icon: Eraser, color: "text-rose-600", hex: "#e11d48" },
    [ToolId.ID_AUDITOR]: { title: "ID Prefix Auditor", Icon: ShieldAlert, color: "text-violet-600", hex: "#7c3aed" },
    [ToolId.CITATION_LINKER]: { title: "Citation Linker Pro", Icon: Link, color: "text-indigo-600", hex: "#4f46e5" },
    [ToolId.CITATION_LINKER_EXP]: { title: "Citation Linker Pro (Experimental)", Icon: Link, color: "text-indigo-600", hex: "#4f46e5" },
    [ToolId.OTHER_REF_SCANNER]: { title: "Other-Ref Scanner", Icon: Search, color: "text-amber-600", hex: "#d97706" },
    [ToolId.REFERENCE_GEN]: { title: "Reference Updater", Icon: RefreshCcw, color: "text-cyan-600", hex: "#0891b2" },
    [ToolId.CREDIT_GENERATOR]: { title: "CRediT Tagging", Icon: UserCheck, color: "text-purple-600", hex: "#9333ea" },
    [ToolId.HIGHLIGHTS_GEN]: { title: "Highlights Gen", Icon: Highlighter, color: "text-amber-600", hex: "#d97706" },
    [ToolId.QUICK_DIFF]: { title: "Quick Text Diff", Icon: FileText, color: "text-orange-600", hex: "#ea580c" },
    [ToolId.TAG_CLEANER]: { title: "XML Tag Cleaner", Icon: Eraser, color: "text-teal-600", hex: "#0d9488" },
    [ToolId.TABLE_FIXER]: { title: "XML Table Fixer", Icon: Table, color: "text-pink-600", hex: "#db2777" },
    [ToolId.TABLE_BEAUTIFIER]: { title: "Table XML Beautifier", Icon: Sparkles, color: "text-pink-600", hex: "#db2777" },
    [ToolId.VIEW_SYNC]: { title: "View Synchronizer", Icon: RefreshCw, color: "text-indigo-600", hex: "#4f46e5" },
    [ToolId.REF_DUPE_CHECK]: { title: "Duplicate Ref Remover", Icon: RefreshCcw, color: "text-rose-500", hex: "#f43f5e" },
    [ToolId.COMMENT_REPLACER]: { title: "Comment Replacer", Icon: MessageSquare, color: "text-blue-500", hex: "#3b82f6" },
    [ToolId.SECTION_AUDITOR]: { title: "Section Auditor", Icon: FileSearch, color: "text-emerald-500", hex: "#10b981" },
    [ToolId.AFFILIATION_SEQUENCER]: { title: "Affiliation Sequencer", Icon: Link, color: "text-violet-500", hex: "#8b5cf6" },
    [ToolId.STRUCTURAL_ARCHITECT]: { title: "Structural Node Architect", Icon: Database, color: "text-indigo-500", hex: "#6366f1" },
};

const UserSettings: React.FC = () => {
    const { profile, user, refreshProfile, loading, isAdmin, updateProfile, deleteAccount, signOut } = useAuth();
    const { isHardwareAccelerated, setHardwareAccelerated } = useSettings();
    const [activeTab, setActiveTab] = useState<'profile' | 'keys' | 'security' | 'system'>('profile');
    const [keyInput, setKeyInput] = useState('');
    const [keyLoading, setKeyLoading] = useState(false);
    const [keyError, setKeyError] = useState<string | null>(null);
    const [keySuccess, setKeySuccess] = useState<string | null>(null);
    const [topTools, setTopTools] = useState<{ toolId: string, count: number }[]>([]);
    
    // Profile State
    const [displayName, setDisplayName] = useState(profile?.display_name || '');
    const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const [defaultAvatars, setDefaultAvatars] = useState<DefaultAvatar[]>([]);
    const [showAvatarPresets, setShowAvatarPresets] = useState(false);

    useEffect(() => {
        const fetchDefaultAvatars = async () => {
            try {
                const { data, error } = await supabase
                    .from('default_avatars')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                if (data) setDefaultAvatars(data);
            } catch (err) {
                console.error("Error fetching default avatars:", err);
            }
        };
        fetchDefaultAvatars();
    }, []);
    
    // System State
    const [ping, setPing] = useState<number | null>(null);
    const [systemInfo, setSystemInfo] = useState({
        os: 'Detecting...',
        browser: 'Detecting...',
        version: 'Detecting...'
    });

    useEffect(() => {
        // Detect System Info
        const ua = navigator.userAgent;
        let os = "Unknown OS";
        if (ua.indexOf("Win") !== -1) os = "Windows";
        if (ua.indexOf("Mac") !== -1) os = "macOS";
        if (ua.indexOf("Linux") !== -1) os = "Linux";
        if (ua.indexOf("Android") !== -1) os = "Android";
        if (ua.indexOf("like Mac") !== -1) os = "iOS";

        let browser = "Unknown Browser";
        let version = "Unknown";
        if (ua.indexOf("Chrome") !== -1) {
            browser = "Chrome";
            version = ua.substring(ua.indexOf("Chrome") + 7).split(" ")[0];
        } else if (ua.indexOf("Firefox") !== -1) {
            browser = "Firefox";
            version = ua.substring(ua.indexOf("Firefox") + 8);
        } else if (ua.indexOf("Safari") !== -1) {
            browser = "Safari";
            version = ua.substring(ua.indexOf("Safari") + 7).split(" ")[0];
        } else if (ua.indexOf("Edge") !== -1) {
            browser = "Edge";
            version = ua.substring(ua.indexOf("Edge") + 5).split(" ")[0];
        }

        setSystemInfo({ os, browser, version });

        // Ping Test
        const testPing = async () => {
            const start = Date.now();
            try {
                await fetch(supabaseUrl, { method: 'HEAD', mode: 'no-cors' });
                setPing(Date.now() - start);
            } catch (e) {
                setPing(null);
            }
        };
        testPing();
        const interval = setInterval(testPing, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || '');
            setAvatarUrl(profile.avatar_url || '');
        }
    }, [profile]);

    useEffect(() => {
        const fetchTopTools = async () => {
            if (!user?.id) return;
            
            try {
                const { data, error } = await supabase
                    .from('usage_logs')
                    .select('tool_id')
                    .eq('user_id', user.id);
                
                if (error) throw error;

                if (data) {
                    const counts: Record<string, number> = {};
                    data.forEach(log => {
                        counts[log.tool_id] = (counts[log.tool_id] || 0) + 1;
                    });
                    
                    const sorted = Object.entries(counts)
                        .filter(([toolId]) => !!TOOL_METADATA[toolId])
                        .map(([toolId, count]) => ({ toolId, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 3);
                    
                    setTopTools(sorted);
                }
            } catch (err) {
                console.error("Error fetching top tools:", err);
            }
        };
        
        if (activeTab === 'profile') {
            fetchTopTools();
        }
    }, [user?.id, activeTab]);

    const handleUpdateProfile = async () => {
        setIsUpdatingProfile(true);
        try {
            await updateProfile({
                display_name: displayName,
                avatar_url: avatarUrl
            });
            setKeySuccess("Profile updated successfully");
            setTimeout(() => setKeySuccess(null), 3000);
        } catch (err) {
            setKeyError("Failed to update profile");
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    const handleRevokeOthers = async () => {
        try {
            const { error } = await supabase.auth.signOut({ scope: 'others' });
            if (error) throw error;
            setKeySuccess("Other sessions revoked successfully");
            setTimeout(() => setKeySuccess(null), 3000);
        } catch (err) {
            setKeyError("Failed to revoke other sessions");
        }
    };

    const handleUnlockKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setKeyError(null);
        setKeySuccess(null);
        
        const keyString = keyInput.trim().toUpperCase();
        if (!keyString || !user) return;

        setKeyLoading(true);
        try {
            const currentDeviceId = getDeviceId();

            await withRetry(async () => {
                // 1. Check if key exists
                const { data: keyData, error: fetchError } = await supabase
                    .from('access_keys')
                    .select('*')
                    .eq('key', keyString)
                    .single();

                if (fetchError || !keyData) {
                    throw new Error("Invalid access key. Please check the code and try again.");
                }

                // 2. Check usage status
                if (keyData.is_used && keyData.user_id !== user.id) {
                    throw new Error("This key is already bound to another user account.");
                }

                // 3. Bind to current User AND current Device
                const { error: updateError } = await supabase
                    .from('access_keys')
                    .update({ 
                        is_used: true, 
                        used_at: new Date().toISOString(),
                        user_id: user.id,
                        device_id: currentDeviceId 
                    })
                    .eq('id', keyData.id);

                if (updateError) {
                    throw new Error("Activation failed. Please try again.");
                }

                // 4. Success
                await refreshProfile();
                setKeySuccess(`Successfully unlocked: ${keyData.tool === 'universal' ? 'All Modules (Universal Access)' : keyData.tool}`);
            }, 3);
            setKeyInput('');
        } catch (err: any) {
            console.error(err);
            setKeyError(err.message || "Verification Failed");
        } finally {
            setKeyLoading(false);
        }
    };

    if (loading || !profile) {
        return <LoadingOverlay message="Loading User Environment..." color="indigo" />;
    }

    return (
        <div className="flex-grow p-4 sm:p-6 bg-slate-50">
            <div className="max-w-6xl mx-auto">
                <header className="mb-10">
                    <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">User Settings</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs mt-2">Manage your identity and access protocols</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar Tabs */}
                    <div className="lg:col-span-1 space-y-2">
                        <button 
                            onClick={() => setActiveTab('profile')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'profile' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                            <User size={16} />
                            Profile
                        </button>
                        <button 
                            onClick={() => setActiveTab('keys')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'keys' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                            <Key size={16} />
                            Access Keys
                        </button>
                        <button 
                            onClick={() => setActiveTab('security')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'security' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                            <Shield size={16} />
                            Security
                        </button>
                        <button 
                            onClick={() => setActiveTab('system')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'system' ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                            <Monitor size={16} />
                            System Node
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="lg:col-span-3">
                        <AnimatePresence mode="wait">
                            {activeTab === 'profile' ? (
                                <motion.div 
                                    key="profile"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="flex flex-col sm:flex-row items-center gap-8 mb-10">
                                            <div className="relative group">
                                                <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-xl shadow-indigo-100 overflow-hidden">
                                                    {avatarUrl ? (
                                                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <User size={48} strokeWidth={2.5} />
                                                    )}
                                                </div>
                                                <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-xl shadow-lg border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Sparkles size={14} className="text-indigo-600" />
                                                </div>
                                            </div>
                                            <div className="flex-grow text-center sm:text-left space-y-4">
                                                <div className="space-y-1">
                                                    <input 
                                                        type="text"
                                                        value={displayName}
                                                        onChange={(e) => setDisplayName(e.target.value)}
                                                        placeholder="Enter Display Name"
                                                        className="text-2xl font-black text-slate-900 uppercase tracking-tight bg-transparent border-b-2 border-transparent hover:border-slate-100 focus:border-indigo-500 outline-none transition-all w-full max-w-xs"
                                                    />
                                                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{profile.email}</p>
                                                </div>
                                                <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                                                    <button 
                                                        onClick={() => setShowAvatarPresets(!showAvatarPresets)}
                                                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 border-2 ${showAvatarPresets ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'}`}
                                                    >
                                                        {showAvatarPresets ? 'Close Presets' : 'Change Avatar'}
                                                    </button>
                                                    <button 
                                                        onClick={handleUpdateProfile}
                                                        disabled={isUpdatingProfile}
                                                        className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                                                    >
                                                        {isUpdatingProfile ? 'Saving...' : 'Update Identity'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Default Avatars Selection */}
                                        <AnimatePresence>
                                            {showAvatarPresets && defaultAvatars.length > 0 && (
                                                <motion.div 
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden mb-10"
                                                >
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Identity Presets</h4>
                                                    </div>
                                                    <div className="flex flex-wrap gap-4">
                                                        {defaultAvatars.map(avatar => (
                                                            <button
                                                                key={avatar.id}
                                                                onClick={() => setAvatarUrl(avatar.url)}
                                                                className={`relative w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all group ${avatarUrl === avatar.url ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-slate-300'}`}
                                                                title={avatar.name}
                                                            >
                                                                <img src={avatar.url} alt={avatar.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                <div className={`absolute inset-0 bg-indigo-500/20 flex items-center justify-center transition-opacity ${avatarUrl === avatar.url ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                                    <CheckCircle2 size={16} className="text-white" />
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                                <div className="flex items-center gap-3 mb-4 text-slate-400">
                                                    <Shield size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Account Role</span>
                                                </div>
                                                <p className={`text-lg font-black text-slate-900 tracking-tight ${isAdmin ? '' : 'uppercase'}`}>
                                                    {isAdmin ? 'admin' : profile.role}
                                                </p>
                                            </div>

                                            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                                <div className="flex items-center gap-3 mb-4 text-slate-400">
                                                    <Zap size={16} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Subscription</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-lg font-black text-slate-900 uppercase tracking-tight">
                                                        {profile.is_subscribed ? 'Active' : 'Inactive'}
                                                    </p>
                                                    {profile.is_subscribed && (
                                                        <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Verified</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Most Used Tools Section */}
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Most Used Tools</h3>
                                                <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Your top 3 most frequently accessed modules</p>
                                            </div>
                                            <div className="px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100">
                                                <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Usage Analytics</span>
                                            </div>
                                        </div>

                                        {topTools.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                {topTools.map(({ toolId, count }, index) => {
                                                    const meta = TOOL_METADATA[toolId];
                                                    const IconComponent = meta?.Icon || Shield;
                                                    
                                                    return (
                                                        <motion.div 
                                                            key={toolId}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ delay: index * 0.1 }}
                                                            className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
                                                        >
                                                            <div className="flex items-center gap-4 mb-3">
                                                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-50 group-hover:scale-110 transition-transform ${meta?.color || 'text-slate-400'}`}>
                                                                    <IconComponent size={20} />
                                                                </div>
                                                                <div className="flex-grow min-w-0">
                                                                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight truncate">
                                                                        {meta?.title || toolId}
                                                                    </p>
                                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                                                        {count} {count === 1 ? 'Use' : 'Uses'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                <motion.div 
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${Math.max(4, Math.min(100, (count / (topTools[0]?.count || 1)) * 100))}%` }}
                                                                    className="h-full"
                                                                    style={{ backgroundColor: meta?.hex || '#94a3b8' }}
                                                                />
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                                <Clock size={24} className="mx-auto text-slate-300 mb-2" />
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No usage data available yet</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ) : activeTab === 'keys' ? (
                                <motion.div 
                                    key="keys"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    {/* Key Input Section */}
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="mb-8">
                                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Activate Module</h2>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">Enter an access key to unlock specific tools</p>
                                        </div>

                                        <form onSubmit={handleUnlockKey} className="space-y-6">
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    value={keyInput}
                                                    onChange={(e) => setKeyInput(e.target.value)}
                                                    placeholder="XXXX-XXXX-XXXX"
                                                    className="w-full px-6 py-5 rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-900 focus:ring-0 focus:border-indigo-500 transition-all text-xl tracking-[0.3em] font-mono shadow-inner outline-none uppercase placeholder:text-slate-200"
                                                    disabled={keyLoading}
                                                />
                                            </div>

                                            <button 
                                                type="submit"
                                                disabled={keyLoading || !keyInput.trim()}
                                                className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black py-5 rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                                            >
                                                {keyLoading ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <CheckCircle2 size={18} />
                                                )}
                                                {keyLoading ? 'Validating...' : 'Activate Key'}
                                            </button>
                                        </form>

                                        {keyError && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600"
                                            >
                                                <AlertCircle size={18} />
                                                <p className="text-[10px] font-black uppercase tracking-widest">{keyError}</p>
                                            </motion.div>
                                        )}

                                        {keySuccess && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600"
                                            >
                                                <CheckCircle2 size={18} />
                                                <p className="text-[10px] font-black uppercase tracking-widest">{keySuccess}</p>
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* Unlocked Tools List */}
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="mb-6">
                                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Unlocked Modules</h3>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Tools currently active on your account</p>
                                        </div>

                                        {profile.unlocked_tools.length > 0 ? (
                                            <div className="space-y-3">
                                                {profile.unlocked_tools.includes('universal') ? (
                                                    <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                                                                <Zap size={16} />
                                                            </div>
                                                            <span className="text-xs font-black text-indigo-900 uppercase tracking-widest">Universal Access</span>
                                                        </div>
                                                        <span className="text-[8px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Master Key</span>
                                                    </div>
                                                ) : (
                                                    profile.unlocked_tools.map((toolId) => {
                                                        const meta = TOOL_METADATA[toolId];
                                                        const IconComponent = meta?.Icon || Shield;
                                                        
                                                        return (
                                                            <div key={toolId} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-500 shadow-sm border border-slate-100">
                                                                        <IconComponent size={16} className={meta?.color || 'text-slate-400'} />
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{meta?.title || toolId}</span>
                                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Module ID: {toolId}</span>
                                                                    </div>
                                                                </div>
                                                                <CheckCircle2 size={16} className="text-emerald-500" />
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-[2rem]">
                                                <Lock size={32} className="mx-auto text-slate-200 mb-4" />
                                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No additional modules unlocked</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ) : activeTab === 'security' ? (
                                <motion.div 
                                    key="security"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="mb-8">
                                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Active Sessions</h3>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Manage other devices logged into your node</p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-slate-900 shadow-sm border border-slate-100">
                                                        <Monitor size={20} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Current Session</p>
                                                        <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-tighter">Active Now • {systemInfo.os}</p>
                                                    </div>
                                                </div>
                                                <span className="text-[8px] font-black bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-widest">Primary</span>
                                            </div>

                                            <div className="pt-4">
                                                <button 
                                                    onClick={handleRevokeOthers}
                                                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 font-black uppercase tracking-widest text-[10px] hover:bg-rose-100 transition-all active:scale-95"
                                                >
                                                    <LogOut size={16} />
                                                    Revoke All Other Sessions
                                                </button>
                                                <p className="text-center text-slate-400 font-bold uppercase tracking-widest text-[8px] mt-3">This will force logout on all other devices</p>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="system"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-white rounded-[2.5rem] p-8 sm:p-10 shadow-xl border border-slate-200">
                                        <div className="mb-8">
                                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Workstation Metadata</h3>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Technical specifications of your current environment</p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-slate-100">
                                                    <Cpu size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Operating System</p>
                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{systemInfo.os}</p>
                                                </div>
                                            </div>

                                            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm border border-slate-100">
                                                    <Globe size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Browser Engine</p>
                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{systemInfo.browser} v{systemInfo.version}</p>
                                                </div>
                                            </div>

                                            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-slate-100">
                                                    <Activity size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Network Latency</p>
                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                                        {ping !== null ? `${ping}ms` : 'Calculating...'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-violet-600 shadow-sm border border-slate-100">
                                                    <Database size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Database Node</p>
                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Supabase-jtrvp</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl border border-slate-800 text-white overflow-hidden relative">
                                        <div className="absolute top-0 right-0 p-10 opacity-10">
                                            <Cpu size={120} />
                                        </div>
                                        <div className="relative z-10">
                                            <h3 className="text-lg font-black uppercase tracking-tight mb-2">Node Integrity</h3>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mb-6">Hardware acceleration and security status</p>
                                            
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between py-2 border-b border-slate-800">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hardware Acceleration</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setHardwareAccelerated(!isHardwareAccelerated)}
                                                        className={`w-10 h-5 rounded-full transition-all relative ${isHardwareAccelerated ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                                    >
                                                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isHardwareAccelerated ? 'right-1' : 'left-1'}`} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-between py-2 border-b border-slate-800">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SSL Encryption</span>
                                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">AES-256-GCM</span>
                                                </div>
                                                <div className="flex items-center justify-between py-2">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Node Version</span>
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">v3.4.0-PRO</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserSettings;
