import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ToolId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import TrialTimer from './TrialTimer';
import ExpiryReminderModal from './ExpiryReminderModal';

interface LayoutProps {
    children: React.ReactNode;
    currentTool?: ToolId;
    isLanding?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, currentTool, isLanding }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { signOut, profile } = useAuth();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    // Simplified Trial Check: If trial_end exists, it's a trial plan
    const isTrial = !!profile?.trial_end;

    // Contextual header styling
    const headerClass = isLanding 
        ? "bg-transparent py-6" 
        : "glass-header sticky top-0 py-3 shadow-sm border-b border-slate-200/60";

    return (
        <div className="min-h-screen flex flex-col font-sans text-slate-900 bg-slate-50 selection:bg-indigo-100 overflow-x-hidden">
            {/* Session Reminders & Warnings */}
            <ExpiryReminderModal />

            {/* Desktop Offline Banner */}
            {!isOnline && (
                <div className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-[0.2em] py-1 text-center animate-pulse z-[60] sticky top-0">
                    System Offline - Local Processing Enabled
                </div>
            )}

            <header className={`${headerClass} transition-all duration-500 z-40 px-4 sm:px-6 lg:px-8`}>
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-6">
                         {/* Navigation to Landing Page */}
                         <div 
                            onClick={() => navigate('/')} 
                            className="flex items-center gap-3 cursor-pointer group"
                            title="Return to Product Home"
                         >
                            <div className="bg-slate-900 text-white p-2 rounded-xl shadow-lg group-hover:scale-105 group-active:scale-95 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-sm font-black text-slate-900 tracking-tight uppercase leading-none">Production Toolkit Pro</h1>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Desktop Node</span>
                            </div>
                        </div>

                        {currentTool && (
                            <div className="hidden md:flex items-center gap-2 animate-fade-in">
                                <div className="h-4 w-px bg-slate-200 mx-2"></div>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded uppercase tracking-wider border border-indigo-100 shadow-sm">
                                    {currentTool === ToolId.XML_RENUMBER && 'XML Normalizer'}
                                    {currentTool === ToolId.CREDIT_GENERATOR && 'CRediT Tagging'}
                                    {currentTool === ToolId.QUICK_DIFF && 'Quick Diff'}
                                    {currentTool === ToolId.TAG_CLEANER && 'Tag Cleaner'}
                                    {currentTool === ToolId.TABLE_FIXER && 'Table Fixer'}
                                    {currentTool === ToolId.HIGHLIGHTS_GEN && 'Highlights Gen'}
                                    {currentTool === ToolId.VIEW_SYNC && 'View Sync'}
                                    {currentTool === ToolId.REFERENCE_GEN && 'Ref Updater'}
                                    {currentTool === ToolId.REF_DUPE_CHECK && 'Ref Dupe Checker'}
                                    {currentTool === ToolId.UNCITED_CLEANER && 'Uncited Cleaner'}
                                    {currentTool === ToolId.OTHER_REF_SCANNER && 'Other-Ref Scanner'}
                                    {currentTool === ToolId.REF_EXTRACTOR && 'Bib Extractor'}
                                    {currentTool === ToolId.REF_PURGER && 'Ref Purger'}
                                </span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {profile?.is_subscribed && profile.subscription_end && !isLanding && (
                            <TrialTimer 
                                endDate={profile.subscription_end} 
                                isTrial={isTrial} 
                                label={isTrial ? "Trial" : "Plan"} 
                            />
                        )}

                        <div className="flex items-center gap-2">
                            {/* Return to Tool Dashboard */}
                            {!isLanding && (
                                <button 
                                    onClick={() => navigate('/dashboard')} 
                                    className={`p-2 rounded-xl transition-all ${location.pathname === '/dashboard' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'text-slate-400 hover:text-indigo-600'}`} 
                                    title="Workspace Dashboard"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                </button>
                            )}

                            {profile?.role === 'admin' && (
                                <button onClick={() => navigate('/admin')} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="Admin Console">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </button>
                            )}
                            
                            <button onClick={() => navigate('/docs')} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="Help/Docs">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                            </button>
                            
                            <div className="h-4 w-px bg-slate-200 mx-1"></div>
                            
                            <button 
                                onClick={handleSignOut}
                                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-600 px-3 py-1 transition-all"
                            >
                                Exit
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main key={location.pathname} className="flex-grow w-full relative z-10 animate-fade-in">
                {children}
            </main>

            <footer className="bg-white border-t border-slate-200/60 py-4 mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                    <p>&copy; 2025 Editorial Systems Pro</p>
                    <div className="flex gap-6">
                        <span>Environment: Desktop Node</span>
                        <span>v1.5.0</span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Layout;