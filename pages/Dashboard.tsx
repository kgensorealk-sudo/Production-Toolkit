import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Search, 
    RefreshCw, 
    Pin, 
    PinOff, 
    HelpCircle, 
    ArrowRight, 
    Lock, 
    Key, 
    Sparkles,
    Cpu,
    FileText,
    MessageSquare,
    Database,
    Table,
    GitCompare,
    Eraser,
    Tags,
    Link,
    SearchCode,
    RefreshCcw,
    FileSearch,
    UserCheck,
    Highlighter,
    Trash2,
    ShieldAlert,
    SortAsc,
    FileCode
} from 'lucide-react';
import { ToolId } from '../types';
import { useAuth, withRetry } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { supabase } from '../supabaseClient';
import AnnouncementModal from '../components/AnnouncementModal';
import ToolTipsModal from '../components/ToolTipsModal';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';

interface ToolCardProps {
    id: ToolId;
    title: string;
    desc: string;
    iconBg: string;
    iconText: string;
    borderColor: string;
    Icon: React.FC<any>;
    onClick: () => void;
    onTipClick: (e: React.MouseEvent) => void;
    onPinClick: (e: React.MouseEvent) => void;
    isPinned: boolean;
    delay: number;
    lockType: 'key' | 'subscription' | 'none';
    isFree: boolean;
    expiry?: string;
    isExperimental?: boolean;
}

const ToolCard: React.FC<ToolCardProps> = ({ id, title, desc, iconBg, iconText, borderColor, Icon, onClick, onTipClick, onPinClick, isPinned, delay, lockType, isFree, expiry, isExperimental }) => {
    const isKeyExclusive = id === ToolId.TABLE_BEAUTIFIER || id === ToolId.CITATION_LINKER;
    const isLocked = lockType !== 'none' && !isFree;
    
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [hasSeenTips, setHasSeenTips] = useState(() => {
        return localStorage.getItem(`tips_seen_${id}`) === 'true';
    });

    useEffect(() => {
        if (!isFree || !expiry) return;
        
        const update = () => {
            const diff = new Date(expiry).getTime() - new Date().getTime();
            if (diff <= 0) return setTimeLeft('Expiring...');
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            if (days > 0) setTimeLeft(`${days}d ${hours}h ${minutes}m`);
            else if (hours > 0) setTimeLeft(`${hours}h ${minutes}m remaining`);
            else setTimeLeft(`${minutes}m remaining`);
        };

        update();
        const timer = setInterval(update, 60000);
        return () => clearInterval(timer);
    }, [isFree, expiry]);

    const handleTipInternal = (e: React.MouseEvent) => {
        e.stopPropagation();
        localStorage.setItem(`tips_seen_${id}`, 'true');
        setHasSeenTips(true);
        onTipClick(e);
    };
    
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay / 1000, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -4 }}
            onClick={onClick}
            className={`group relative glass-panel rounded-3xl p-1 transition-all duration-500 cursor-pointer ${isLocked ? 'opacity-60' : ''} ${isFree && isKeyExclusive ? 'ring-4 ring-emerald-400/20' : ''}`}
        >
            <div className={`h-full bg-white rounded-[1.4rem] p-5 flex flex-col border border-slate-100 relative overflow-hidden ${isLocked ? 'grayscale-[0.9]' : ''}`}>
                <div className={`absolute top-0 left-0 w-full h-1 ${isLocked ? 'bg-slate-200' : (isFree ? 'bg-emerald-500' : borderColor)}`}></div>
                
                <div className="flex justify-between items-start mb-6">
                    <div className={`w-12 h-12 ${isLocked ? 'bg-slate-50' : (isFree ? 'bg-emerald-50' : iconBg)} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-sm border border-slate-100`}>
                        <Icon className={`h-6 w-6 ${isLocked ? 'text-slate-300' : (isFree ? 'text-emerald-600' : iconText)}`} />
                    </div>

                    <div className="flex gap-2">
                        <button 
                            onClick={handleTipInternal}
                            className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-amber-50 hover:text-amber-500 hover:border-amber-100 transition-all duration-300 relative"
                        >
                            <HelpCircle size={16} />
                            {!hasSeenTips && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-ping"></span>}
                        </button>

                        <button 
                            onClick={(e) => { e.stopPropagation(); onPinClick(e); }}
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-300 ${isPinned ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-100 text-slate-300 hover:text-indigo-600 hover:border-indigo-100'}`}
                        >
                            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                    </div>
                </div>

                <div className="flex flex-col flex-grow">
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className={`text-lg font-black transition-colors uppercase tracking-tight ${isLocked ? 'text-slate-400' : 'text-slate-800 group-hover:text-indigo-700'}`}>{title}</h3>
                        {isExperimental && (
                            <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-widest">
                                Experimental
                            </span>
                        )}
                        {isFree && (
                            <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-widest">
                                {timeLeft || 'Free'}
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 text-xs leading-relaxed font-medium line-clamp-2">{desc}</p>
                </div>
                
                <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                    {isLocked ? (
                        <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-300 uppercase tracking-widest">
                            {lockType === 'key' ? <Key size={10} /> : <Lock size={10} />}
                            {lockType === 'key' ? 'Key Required' : 'Enterprise Only'}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                            Open Module <ArrowRight size={10} />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { profile, freeTools, freeToolsData, refreshProfile, isAdmin, isWakingUp } = useAuth();
    const { isHardwareAccelerated, setHardwareAccelerated } = useSettings();
    const [isSyncing, setIsLoading] = useState(false);
    const [syncMessage, setSyncMessage] = useState('Syncing Node...');
    const [searchTerm, setSearchTerm] = useState('');
    const [pinnedTools, setPinnedTools] = useState<ToolId[]>(() => {
        try {
            const saved = localStorage.getItem('pinned_tools');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [activeTipTool, setActiveTipTool] = useState<{id: string, name: string} | null>(null);
    const isFirstRender = useRef(true);

    useEffect(() => {
        localStorage.setItem('pinned_tools', JSON.stringify(pinnedTools));
    }, [pinnedTools]);

    const getLockType = (toolId: ToolId): 'key' | 'subscription' | 'none' => {
        if (isAdmin) return 'none';
        const isKeyExclusive = toolId === ToolId.TABLE_BEAUTIFIER || toolId === ToolId.CITATION_LINKER;
        if (profile?.is_subscribed && !isKeyExclusive) return 'none';
        const hasSpecificKey = profile?.unlocked_tools?.includes(toolId) || profile?.unlocked_tools?.includes('universal');
        if (hasSpecificKey) return 'none';
        if (toolId === ToolId.XML_RENUMBER || toolId === ToolId.CREDIT_GENERATOR || isKeyExclusive) return 'key';
        return 'subscription';
    };

    // Safety Timeout for Sync State
    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        if (isSyncing) {
            timeout = setTimeout(() => {
                console.warn("Sync operation timed out. Forcing state to false.");
                setIsLoading(false);
                setToast({ msg: "Sync response delayed. Please check your connection.", type: 'warn' });
            }, 30000); // 30s safety cutoff
        }
        return () => clearTimeout(timeout);
    }, [isSyncing]);

    const handleSync = async () => {
        if (isSyncing) return;
        setIsLoading(true);
        setSyncMessage('Establishing Connection...');
        
        const failTimer = setTimeout(() => {
            setIsLoading(false);
            setToast({ msg: "System timed out after 30s. Check network environment.", type: "warn" });
        }, 30000);

        try {
            await withRetry(async () => await refreshProfile(), 3);
            clearTimeout(failTimer);
            setToast({ msg: "Node integrity synchronized with database.", type: "success" });
        } catch (e: any) {
            clearTimeout(failTimer);
            setToast({ msg: `Sync failure: ${e.message || 'Network Timeout'}`, type: "error" });
        } finally {
            setIsLoading(false);
            setSyncMessage('Syncing Node...');
        }
    };

    const ALL_TOOLS_RAW = [
        { id: ToolId.XML_RENUMBER, title: "XML Normalizer", desc: "Automatically renumbers bibliography citations and updates all cross-references.", iconBg: "bg-blue-50", iconText: "text-blue-600", borderColor: "bg-blue-500", Icon: Database },
        { id: ToolId.REF_EXTRACTOR, title: "Bibliography Extractor", desc: "Pure-text bibliography isolation with automated punctuation and spacing normalization for Word.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: FileSearch },
        { id: ToolId.GRANT_TAGGER, title: "Grant Tagger", desc: "Identify and tag grant sponsors and numbers within funding statements with XML cross-linking.", iconBg: "bg-emerald-50", iconText: "text-emerald-600", borderColor: "bg-emerald-500", Icon: Tags },
        { id: ToolId.UNCITED_CLEANER, title: "Uncited Ref Cleaner", desc: "Detect references with no body citations. Perform bulk purging while preserving document integrity.", iconBg: "bg-rose-50", iconText: "text-rose-600", borderColor: "bg-rose-600", Icon: Eraser },
        { id: ToolId.ID_AUDITOR, title: "ID Prefix Auditor", desc: "Audit and normalize ID sequences in references. Fixes non-standard prefixes while maintaining internal document links.", iconBg: "bg-violet-50", iconText: "text-violet-600", borderColor: "bg-violet-500", Icon: ShieldAlert },
        { id: ToolId.CITATION_LINKER, title: "Citation Linker Pro", desc: "Auto-scans orphan citation tags and links them to bibliography IDs based on text content.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: Link },
        { id: ToolId.OTHER_REF_SCANNER, title: "Other-Ref Scanner", desc: "Isolate unstructured references for external transfer. Supports formatted HTML copy.", iconBg: "bg-amber-50", iconText: "text-amber-600", borderColor: "bg-amber-500", Icon: Search },
        { id: ToolId.REFERENCE_GEN, title: "Reference Updater", desc: "Merge updated/corrected references into existing XML lists while optionally preserving ID integrity.", iconBg: "bg-cyan-50", iconText: "text-cyan-600", borderColor: "bg-cyan-500", Icon: RefreshCcw },
        { id: ToolId.CREDIT_GENERATOR, title: "CRediT Tagging", desc: "Smart-detects roles from raw text, auto-corrects typos, and generates standardized NISO CRediT XML.", iconBg: "bg-purple-50", iconText: "text-purple-600", borderColor: "bg-purple-500", Icon: UserCheck },
        { id: ToolId.HIGHLIGHTS_GEN, title: "Highlights Gen", desc: "Convert rich text input into standardized author-highlights XML structures.", iconBg: "bg-amber-50", iconText: "text-amber-600", borderColor: "bg-amber-500", Icon: Highlighter },
        { id: ToolId.QUICK_DIFF, title: "Quick Text Diff", desc: "Instant side-by-side text comparison with line numbers and character-level highlights.", iconBg: "bg-orange-50", iconText: "text-orange-600", borderColor: "bg-orange-500", Icon: FileText },
        { id: ToolId.TAG_CLEANER, title: "XML Tag Cleaner", desc: "Safstrip specific editing option tags while maintaining document structure.", iconBg: "bg-teal-50", iconText: "text-teal-600", borderColor: "bg-teal-500", Icon: Eraser },
        { id: ToolId.TABLE_FIXER, title: "XML Table Fixer", desc: "Manage table footnotes by detaching them to legends or attaching legends back to cells.", iconBg: "bg-pink-50", iconText: "text-pink-600", borderColor: "bg-pink-500", Icon: Table },
        { id: ToolId.TABLE_BEAUTIFIER, title: "Table XML Beautifier", desc: "Transform single-line table rows into structured multi-line formatted entry blocks.", iconBg: "bg-pink-50", iconText: "text-pink-600", borderColor: "bg-pink-400", Icon: Sparkles },
        { id: ToolId.WORD_TO_XML, title: "MS Word to XML Converter", desc: "Paste MS Word text with superscript, subscript, bold, italics, & paragraphs to automatically scan and generate XML.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: FileCode },
        { id: ToolId.VIEW_SYNC, title: "View Synchronizer", desc: "Mirror content between paragraph views while maintaining ID integrity and references.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: RefreshCw },
        { id: ToolId.STRUCTURAL_ARCHITECT, title: "Reference Structure Repair", desc: "Audit and auto-repair XML reference structures, ID sequences, author initials, empty tags, and source text.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: Cpu }
    ];

    const filteredTools = useMemo(() => {
        if (!searchTerm.trim()) return ALL_TOOLS_RAW;
        const low = searchTerm.toLowerCase();
        return ALL_TOOLS_RAW.filter(t => t.title.toLowerCase().includes(low) || t.desc.toLowerCase().includes(low));
    }, [searchTerm]);

    const sections = useMemo(() => {
        const filtered = filteredTools;
        const featured = filtered.filter(t => !pinnedTools.includes(t.id) && (freeTools.includes(t.id) && (t.id === ToolId.TABLE_BEAUTIFIER || t.id === ToolId.CITATION_LINKER)));
        const pinned = filteredTools.filter(t => pinnedTools.includes(t.id));
        const active = filtered.filter(t => !pinnedTools.includes(t.id) && !featured.some(f => f.id === t.id) && (freeTools.includes(t.id) || getLockType(t.id) === 'none'));
        const locked = filtered.filter(t => !pinnedTools.includes(t.id) && !featured.some(f => f.id === t.id) && !freeTools.includes(t.id) && getLockType(t.id) !== 'none');
        return { featured, pinned, active, locked };
    }, [profile, freeTools, isAdmin, pinnedTools, filteredTools]);

    const handleTipClick = (toolId: string, toolName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveTipTool({ id: toolId, name: toolName });
    };

    const handlePinClick = (toolId: ToolId) => {
        setPinnedTools(prev => prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId]);
    };

    return (
        <div className="max-w-[1800px] mx-auto px-4 py-12 sm:px-6 lg:px-10">
            {activeTipTool && <ToolTipsModal toolId={activeTipTool.id} toolName={activeTipTool.name} isOpen={!!activeTipTool} onClose={() => setActiveTipTool(null)} />}

            <AnimatePresence>
                {(isSyncing || isWakingUp) && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md"
                    >
                        <LoadingOverlay message={isWakingUp ? 'Waking Database Nodes...' : syncMessage} color="indigo" />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mb-12">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-col md:flex-row md:items-end justify-between gap-8"
                >
                    <div className="max-w-2xl">
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-4 uppercase">
                            Workspace <span className="text-indigo-600">Console</span>
                        </h2>
                        <p className="text-slate-500 font-medium leading-relaxed">
                            Integrated environment for technical XML production and citation integrity management. 
                            Select a module below to begin processing.
                        </p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative w-full sm:w-80 group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                                <Search size={16} strokeWidth={3} />
                            </div>
                            <input 
                                type="text" 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-bold text-slate-700 uppercase tracking-widest text-[10px] placeholder:text-slate-300" 
                                placeholder="Search Node Library..." 
                            />
                        </div>
                        <button 
                            onClick={() => setHardwareAccelerated(!isHardwareAccelerated)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all active:scale-95 shadow-sm text-[10px] font-black uppercase tracking-widest ${isHardwareAccelerated ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500'}`}
                        >
                            <Cpu size={14} />
                            {isHardwareAccelerated ? 'Accel On' : 'Accel Off'}
                        </button>
                        <button 
                            onClick={handleSync} 
                            disabled={isSyncing} 
                            className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all active:scale-95 shadow-sm text-[10px] font-black uppercase tracking-widest ${isSyncing ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500'}`}
                        >
                            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                            {isSyncing ? 'Syncing...' : 'Sync Node'}
                        </button>
                    </div>
                </motion.div>
            </div>

            <div className="space-y-16">
                {sections.featured.length > 0 && (
                    <section>
                        <div className="flex items-center gap-4 mb-8 px-2">
                            <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-indigo-600" />
                                <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] whitespace-nowrap">Priority Protocol Access</h3>
                            </div>
                            <div className="h-px bg-slate-200 w-full"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {sections.featured.map((tool) => (
                                <ToolCard key={`featured-${tool.id}`} {...tool} delay={50} isPinned={pinnedTools.includes(tool.id)} onPinClick={() => handlePinClick(tool.id)} lockType={getLockType(tool.id)} isFree={freeTools.includes(tool.id)} expiry={freeToolsData[tool.id]} onClick={() => navigate(`/${tool.id}`)} onTipClick={(e) => handleTipClick(tool.id, tool.title, e)} />
                            ))}
                        </div>
                    </section>
                )}

                {sections.pinned.length > 0 && (
                    <section>
                        <div className="flex items-center gap-4 mb-8 px-2">
                            <div className="flex items-center gap-2">
                                <Pin size={16} className="text-indigo-600" />
                                <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] whitespace-nowrap">Pinned Operations</h3>
                            </div>
                            <div className="h-px bg-slate-200 w-full"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {sections.pinned.map((tool) => (
                                <ToolCard key={`pinned-${tool.id}`} {...tool} delay={50} isPinned={true} onPinClick={() => handlePinClick(tool.id)} lockType={getLockType(tool.id)} isFree={freeTools.includes(tool.id)} expiry={freeToolsData[tool.id]} onClick={() => navigate(`/${tool.id}`)} onTipClick={(e) => handleTipClick(tool.id, tool.title, e)} />
                            ))}
                        </div>
                    </section>
                )}

                {sections.active.length > 0 && (
                    <section>
                        <div className="flex items-center gap-4 mb-8 px-2">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] whitespace-nowrap">Active Node Modules</h3>
                            <div className="h-px bg-slate-100 w-full"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {sections.active.map((tool, index) => (
                                <ToolCard key={`active-${tool.id}`} {...tool} delay={100 + (index * 20)} isPinned={false} onPinClick={() => handlePinClick(tool.id)} lockType={getLockType(tool.id)} isFree={freeTools.includes(tool.id)} expiry={freeToolsData[tool.id]} onClick={() => navigate(`/${tool.id}`)} onTipClick={(e) => handleTipClick(tool.id, tool.title, e)} />
                            ))}
                        </div>
                    </section>
                )}

                {sections.locked.length > 0 && (
                    <section>
                        <div className="flex items-center gap-4 mb-8 px-2">
                            <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] whitespace-nowrap">Premium System Library</h3>
                            <div className="h-px bg-slate-100 w-full"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {sections.locked.map((tool, index) => (
                                <ToolCard key={`locked-${tool.id}`} {...tool} delay={200 + (index * 20)} isPinned={false} onPinClick={() => handlePinClick(tool.id)} lockType={getLockType(tool.id)} isFree={freeTools.includes(tool.id)} onClick={() => navigate(`/${tool.id}`)} onTipClick={(e) => handleTipClick(tool.id, tool.title, e)} />
                            ))}
                        </div>
                    </section>
                )}
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default Dashboard;