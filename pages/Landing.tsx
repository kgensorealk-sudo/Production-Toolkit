import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Zap, 
    Shield, 
    Cpu, 
    ArrowRight, 
    CheckCircle2, 
    Globe, 
    Lock, 
    MessageSquare,
    Database,
    FileText,
    UserCheck,
    Highlighter,
    GitCompare,
    Eraser
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';
import TermsModal from '../components/TermsModal';
import { Scale } from 'lucide-react';

const TOOLS_INFO = [
    {
        title: "XML Ref Normalizer",
        problem: "Manual renumbering breaks links.",
        solution: "Automates citation sequencing and updates cross-references instantly.",
        color: "text-blue-600 bg-blue-50",
        icon: Database
    },
    {
        title: "Reference Updater",
        problem: "Dirty corrections ruin integrity.",
        solution: "Surgically merges updates while preserving existing body linking IDs.",
        color: "text-sky-600 bg-sky-50",
        icon: FileText
    },
    {
        title: "CRediT Tagging",
        problem: "Author roles are messy & unstructured.",
        solution: "Smart-detects roles, fixes typos, and generates standard XML tags.",
        color: "text-purple-600 bg-purple-50",
        icon: UserCheck
    },
    {
        title: "Highlights Gen",
        problem: "Rich text doesn't paste into XML.",
        solution: "Converts bullets, bold, and italics into 'author-highlights' XML structures.",
        color: "text-yellow-600 bg-yellow-50",
        icon: Highlighter
    },
    {
        title: "Quick Text Diff",
        problem: "Spotting XML edits is difficult.",
        solution: "Side-by-side comparison with precision character-level highlighting.",
        color: "text-orange-600 bg-orange-50",
        icon: GitCompare
    },
    {
        title: "XML Tag Cleaner",
        problem: "Editing tags clutter the file.",
        solution: "Bulk accept/reject proprietary tags while maintaining document integrity.",
        color: "text-teal-600 bg-teal-50",
        icon: Eraser
    }
];

const Landing: React.FC = () => {
    const { user, profile, isAdmin } = useAuth();
    const navigate = useNavigate();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'|'info'} | null>(null);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

    const isSubscribed = profile?.is_subscribed;

    const scrollToIndex = (index: number) => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const cards = container.querySelectorAll('[data-tool-card]');
        let targetIndex = index;
        if (index < 0) targetIndex = cards.length - 1;
        if (index >= cards.length) targetIndex = 0;
        const card = cards[targetIndex] as HTMLElement;
        if (card) {
            const containerCenter = container.clientWidth / 2;
            const cardCenter = card.offsetLeft + card.offsetWidth / 2;
            container.scrollTo({ left: cardCenter - containerCenter, behavior: 'smooth' });
        }
    };

    useEffect(() => {
        if (isPaused) return;
        const interval = setInterval(() => { scrollToIndex(activeIndex + 1); }, 4000); 
        return () => clearInterval(interval);
    }, [activeIndex, isPaused]);

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const centerLine = container.scrollLeft + container.clientWidth / 2;
        const cards = container.querySelectorAll('[data-tool-card]');
        let closestIndex = activeIndex;
        let minDistance = Infinity;
        cards.forEach((node, idx) => {
            const card = node as HTMLElement;
            const cardCenter = card.offsetLeft + card.offsetWidth / 2;
            const dist = Math.abs(centerLine - cardCenter);
            if (dist < minDistance) { minDistance = dist; closestIndex = idx; }
        });
        if (closestIndex !== activeIndex) { setActiveIndex(closestIndex); }
    };

    return (
        <div className="bg-transparent relative flex flex-col font-sans overflow-x-hidden pt-12 lg:pt-24 pb-24">
            <main className="flex-grow flex flex-col items-center w-full z-10 gap-32">
                {/* Hero Section */}
                <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center px-6">
                    <motion.div 
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="text-left space-y-12"
                    >
                        <div className="space-y-6">
                             <h1 className="text-6xl lg:text-8xl font-black text-slate-900 tracking-tighter leading-[0.85] uppercase">
                                Precision <br/>
                                <span className="text-indigo-600">Editorial</span> <br/>
                                Engineering.
                            </h1>
                            <p className="text-xl text-slate-500 leading-relaxed max-w-lg font-medium">
                                High-performance automation utilities engineered for technical XML production teams. 
                                Secure, local-first, and incredibly fast.
                            </p>
                        </div>
                        
                        <div className="flex flex-wrap gap-4">
                             <div className="flex items-center gap-3 px-6 py-4 bg-white rounded-2xl shadow-sm border border-slate-100 font-bold text-slate-700 text-sm hover:shadow-md transition-shadow">
                                <Shield size={18} className="text-indigo-500" />
                                XML Integrity
                             </div>
                             <div className="flex items-center gap-3 px-6 py-4 bg-white rounded-2xl shadow-sm border border-slate-100 font-bold text-slate-700 text-sm hover:shadow-md transition-shadow">
                                <Globe size={18} className="text-emerald-500" />
                                Local-First
                             </div>
                             <div className="flex items-center gap-3 px-6 py-4 bg-white rounded-2xl shadow-sm border border-slate-100 font-bold text-slate-700 text-sm hover:shadow-md transition-shadow">
                                <Cpu size={18} className="text-amber-500" />
                                Citation Logic
                             </div>
                        </div>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="relative"
                    >
                        <div className="p-12 lg:p-20 rounded-[4rem] border transition-all duration-500 text-center relative overflow-hidden bg-white border-slate-100 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)]">
                            <div className="relative z-10">
                                <div className="mb-12 flex justify-center">
                                    <div className="w-32 h-32 rounded-[2.5rem] flex items-center justify-center mb-2 shadow-inner bg-slate-50 text-slate-900 border border-slate-100 animate-float">
                                        {isAdmin ? (
                                            <Shield size={64} className="text-indigo-600" strokeWidth={1.5} />
                                        ) : isSubscribed ? (
                                            <CheckCircle2 size={64} className="text-emerald-500" strokeWidth={1.5} />
                                        ) : (
                                            <Lock size={64} className="text-slate-300" strokeWidth={1.5} />
                                        )}
                                    </div>
                                </div>

                                <h2 className="text-4xl font-black text-slate-900 mb-2 uppercase tracking-tighter">
                                    {isAdmin ? 'Administrator' : isSubscribed ? 'Premium Access' : 'Standard Node'}
                                </h2>
                                <p className="text-xs font-bold text-slate-400 mb-12 uppercase tracking-[0.3em]">{user?.email}</p>
                                
                                <div className="space-y-4">
                                    <button 
                                        onClick={() => navigate('/dashboard')} 
                                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-6 px-10 rounded-3xl shadow-2xl shadow-indigo-500/20 transform transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-4 uppercase tracking-widest text-sm"
                                    >
                                        <span>Enter Workspace</span>
                                        <ArrowRight size={20} />
                                    </button>
                                    
                                    {!isSubscribed && !isAdmin && (
                                        <button 
                                            onClick={() => setIsRequestModalOpen(true)} 
                                            className="w-full py-4 text-[11px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-[0.25em] transition-all"
                                        >
                                            Upgrade to Enterprise
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="absolute top-0 right-0 w-48 h-48 bg-slate-50 rounded-bl-[6rem] -mr-24 -mt-24 opacity-50"></div>
                        </div>
                    </motion.div>
                </div>

                {/* Tool Carousel */}
                <div className="w-full max-w-[1600px]">
                    <div className="text-center mb-20 px-4">
                        <span className="text-slate-400 font-black tracking-[0.4em] text-[11px] uppercase block mb-6">The Standard in Editorial Engineering</span>
                        <h3 className="text-5xl font-black text-slate-900 tracking-tighter uppercase">Integrated Tool Suite</h3>
                    </div>

                    <div className="relative group" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
                        <button onClick={() => scrollToIndex(activeIndex - 1)} className="hidden lg:flex absolute left-12 top-1/2 -translate-y-1/2 z-20 w-16 h-16 bg-white border border-slate-200 rounded-2xl items-center justify-center shadow-2xl text-slate-500 hover:text-indigo-600 hover:scale-110 transition-all opacity-0 group-hover:opacity-100">
                            <ArrowRight size={24} className="rotate-180" />
                        </button>
                        <button onClick={() => scrollToIndex(activeIndex + 1)} className="hidden lg:flex absolute right-12 top-1/2 -translate-y-1/2 z-20 w-16 h-16 bg-white border border-slate-200 rounded-2xl items-center justify-center shadow-2xl text-slate-500 hover:text-indigo-600 hover:scale-110 transition-all opacity-0 group-hover:opacity-100">
                            <ArrowRight size={24} />
                        </button>

                        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex overflow-x-auto pb-24 pt-4 gap-6 md:gap-12 snap-x snap-mandatory no-scrollbar scroll-smooth px-[10vw] md:px-[calc(50%-300px)]">
                            {TOOLS_INFO.map((tool, idx) => {
                                const isActive = idx === activeIndex;
                                const Icon = tool.icon;
                                return (
                                    <div 
                                        key={idx} 
                                        data-tool-card 
                                        className={`shrink-0 snap-center flex flex-col gap-10 p-12 rounded-[4rem] border transition-all duration-700 ease-out min-w-[85vw] md:min-w-[600px] w-[85vw] md:w-[600px] relative overflow-hidden bg-white ${isActive ? `shadow-[0_60px_120px_-20px_rgba(0,0,0,0.12)] scale-100 opacity-100 z-10 border-slate-100` : 'shadow-none scale-90 opacity-20 blur-[2px] border-transparent' }`}
                                    >
                                        <div className="flex items-center justify-between relative z-10">
                                            <div className={`p-6 rounded-3xl ${tool.color} shadow-sm border border-slate-100/50`}>
                                                <Icon size={40} strokeWidth={1.5} />
                                            </div>
                                            <span className={`text-9xl font-black text-slate-50 absolute -right-6 -top-12 select-none`}>0{idx + 1}</span>
                                        </div>
                                        <div className="relative z-10 space-y-8">
                                            <h4 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">{tool.title}</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className={`p-6 rounded-3xl bg-slate-50 border border-slate-100 shadow-sm transition-all duration-700 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                                                    <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-2">Bottleneck</p>
                                                    <p className="text-lg text-slate-600 font-bold leading-tight">{tool.problem}</p>
                                                </div>
                                                <div className={`p-6 rounded-3xl bg-indigo-50 border border-indigo-100 shadow-sm transition-all duration-700 delay-100 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                                                    <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest mb-2">Outcome</p>
                                                    <p className="text-lg text-indigo-900 font-bold leading-tight">{tool.solution}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </main>

            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                 <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-indigo-50/50 rounded-full blur-[120px] opacity-50"></div>
                 <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-slate-100/50 rounded-full blur-[120px] opacity-50"></div>
            </div>

            {/* Request Modal */}
            <AnimatePresence>
                {isRequestModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-[3rem] shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden relative ring-4 ring-slate-900/5"
                        >
                            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-10 text-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -mr-12 -mt-12"></div>
                                <div className="relative z-10">
                                    <div className="w-24 h-24 bg-white/20 backdrop-blur-xl rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl border border-white/30">
                                        <MessageSquare size={40} className="text-white" />
                                    </div>
                                    <h3 className="text-3xl font-black text-white uppercase tracking-tight">Enterprise Access</h3>
                                    <div className="text-indigo-200 text-[10px] font-bold mt-3 uppercase tracking-[0.3em]">Provisioning Required</div>
                                </div>
                            </div>

                            <div className="p-8 md:p-10 space-y-6">
                                <p className="text-slate-600 leading-relaxed text-center font-medium text-sm">
                                    To activate an Individual License or Group Subscription, contact the <span className="text-indigo-600 font-bold">Administrator</span> directly.
                                </p>

                                {/* Pricing Cards */}
                                <div className="space-y-2">
                                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">Designated Monthly Rates</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">Solo</div>
                                            <div className="text-base font-black text-slate-900 mt-0.5">₱300</div>
                                            <div className="text-[8px] text-slate-500">per month</div>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                                            <div className="text-[9px] font-bold text-slate-400 uppercase">2 Users</div>
                                            <div className="text-base font-black text-slate-900 mt-0.5">₱250</div>
                                            <div className="text-[8px] text-slate-500">each / mo</div>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-center">
                                            <div className="text-[9px] font-bold text-indigo-700 uppercase">3+ Users</div>
                                            <div className="text-base font-black text-indigo-700 mt-0.5">₱175</div>
                                            <div className="text-[8px] text-indigo-600">each / mo</div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 text-center italic">
                                        Group rates apply to separate individual active subscribers.
                                    </p>
                                </div>
                                
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3">
                                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                                        Activation Protocol
                                    </div>
                                    <ul className="space-y-2.5 text-xs text-slate-600">
                                        <li className="flex items-center gap-3">
                                            <div className="w-4 h-4 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-indigo-600">1</div>
                                            <span>Message the Administrator on Facebook Messenger</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <div className="w-4 h-4 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-indigo-600">2</div>
                                            <span>Provide your registered account email</span>
                                        </li>
                                    </ul>
                                </div>

                                <div className="pt-1 flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsTermsModalOpen(true);
                                        }}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1.5 transition-colors"
                                    >
                                        <Scale size={13} />
                                        <span>View Terms and Conditions of Use</span>
                                    </button>
                                </div>

                                <button 
                                    onClick={() => setIsRequestModalOpen(false)}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-slate-200 uppercase tracking-widest text-xs"
                                >
                                    Acknowledge Protocol
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <TermsModal 
                isOpen={isTermsModalOpen}
                onClose={() => setIsTermsModalOpen(false)}
            />

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default Landing;
