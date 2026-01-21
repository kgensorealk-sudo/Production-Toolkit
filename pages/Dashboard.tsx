import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToolId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import AnnouncementModal from '../components/AnnouncementModal';
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
    delay: number;
    lockType: 'key' | 'subscription' | 'none';
    isFree: boolean;
    expiry?: string;
}

const ToolCard: React.FC<ToolCardProps> = ({ id, title, desc, iconBg, iconText, borderColor, Icon, onClick, delay, lockType, isFree, expiry }) => {
    const isLocked = lockType !== 'none' && !isFree;
    const [timeLeft, setTimeLeft] = useState<string>('');

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
    
    return (
        <div 
            onClick={onClick}
            className={`glass-panel rounded-[2.5rem] p-1 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 cursor-pointer group animate-slide-up bg-white/80 ${isLocked ? 'opacity-60' : ''}`}
            style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
        >
            <div className={`h-full bg-white rounded-[2.2rem] p-8 flex flex-col border border-slate-100 relative overflow-hidden ${isLocked ? 'grayscale-[0.9]' : ''}`}>
                <div className={`absolute top-0 left-0 w-full h-1.5 ${isLocked ? 'bg-slate-200' : (isFree ? 'bg-emerald-500' : borderColor)}`}></div>
                
                {isFree ? (
                    <div className="absolute top-5 right-5 z-20">
                        <span className="bg-emerald-500 text-white text-[9px] font-black px-3 py-1.5 rounded-full border border-emerald-400 uppercase tracking-widest flex items-center gap-1.5 shadow-lg shadow-emerald-500/30 animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                            Free Access {timeLeft && `• ${timeLeft}`}
                        </span>
                    </div>
                ) : isLocked && (
                    <div className="absolute top-5 right-5 z-20">
                        <span className={`text-[8px] font-black px-2 py-1 rounded-md border uppercase tracking-widest flex items-center gap-1.5 shadow-sm bg-slate-50 text-slate-400 border-slate-100`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            Locked
                        </span>
                    </div>
                )}

                <div className="flex items-start justify-between mb-8">
                    <div className={`w-16 h-16 ${isLocked ? 'bg-slate-50' : (isFree ? 'bg-emerald-50' : iconBg)} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-sm border border-slate-100`}>
                        <Icon className={`h-8 w-8 ${isLocked ? 'text-slate-300' : (isFree ? 'text-emerald-600' : iconText)}`} />
                    </div>
                    <div className={`transition-all transform translate-x-2 -translate-y-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 duration-500 ${isLocked ? 'text-slate-200' : 'text-indigo-500'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                    </div>
                </div>

                <h3 className={`text-xl font-black mb-3 transition-colors uppercase tracking-tight ${isLocked ? 'text-slate-400' : 'text-slate-800 group-hover:text-indigo-700'}`}>{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed flex-grow font-medium">{desc}</p>
                
                {isLocked && (
                    <div className="mt-6 pt-4 border-t border-slate-50">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{lockType === 'key' ? 'Persistent Key Required' : 'Enterprise Subscription Only'}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { profile, freeTools, freeToolsData, refreshProfile } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    const getLockType = (toolId: ToolId): 'key' | 'subscription' | 'none' => {
        const role = profile?.role?.toLowerCase();
        if (role === 'admin') return 'none';
        if (profile?.is_subscribed) return 'none';
        if (toolId === ToolId.XML_RENUMBER || toolId === ToolId.CREDIT_GENERATOR) {
            if (profile?.unlocked_tools?.includes(toolId) || profile?.unlocked_tools?.includes('universal')) return 'none';
            return 'key';
        }
        return 'subscription';
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await refreshProfile();
            setToast({ msg: "Node integrity synchronized with database.", type: "success" });
        } catch (e) {
            setToast({ msg: "Synchronization failed.", type: "error" });
        } finally {
            setIsSyncing(false);
        }
    };

    const ALL_TOOLS = [
        { id: ToolId.XML_RENUMBER, title: "XML Normalizer", desc: "Automatically renumbers bibliography citations and updates all cross-references.", iconBg: "bg-blue-50", iconText: "text-blue-600", borderColor: "bg-blue-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg> },
        { id: ToolId.REF_EXTRACTOR, title: "Bibliography Extractor", desc: "Pure-text bibliography isolation with automated punctuation and spacing normalization for Word.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
        { id: ToolId.REF_PURGER, title: "Ref List Purger", desc: "Surgically remove reported uncited items from your XML source with high-precision matching.", iconBg: "bg-rose-50", iconText: "text-rose-600", borderColor: "bg-rose-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> },
        { id: ToolId.UNCITED_CLEANER, title: "Uncited Ref Cleaner", desc: "Detect references with no body citations. Perform bulk purging while preserving document integrity.", iconBg: "bg-rose-50", iconText: "text-rose-600", borderColor: "bg-rose-600", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> },
        { id: ToolId.OTHER_REF_SCANNER, title: "Other-Ref Scanner", desc: "Isolate unstructured references for external transfer. Supports formatted HTML copy.", iconBg: "bg-amber-50", iconText: "text-amber-600", borderColor: "bg-amber-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
        { id: ToolId.REFERENCE_GEN, title: "Reference Updater", desc: "Merge updated/corrected references into existing XML lists while optionally preserving ID integrity.", iconBg: "bg-cyan-50", iconText: "text-cyan-600", borderColor: "bg-cyan-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> },
        { id: ToolId.REF_DUPE_CHECK, title: "Ref Dupe Checker", desc: "Find and merge citations with similar titles. Auto-relinks references to the kept item.", iconBg: "bg-rose-50", iconText: "text-rose-600", borderColor: "bg-rose-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
        { id: ToolId.CREDIT_GENERATOR, title: "CRediT Tagging", desc: "Smart-detects roles from raw text, auto-corrects typos, and generates standardized NISO CRediT XML.", iconBg: "bg-purple-50", iconText: "text-purple-600", borderColor: "bg-purple-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
        { id: ToolId.HIGHLIGHTS_GEN, title: "Highlights Gen", desc: "Convert rich text input into standardized author-highlights XML structures.", iconBg: "bg-amber-50", iconText: "text-amber-600", borderColor: "bg-amber-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
        { id: ToolId.QUICK_DIFF, title: "Quick Text Diff", desc: "Instant side-by-side text comparison with line numbers and character-level highlights.", iconBg: "bg-orange-50", iconText: "text-orange-600", borderColor: "bg-orange-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
        { id: ToolId.TAG_CLEANER, title: "XML Tag Cleaner", desc: "Safely strip specific editing option tags while maintaining document structure.", iconBg: "bg-teal-50", iconText: "text-teal-600", borderColor: "bg-teal-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> },
        { id: ToolId.TABLE_FIXER, title: "XML Table Fixer", desc: "Manage table footnotes by detaching them to legends or attaching legends back to cells.", iconBg: "bg-pink-50", iconText: "text-pink-600", borderColor: "bg-pink-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
        { id: ToolId.VIEW_SYNC, title: "View Synchronizer", desc: "Mirror content between paragraph views while maintaining ID integrity and references.", iconBg: "bg-indigo-50", iconText: "text-indigo-600", borderColor: "bg-indigo-500", Icon: (props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> }
    ];

    const sections = useMemo(() => {
        const active = ALL_TOOLS.filter(t => freeTools.includes(t.id) || getLockType(t.id) === 'none');
        const locked = ALL_TOOLS.filter(t => !freeTools.includes(t.id) && getLockType(t.id) !== 'none');
        return { active, locked };
    }, [profile, freeTools]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8">
            <AnnouncementModal />
            <div className="text-center mb-16 animate-fade-in">
                <h2 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tighter mb-6 uppercase">
                    Workspace <span className="text-indigo-600">Console</span>
                </h2>
                <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed font-medium">
                    Integrated environment for technical XML production and citation integrity management.
                </p>
                
                <div className="mt-10 flex flex-wrap justify-center gap-4">
                    {freeTools.length > 0 && !profile?.is_subscribed && (
                        <div className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-50 rounded-full border border-emerald-100 text-emerald-600 text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/10">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            Automatic Provisioning: {freeTools.length} Modules Active
                        </div>
                    )}
                    
                    <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 rounded-full border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                        title="Force refresh account permissions"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSyncing ? 'animate-spin text-indigo-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {isSyncing ? 'Syncing...' : 'Node Integrity Sync'}
                    </button>
                </div>
            </div>

            {/* Active Modules Section */}
            {sections.active.length > 0 && (
                <div className="mb-20">
                    <div className="flex items-center gap-4 mb-10 px-2">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] whitespace-nowrap">Active Node Modules</h3>
                        <div className="h-px bg-slate-100 w-full"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {sections.active.map((tool, index) => (
                            <ToolCard 
                                key={tool.id}
                                {...tool}
                                delay={100 + (index * 50)}
                                lockType={getLockType(tool.id)}
                                isFree={freeTools.includes(tool.id)}
                                expiry={freeToolsData[tool.id]}
                                onClick={() => navigate(`/${tool.id}`)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Locked Modules Section */}
            {sections.locked.length > 0 && (
                <div>
                    <div className="flex items-center gap-4 mb-10 px-2">
                        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.4em] whitespace-nowrap">Premium System Library</h3>
                        <div className="h-px bg-slate-100 w-full"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {sections.locked.map((tool, index) => (
                            <ToolCard 
                                key={tool.id}
                                {...tool}
                                delay={200 + (index * 50)}
                                lockType={getLockType(tool.id)}
                                isFree={freeTools.includes(tool.id)}
                                onClick={() => navigate(`/${tool.id}`)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default Dashboard;