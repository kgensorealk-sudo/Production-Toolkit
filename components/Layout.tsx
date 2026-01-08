
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ToolId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import TrialTimer from './TrialTimer';

interface LayoutProps {
    children: React.ReactNode;
    currentTool?: ToolId;
}

const Layout: React.FC<LayoutProps> = ({ children, currentTool }) => {
    const navigate = useNavigate();
    const { signOut, user, profile } = useAuth();

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    // Determine if the current subscription is a trial
    // Logic: If trial_end exists and matches the subscription_end exactly, it's a trial.
    // If they differ (or trial_end is null), it means a full subscription was granted which updated subscription_end only.
    const isTrial = profile?.trial_end && profile?.subscription_end && 
                    new Date(profile.trial_end).getTime() === new Date(profile.subscription_end).getTime();

    return (
        <div className="min-h-screen flex flex-col font-sans text-slate-900">
            <header className="glass-header sticky top-0 z-30 transition-all duration-300">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                         <div 
                            onClick={() => navigate('/dashboard')} 
                            className="flex items-center gap-3 cursor-pointer group"
                         >
                            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all duration-300 group-hover:scale-105">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-none group-hover:text-indigo-600 transition-colors">Production Toolkit</h1>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1">Workflow Suite</span>
                            </div>
                        </div>

                        {currentTool && (
                            <div className="hidden md:flex items-center gap-2 text-slate-300">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
                                    {currentTool === ToolId.XML_RENUMBER && 'XML Normalizer'}
                                    {currentTool === ToolId.CREDIT_GENERATOR && 'CRediT Tagging'}
                                    {currentTool === ToolId.QUICK_DIFF && 'Quick Diff'}
                                    {currentTool === ToolId.TAG_CLEANER && 'Tag Cleaner'}
                                    {currentTool === ToolId.TABLE_FIXER && 'Table Fixer'}
                                    {currentTool === ToolId.HIGHLIGHTS_GEN && 'Highlights Gen'}
                                    {currentTool === ToolId.VIEW_SYNC && 'View Sync'}
                                    {currentTool === ToolId.REFERENCE_GEN && 'Ref Updater'}
                                    {currentTool === ToolId.REF_DUPE_CHECK && 'Ref Dupe Checker'}
                                </span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {profile?.is_subscribed && profile.subscription_end && (
                            <TrialTimer 
                                endDate={profile.subscription_end} 
                                isTrial={!!isTrial} 
                                label={isTrial ? "Trial" : "Plan"} 
                            />
                        )}

                        {profile?.role === 'admin' && (
                            <button onClick={() => navigate('/admin')} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors hidden sm:block">
                                Admin Console
                            </button>
                        )}
                        <button onClick={() => navigate('/docs')} className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors hidden sm:block">Documentation</button>
                        <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                        
                        <div className="flex items-center gap-3">
                            {user && (
                                <span className="text-xs text-slate-500 font-medium hidden sm:block">{user.email}</span>
                            )}
                            <button 
                                onClick={handleSignOut}
                                className="text-xs font-bold text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 bg-white hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-all"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-grow w-full relative z-10 animate-fade-in">
                {children}
            </main>

            <footer className="bg-white border-t border-slate-200 py-8 mt-auto relative z-20">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-sm text-slate-500">
                        &copy; 2025 Production Toolkit. Crafted for editorial excellence.
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default Layout;
