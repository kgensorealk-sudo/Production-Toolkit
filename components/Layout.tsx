import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ToolId } from '../types';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
    children: React.ReactNode;
    currentTool?: ToolId;
}

const Layout: React.FC<LayoutProps> = ({ children, currentTool }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, profile, isAdmin, isSubscribed, isTrialing, daysLeft, signOut } = useAuth();
    const [isConnected, setIsConnected] = useState<boolean>(false);

    useEffect(() => {
        const checkConnection = async () => {
            try {
                // Attempt a lightweight request to check connectivity
                const { error } = await supabase.from('access_keys').select('count', { count: 'exact', head: true });
                
                // If the error explicitly indicates a fetch failure, we are offline/disconnected.
                if (error && (error.message.toLowerCase().includes('fetch') || error.message.toLowerCase().includes('network'))) {
                    setIsConnected(false);
                } else {
                    setIsConnected(true);
                }
            } catch (e) {
                setIsConnected(false);
            }
        };
        checkConnection();
    }, []);

    const handleSignOut = async () => {
        await signOut();
        navigate('/auth');
    };

    const isAuthPage = location.pathname === '/auth';
    const isLandingPage = location.pathname === '/landing';

    // If user is on landing page (not subscribed), we might want to disable clicking the logo to go to dashboard
    const canAccessDashboard = isSubscribed || isAdmin;

    // Helper to render subscription badge
    const renderSubBadge = () => {
        if (isAdmin) {
             return <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded uppercase tracking-wider">Admin</span>;
        }
        if (isTrialing) {
             return (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1 rounded uppercase tracking-wider" title="Free Trial Active">
                    Trial {daysLeft !== null ? `(${daysLeft}d)` : ''}
                </span>
             );
        }
        if (isSubscribed) {
             return (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded uppercase tracking-wider">
                    Pro Plan {daysLeft !== null ? `(${daysLeft}d)` : ''}
                </span>
             );
        }
        return <span className="text-[10px] font-medium text-slate-400">Unsubscribe User</span>;
    };

    return (
        <div className="min-h-screen flex flex-col font-sans text-slate-900">
            <header className="glass-header sticky top-0 z-30 transition-all duration-300">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                         <div 
                            onClick={() => (canAccessDashboard && !isAuthPage) ? navigate('/') : null} 
                            className={`flex items-center gap-3 group ${canAccessDashboard && !isAuthPage ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
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
                                    {currentTool === ToolId.REFERENCE_GEN && 'Ref Generator'}
                                </span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors ${isConnected ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`} title={isConnected ? "Connected to Supabase" : "Supabase Disconnected"}>
                            <span className={`relative flex h-2 w-2`}>
                              {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                              <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider hidden sm:block ${isConnected ? 'text-emerald-700' : 'text-slate-400'}`}>
                                {isConnected ? 'Online' : 'Offline'}
                            </span>
                        </div>

                        {!isAuthPage && !isLandingPage && <button onClick={() => navigate('/docs')} className="hidden sm:block text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">Docs</button>}
                        
                        {isAdmin && (
                            <button 
                                onClick={() => navigate('/admin')} 
                                className={`text-sm font-bold transition-colors ${location.pathname === '/admin' ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}
                            >
                                Admin
                            </button>
                        )}

                        <div className="h-4 w-px bg-slate-200"></div>

                        {user ? (
                             <div className="flex items-center gap-3">
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-xs font-bold text-slate-700">{user.email?.split('@')[0]}</span>
                                    {renderSubBadge()}
                                </div>
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs border border-indigo-200">
                                    {user.email?.charAt(0).toUpperCase()}
                                </div>
                                <button 
                                    onClick={handleSignOut}
                                    className="text-xs text-slate-500 hover:text-red-600 transition-colors"
                                    title="Sign Out"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </button>
                             </div>
                        ) : (
                            !isAuthPage && (
                                <button 
                                    onClick={() => navigate('/auth')} 
                                    className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-slate-500/20"
                                >
                                    Sign In
                                </button>
                            )
                        )}
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