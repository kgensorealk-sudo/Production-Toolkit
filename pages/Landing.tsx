import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const TOOLS_INFO = [
    {
        title: "XML Ref Normalizer",
        problem: "Manual renumbering breaks links.",
        solution: "Automates citation sequencing and updates cross-references instantly.",
        color: "text-blue-600 bg-blue-50",
        border: "border-blue-200",
        shadow: "shadow-blue-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    },
    {
        title: "Reference Updater",
        problem: "Dirty corrections ruin integrity.",
        solution: "Surgically merges updates while preserving existing body linking IDs.",
        color: "text-sky-600 bg-sky-50",
        border: "border-sky-200",
        shadow: "shadow-sky-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    },
    {
        title: "CRediT Tagging",
        problem: "Author roles are messy & unstructured.",
        solution: "Smart-detects roles, fixes typos, and generates standard XML tags.",
        color: "text-purple-600 bg-purple-50",
        border: "border-purple-200",
        shadow: "shadow-purple-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    },
    {
        title: "Highlights Gen",
        problem: "Rich text doesn't paste into XML.",
        solution: "Converts bullets, bold, and italics into 'author-highlights' XML structures.",
        color: "text-yellow-600 bg-yellow-50",
        border: "border-yellow-200",
        shadow: "shadow-yellow-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    },
    {
        title: "Quick Text Diff",
        problem: "Spotting XML edits is difficult.",
        solution: "Side-by-side comparison with precision character-level highlighting.",
        color: "text-orange-600 bg-orange-50",
        border: "border-orange-200",
        shadow: "shadow-orange-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    },
    {
        title: "XML Tag Cleaner",
        problem: "Editing tags clutter the file.",
        solution: "Bulk accept/reject proprietary tags while maintaining document integrity.",
        color: "text-teal-600 bg-teal-50",
        border: "border-teal-200",
        shadow: "shadow-teal-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    }
];

const Landing: React.FC = () => {
    const { user, profile, signOut } = useAuth();
    const navigate = useNavigate();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

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
        <div className="min-h-screen bg-slate-50 relative flex flex-col font-sans overflow-x-hidden">
            <header className="px-8 py-6 flex justify-between items-center z-20">
                <div className="flex items-center gap-2">
                     <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-xl shadow-slate-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                    </div>
                    <span className="font-black text-slate-900 tracking-tight text-xl uppercase">Production Toolkit</span>
                </div>
                <button onClick={signOut} className="text-xs font-black text-slate-400 hover:text-rose-600 transition-colors bg-white/80 px-4 py-2 rounded-xl shadow-sm border border-slate-100 uppercase tracking-widest">Sign Out</button>
            </header>

            <main className="flex-grow flex flex-col items-center w-full z-10 py-12 lg:py-24 gap-20">
                <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center px-6">
                    <div className="text-left space-y-10 animate-slide-up">
                        <div>
                             <h1 className="text-5xl lg:text-7xl font-black text-slate-900 tracking-tighter mb-8 leading-[0.9] uppercase">
                                Precision Editorial <br/>
                                <span className="text-indigo-600">Automation.</span>
                            </h1>
                            <p className="text-xl text-slate-500 leading-relaxed max-w-lg font-medium">
                                Enterprise-grade utilities engineered for high-volume XML production teams. 
                                Secure, offline-safe, and incredibly fast.
                            </p>
                        </div>
                        
                        <div className="flex flex-wrap gap-4">
                             <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-2xl shadow-sm border border-slate-100 font-bold text-slate-700 text-sm">
                                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                XML Integrity
                             </div>
                             <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-2xl shadow-sm border border-slate-100 font-bold text-slate-700 text-sm">
                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                Local-First
                             </div>
                             <div className="flex items-center gap-3 px-5 py-3 bg-white rounded-2xl shadow-sm border border-slate-100 font-bold text-slate-700 text-sm">
                                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                Citation Logic
                             </div>
                        </div>
                    </div>

                    <div className={`p-10 lg:p-16 rounded-[3rem] border transition-all duration-500 text-center relative overflow-hidden animate-scale-in bg-white border-slate-100 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)]`}>
                        <div className="relative z-10">
                            <div className="mb-10 flex justify-center">
                                <div className={`w-32 h-32 rounded-[2rem] flex items-center justify-center mb-2 shadow-inner bg-slate-50 text-slate-900 border border-slate-100`}>
                                    {isSubscribed ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    )}
                                </div>
                            </div>

                            <h2 className="text-4xl font-black text-slate-900 mb-2 uppercase tracking-tighter">
                                {isSubscribed ? `Ready for Production` : 'Access Restricted'}
                            </h2>
                            <p className="text-sm font-bold text-slate-400 mb-10 uppercase tracking-widest">{user?.email}</p>
                            
                            {isSubscribed ? (
                                <button onClick={() => navigate('/dashboard')} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-5 px-10 rounded-2xl shadow-2xl shadow-slate-200 transform transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-4 uppercase tracking-widest text-sm">
                                    <span>Enter Workspace</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                </button>
                            ) : (
                                <div className="space-y-4">
                                    <button onClick={() => window.location.href = `mailto:admin@productiontoolkit.com?subject=Access Request&body=User: ${user?.email}`} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 px-10 rounded-2xl shadow-2xl shadow-indigo-100 transform transition-all hover:-translate-y-1 active:scale-95 uppercase tracking-widest text-sm">Request Access</button>
                                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Provisioning required by administrator</p>
                                </div>
                            )}
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[4rem] -mr-16 -mt-16 opacity-50"></div>
                    </div>
                </div>

                <div className="w-full max-w-[1400px] animate-slide-up" style={{animationDelay: '0.2s'}}>
                    <div className="text-center mb-16 px-4">
                        <span className="text-slate-400 font-black tracking-[0.3em] text-[10px] uppercase block mb-4">The Standard in Editorial Engineering</span>
                        <h3 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Integrated Tool Suite</h3>
                    </div>

                    <div className="relative group" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
                        <button onClick={() => scrollToIndex(activeIndex - 1)} className="hidden md:flex absolute left-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 bg-white border border-slate-200 rounded-2xl items-center justify-center shadow-xl text-slate-500 hover:text-indigo-600 hover:scale-110 transition-all opacity-0 group-hover:opacity-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
                        <button onClick={() => scrollToIndex(activeIndex + 1)} className="hidden md:flex absolute right-8 top-1/2 -translate-y-1/2 z-20 w-14 h-14 bg-white border border-slate-200 rounded-2xl items-center justify-center shadow-xl text-slate-500 hover:text-indigo-600 hover:scale-110 transition-all opacity-0 group-hover:opacity-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>

                        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex overflow-x-auto pb-20 pt-4 gap-4 md:gap-10 snap-x snap-mandatory custom-scrollbar no-scrollbar scroll-smooth px-[7.5vw] md:px-[calc(50%-250px)]" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {TOOLS_INFO.map((tool, idx) => {
                                const isActive = idx === activeIndex;
                                return (
                                    <div key={idx} data-tool-card className={`shrink-0 snap-center flex flex-col gap-8 p-10 rounded-[3rem] border transition-all duration-700 ease-out min-w-[85vw] md:min-w-[500px] w-[85vw] md:w-[500px] relative overflow-hidden bg-white ${isActive ? `shadow-[0_40px_80px_-15px_rgba(0,0,0,0.1)] scale-100 opacity-100 z-10 border-slate-100` : 'shadow-none scale-90 opacity-30 blur-[2px] border-transparent' }`}>
                                        <div className="flex items-center justify-between relative z-10">
                                            <div className={`p-5 rounded-2xl ${tool.color} shadow-sm border border-slate-100/50`}><svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">{tool.icon}</svg></div>
                                            <span className={`text-8xl font-black text-slate-50 absolute -right-4 -top-8 select-none`}>0{idx + 1}</span>
                                        </div>
                                        <div className="relative z-10">
                                            <h4 className="text-3xl font-black text-slate-900 mb-6 uppercase tracking-tighter">{tool.title}</h4>
                                            <div className="space-y-4">
                                                <div className={`p-5 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm transition-all duration-700 ${isActive ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}><p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Bottleneck</p><p className="text-base text-slate-600 font-bold leading-snug">{tool.problem}</p></div>
                                                <div className={`p-5 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm transition-all duration-700 delay-100 ${isActive ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}><p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Outcome</p><p className="text-base text-indigo-900 font-bold leading-snug">{tool.solution}</p></div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </main>

            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                 <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-indigo-50/50 rounded-full blur-3xl opacity-50"></div>
                 <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-slate-100/50 rounded-full blur-3xl opacity-50"></div>
            </div>
        </div>
    );
};

export default Landing;