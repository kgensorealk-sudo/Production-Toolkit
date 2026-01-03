
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
        title: "Reference Generator",
        problem: "Structuring citations takes hours.",
        solution: "AI parsing structuring unstructured text into NISO XML in seconds.",
        color: "text-sky-600 bg-sky-50",
        border: "border-sky-200",
        shadow: "shadow-sky-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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
    },
    {
        title: "XML Table Fixer",
        problem: "Footnotes get stuck in cells.",
        solution: "Detaches footnotes to legends or attaches legends to cells automatically.",
        color: "text-pink-600 bg-pink-50",
        border: "border-pink-200",
        shadow: "shadow-pink-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    },
    {
        title: "View Synchronizer",
        problem: "Dual views get out of sync.",
        solution: "Mirrors content between Compact and Extended views with ID safety.",
        color: "text-indigo-600 bg-indigo-50",
        border: "border-indigo-200",
        shadow: "shadow-indigo-500/10",
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    }
];

const Landing: React.FC = () => {
    const { user, profile, signOut } = useAuth();
    const navigate = useNavigate();

    // Carousel State
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const isSubscribed = profile?.is_subscribed;

    // Format date for display
    const formattedDate = profile?.subscription_end 
        ? new Date(profile.subscription_end).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        : null;

    const handleRequestAccess = () => {
        window.location.href = `mailto:admin@productiontoolkit.com?subject=Access Request for Production Toolkit&body=Hello Admin,%0D%0A%0D%0AI would like to request access to the Production Toolkit.%0D%0A%0D%0AUser Email: ${user?.email}`;
    };

    // Scroll to specific index logic
    const scrollToIndex = (index: number) => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const cards = container.querySelectorAll('[data-tool-card]');
        
        // Handle cycling
        let targetIndex = index;
        if (index < 0) targetIndex = cards.length - 1;
        if (index >= cards.length) targetIndex = 0;

        const card = cards[targetIndex] as HTMLElement;

        if (card) {
            // Calculate center position
            const containerCenter = container.clientWidth / 2;
            const cardCenter = card.offsetLeft + card.offsetWidth / 2;
            
            container.scrollTo({
                left: cardCenter - containerCenter,
                behavior: 'smooth'
            });
        }
    };

    // Auto-advance
    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            scrollToIndex(activeIndex + 1);
        }, 4000); 

        return () => clearInterval(interval);
    }, [activeIndex, isPaused]);

    // Handle Manual Scroll
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
            if (dist < minDistance) {
                minDistance = dist;
                closestIndex = idx;
            }
        });

        if (closestIndex !== activeIndex) {
            setActiveIndex(closestIndex);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 relative flex flex-col font-sans overflow-x-hidden">
            {/* Simple Header */}
            <header className="px-8 py-6 flex justify-between items-center z-10">
                <div className="flex items-center gap-2">
                     <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-indigo-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                    </div>
                    <span className="font-bold text-slate-800 tracking-tight text-lg">Production Toolkit</span>
                </div>
                <button 
                    onClick={handleSignOut}
                    className="text-sm font-semibold text-slate-500 hover:text-rose-600 transition-colors bg-white/50 px-3 py-1.5 rounded-lg hover:bg-rose-50"
                >
                    Sign Out
                </button>
            </header>

            {/* Main Content */}
            <main className="flex-grow flex flex-col items-center w-full z-10 py-8 lg:py-12 gap-16 lg:gap-24">
                
                {/* Hero Section */}
                <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20 items-center px-6">
                    
                    {/* Left Column: Context/Marketing */}
                    <div className="text-left space-y-8 order-2 md:order-1 animate-slide-up">
                        <div>
                             <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight">
                                Editorial Workflow <br/>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Reimagined.</span>
                            </h1>
                            <p className="text-lg text-slate-600 leading-relaxed max-w-md font-light">
                                A suite of secure, offline-first utilities engineered for high-volume production teams. Automate citations, tagging, and validation in seconds.
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                                <span className="font-semibold text-slate-700">Instant Processing</span>
                             </div>
                             <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg></div>
                                <span className="font-semibold text-slate-700">AI-Powered</span>
                             </div>
                             <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                                <span className="font-semibold text-slate-700">100% Offline Safe</span>
                             </div>
                        </div>
                    </div>

                    {/* Right Column: Status Card */}
                    <div className={`p-8 md:p-12 rounded-[2.5rem] border transition-all duration-500 order-1 md:order-2 text-center relative overflow-hidden animate-scale-in
                        ${isSubscribed ? 'bg-white border-slate-100 shadow-2xl shadow-indigo-100/60' : 'bg-white border-slate-200 shadow-xl shadow-slate-200/50'}`}>
                        
                        {/* Status Indicator */}
                        <div className={`absolute top-6 right-6 flex items-center gap-2`}>
                            {isSubscribed && <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Active</span>}
                            <div className={`w-3 h-3 rounded-full ${isSubscribed ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                        </div>

                        <div className="relative z-10">
                            <div className="mb-8 flex justify-center">
                                <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-2 shadow-inner ${isSubscribed ? 'bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-500' : 'bg-slate-50 text-indigo-400'}`}>
                                    {isSubscribed ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            <h2 className="text-3xl font-bold text-slate-900 mb-2">
                                {isSubscribed ? `Welcome Back` : 'Unlock Access'}
                            </h2>
                            <p className="text-sm font-medium text-slate-400 mb-8 uppercase tracking-widest">{user?.email}</p>
                            
                            {isSubscribed ? (
                                <button 
                                    onClick={() => navigate('/dashboard')}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-8 rounded-2xl shadow-lg shadow-indigo-500/30 transform transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3"
                                >
                                    <span>Launch Dashboard</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </button>
                            ) : (
                                <div className="space-y-4">
                                    <button 
                                        onClick={handleRequestAccess}
                                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-8 rounded-2xl shadow-lg shadow-slate-500/20 transform transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        <span>Request Access</span>
                                    </button>
                                    <p className="text-xs text-slate-400">
                                        Contact admin for provisioning
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Toolkit Slider Section */}
                <div className="w-full max-w-[1400px] px-0 animate-slide-up" style={{animationDelay: '0.2s'}}>
                    <div className="text-center mb-10 px-4">
                        <span className="text-indigo-600 font-bold tracking-widest text-xs uppercase bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">Toolkit Capabilities</span>
                        <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-3">Specialized Workflow Utilities</h3>
                    </div>

                    <div 
                        className="relative group"
                        onMouseEnter={() => setIsPaused(true)}
                        onMouseLeave={() => setIsPaused(false)}
                    >
                        {/* Desktop Navigation Arrows */}
                        <button 
                            onClick={() => scrollToIndex(activeIndex - 1)}
                            className="hidden md:flex absolute left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full items-center justify-center shadow-lg text-slate-500 hover:text-indigo-600 hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button 
                            onClick={() => scrollToIndex(activeIndex + 1)}
                            className="hidden md:flex absolute right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full items-center justify-center shadow-lg text-slate-500 hover:text-indigo-600 hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                        </button>

                        {/* Scroll Container */}
                        <div 
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="flex overflow-x-auto pb-12 pt-4 gap-4 md:gap-8 snap-x snap-mandatory custom-scrollbar no-scrollbar scroll-smooth px-[7.5vw] md:px-[calc(50%-225px)]"
                            style={{ 
                                scrollbarWidth: 'none', 
                                msOverflowStyle: 'none'
                            }}
                        >
                            {TOOLS_INFO.map((tool, idx) => {
                                const isActive = idx === activeIndex;
                                return (
                                    <div 
                                        key={idx}
                                        data-tool-card
                                        className={`
                                            shrink-0 snap-center flex flex-col gap-6 p-8 rounded-[2rem] border transition-all duration-500 ease-out
                                            min-w-[85vw] md:min-w-[450px] w-[85vw] md:w-[450px] relative overflow-hidden bg-white
                                            ${isActive 
                                                ? `shadow-2xl scale-100 opacity-100 z-10 ${tool.shadow} border-slate-100`
                                                : 'shadow-none scale-90 opacity-40 blur-[1px] grayscale-[0.5] border-transparent'
                                            }
                                        `}
                                    >
                                        <div className="flex items-center justify-between relative z-10">
                                            <div className={`p-4 rounded-2xl ${tool.color} shadow-sm`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    {tool.icon}
                                                </svg>
                                            </div>
                                            <span className={`text-6xl font-black text-slate-100 absolute -right-2 -top-2`}>0{idx + 1}</span>
                                        </div>
                                        
                                        <div className="relative z-10">
                                            <h4 className="text-2xl font-bold text-slate-800 mb-4">{tool.title}</h4>
                                            <div className="space-y-3">
                                                <div className={`p-4 rounded-xl border-l-4 bg-rose-50 border-rose-400 shadow-sm transition-all duration-500 ${isActive ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}>
                                                    <p className="text-xs font-bold text-rose-800 uppercase tracking-wide mb-1 flex items-center gap-2">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                        Problem
                                                    </p>
                                                    <p className="text-base text-slate-700 leading-snug">{tool.problem}</p>
                                                </div>
                                                <div className={`p-4 rounded-xl border-l-4 bg-emerald-50 border-emerald-400 shadow-sm transition-all duration-500 delay-100 ${isActive ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}>
                                                    <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1 flex items-center gap-2">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        Solution
                                                    </p>
                                                    <p className="text-base text-slate-700 leading-snug">{tool.solution}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Navigation Dots */}
                        <div className="absolute bottom-0 left-0 w-full flex justify-center gap-2">
                            {TOOLS_INFO.map((_, idx) => (
                                <button 
                                    key={idx}
                                    onClick={() => scrollToIndex(idx)}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${
                                        idx === activeIndex ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-300 hover:bg-slate-400'
                                    }`}
                                    aria-label={`Go to slide ${idx + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

            </main>

            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                 <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-100/40 rounded-full blur-3xl opacity-50"></div>
                 <div className="absolute top-[20%] right-[-5%] w-[30%] h-[30%] bg-purple-100/40 rounded-full blur-3xl opacity-50"></div>
                 <div className="absolute bottom-[-10%] left-[20%] w-[35%] h-[35%] bg-indigo-100/30 rounded-full blur-3xl opacity-50"></div>
            </div>
        </div>
    );
};

export default Landing;
