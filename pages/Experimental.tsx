import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { 
    Search, 
    HelpCircle, 
    ArrowRight, 
    Lock, 
    Key, 
    Pin, 
    PinOff,
    Cpu,
    Database,
    Link
} from 'lucide-react';
import { ToolId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import ToolTipsModal from '../components/ToolTipsModal';
import Toast from '../components/Toast';

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
            if (days > 0) setTimeLeft(`${days}d ${hours}h`);
            else setTimeLeft(`${hours}h remaining`);
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
            <div className={`h-full bg-white rounded-[1.4rem] p-6 flex flex-col border border-slate-100 relative overflow-hidden ${isLocked ? 'grayscale-[0.9]' : ''}`}>
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

const Experimental: React.FC = () => {
    const navigate = useNavigate();
    const { profile, freeTools, freeToolsData, isAdmin } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [pinnedTools, setPinnedTools] = useState<ToolId[]>(() => {
        try {
            const saved = localStorage.getItem('pinned_tools');
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [activeTipTool, setActiveTipTool] = useState<{id: string, name: string} | null>(null);

    const getLockType = (toolId: ToolId): 'key' | 'subscription' | 'none' => {
        if (isAdmin) return 'none';
        const isKeyExclusive = toolId === ToolId.TABLE_BEAUTIFIER || toolId === ToolId.CITATION_LINKER;
        if (profile?.is_subscribed && !isKeyExclusive) return 'none';
        const hasSpecificKey = profile?.unlocked_tools?.includes(toolId) || profile?.unlocked_tools?.includes('universal');
        if (hasSpecificKey) return 'none';
        if (toolId === ToolId.XML_RENUMBER || toolId === ToolId.CREDIT_GENERATOR || isKeyExclusive) return 'key';
        return 'subscription';
    };

    const EXPERIMENTAL_TOOLS = [
        { id: ToolId.XML_RENUMBER_EXP, title: "XML Normalizer Pro (Experimental)", desc: "Advanced sequential citation renumbering with alphabetical sorting, range compression, and other-ref isolation.", iconBg: "bg-blue-50", iconText: "text-blue-600", borderColor: "bg-blue-500", Icon: Database, isExperimental: true },
        { id: ToolId.CITATION_LINKER_EXP, title: "Citation Linker Pro MAX", desc: "Multi-entity citation linker with fuzzy author/year resolution, float cross-refs, and auto-text detection.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: Link, isExperimental: true }
    ];

    const filteredTools = useMemo(() => {
        if (!searchTerm.trim()) return EXPERIMENTAL_TOOLS;
        const low = searchTerm.toLowerCase();
        return EXPERIMENTAL_TOOLS.filter(t => t.title.toLowerCase().includes(low) || t.desc.toLowerCase().includes(low));
    }, [searchTerm]);

    const handleTipClick = (toolId: string, toolName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveTipTool({ id: toolId, name: toolName });
    };

    const handlePinClick = (toolId: ToolId) => {
        setPinnedTools(prev => {
            const next = prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId];
            localStorage.setItem('pinned_tools', JSON.stringify(next));
            return next;
        });
    };

    return (
        <div className="max-w-full mx-auto px-2 py-12 sm:px-4 lg:px-6">
            {activeTipTool && <ToolTipsModal toolId={activeTipTool.id} toolName={activeTipTool.name} isOpen={!!activeTipTool} onClose={() => setActiveTipTool(null)} />}

            <div className="mb-12">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-end justify-between gap-8"
                >
                    <div className="max-w-2xl">
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-4 uppercase">
                            Experimental <span className="text-amber-600">Protocols</span>
                        </h2>
                        <p className="text-slate-500 font-medium leading-relaxed">
                            A sandbox for non-official tools and experimental modules. 
                            These protocols are under active development and may be moved to the official toolkit once robust.
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="relative w-full sm:w-80 group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-amber-500 transition-colors">
                                <Search size={16} strokeWidth={3} />
                            </div>
                            <input 
                                type="text" 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all outline-none font-bold text-slate-700 uppercase tracking-widest text-[10px] placeholder:text-slate-300" 
                                placeholder="Search Experimental Nodes..." 
                            />
                        </div>
                    </div>
                </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTools.map((tool, index) => (
                    <ToolCard 
                        key={tool.id} 
                        {...tool} 
                        delay={100 + (index * 20)} 
                        isPinned={pinnedTools.includes(tool.id)} 
                        onPinClick={() => handlePinClick(tool.id)} 
                        lockType={getLockType(tool.id)} 
                        isFree={freeTools.includes(tool.id)} 
                        expiry={freeToolsData[tool.id]} 
                        onClick={() => navigate(`/${tool.id}`)} 
                        onTipClick={(e) => handleTipClick(tool.id, tool.title, e)} 
                    />
                ))}
            </div>

            {filteredTools.length === 0 && (
                <div className="text-center py-24">
                    <Cpu size={48} className="mx-auto mb-4 text-slate-200" />
                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No experimental protocols found matching your search.</p>
                </div>
            )}
        </div>
    );
};

export default Experimental;
