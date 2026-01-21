import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import XmlRenumber from './pages/XmlRenumber';
import CreditGenerator from './pages/CreditGenerator';
import QuickDiff from './pages/QuickDiff';
import TagCleaner from './pages/TagCleaner';
import TableFixer from './pages/TableFixer';
import ArticleHighlights from './pages/ArticleHighlights';
import ViewSync from './pages/ViewSync';
import ReferenceUpdater from './pages/ReferenceUpdater';
import ReferenceDupeChecker from './pages/ReferenceDupeChecker';
import UncitedRefCleaner from './pages/UncitedRefCleaner';
import OtherRefScanner from './pages/OtherRefScanner';
import ReferenceExtractor from './pages/ReferenceExtractor';
import RefListPurger from './pages/RefListPurger';
import Docs from './pages/Docs';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AuthModal from './components/AuthModal';
import { ToolId } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoadingOverlay from './components/LoadingOverlay';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, loading } = useAuth();
    const [showRecovery, setShowRecovery] = useState(false);

    useEffect(() => {
        let timer: any;
        if (loading) {
            timer = setTimeout(() => setShowRecovery(true), 6000);
        }
        return () => clearTimeout(timer);
    }, [loading]);

    const handleReset = () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-6">
                <LoadingOverlay message="Establishing Node Connection..." color="indigo" />
                {showRecovery && (
                    <div className="animate-fade-in flex flex-col items-center gap-4 z-[100] mt-32">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Connection taking longer than expected</p>
                        <button 
                            onClick={handleReset}
                            className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all active:scale-95"
                        >
                            Reset System Cache
                        </button>
                    </div>
                )}
            </div>
        );
    }
    
    if (!session) return <Navigate to="/login" replace />;
    return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, profile, loading } = useAuth();
    const isAdmin = profile?.role?.toLowerCase() === 'admin';

    if (loading) return <LoadingOverlay message="Verifying Admin..." color="slate" />;
    if (!session || !isAdmin) return <Navigate to="/" replace />;
    return <>{children}</>;
};

const LockedToolGuard: React.FC<{ children: React.ReactElement, toolId: ToolId, displayName: string }> = ({ children, toolId, displayName }) => {
    const { profile, freeTools } = useAuth();
    const isAdmin = profile?.role?.toLowerCase() === 'admin';

    if (freeTools.includes(toolId)) return children;
    if (isAdmin) return children;
    if (profile?.is_subscribed) return children;
    const isUnlocked = profile?.unlocked_tools?.includes(toolId) || profile?.unlocked_tools?.includes('universal');
    if (isUnlocked) return children;
    return (
        <div className="relative h-full w-full overflow-hidden">
            <div className="blur-sm pointer-events-none grayscale opacity-40 select-none">{children}</div>
            <AuthModal toolId={toolId} toolDisplayName={displayName} onSuccess={() => {}} />
        </div>
    );
};

const SubscriptionGuard: React.FC<{ children: React.ReactElement, toolId: ToolId, displayName: string }> = ({ children, toolId, displayName }) => {
    const { profile, freeTools } = useAuth();
    const navigate = useNavigate();
    const isAdmin = profile?.role?.toLowerCase() === 'admin';

    if (freeTools.includes(toolId)) return children;
    if (isAdmin || profile?.is_subscribed) return children;

    return (
        <div className="relative h-full w-full overflow-hidden">
            <div className="blur-sm pointer-events-none grayscale opacity-40 select-none">{children}</div>
            <div className="absolute inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-sm w-full border border-slate-200 text-center animate-scale-in relative ring-4 ring-slate-900/5">
                    <div className="mb-10">
                        <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-amber-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Premium Module</h2>
                        <p className="text-slate-500 mt-2 text-xs font-bold uppercase tracking-widest leading-relaxed">
                            {displayName} requires an active subscription for access.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600 leading-relaxed font-medium">Please contact the administrator to upgrade your node profile.</p>
                        <button 
                            onClick={() => navigate('/dashboard')}
                            className="block w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-4 rounded-2xl shadow-xl transition active:scale-95 uppercase tracking-widest text-xs text-center"
                        >
                            Back to Workspace
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <HashRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<ProtectedRoute><Layout isLanding={true}><Landing /></Layout></ProtectedRoute>} />
                    <Route path="/admin" element={<AdminRoute><Layout><AdminDashboard /></Layout></AdminRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
                    <Route path="/docs" element={<ProtectedRoute><Layout><Docs /></Layout></ProtectedRoute>} />
                    
                    <Route path="/xmlRenumber" element={<ProtectedRoute><Layout currentTool={ToolId.XML_RENUMBER}><LockedToolGuard toolId={ToolId.XML_RENUMBER} displayName="XML Normalizer"><XmlRenumber /></LockedToolGuard></Layout></ProtectedRoute>} />
                    <Route path="/creditGenerator" element={<ProtectedRoute><Layout currentTool={ToolId.CREDIT_GENERATOR}><LockedToolGuard toolId={ToolId.CREDIT_GENERATOR} displayName="CRediT Tagging"><CreditGenerator /></LockedToolGuard></Layout></ProtectedRoute>} />
                    <Route path="/uncitedCleaner" element={<ProtectedRoute><Layout currentTool={ToolId.UNCITED_CLEANER}><SubscriptionGuard toolId={ToolId.UNCITED_CLEANER} displayName="Uncited Ref Cleaner"><UncitedRefCleaner /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/otherRefScanner" element={<ProtectedRoute><Layout currentTool={ToolId.OTHER_REF_SCANNER}><SubscriptionGuard toolId={ToolId.OTHER_REF_SCANNER} displayName="Other-Ref Scanner"><OtherRefScanner /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/quickDiff" element={<ProtectedRoute><Layout currentTool={ToolId.QUICK_DIFF}><SubscriptionGuard toolId={ToolId.QUICK_DIFF} displayName="Quick Text Diff"><QuickDiff /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/tagCleaner" element={<ProtectedRoute><Layout currentTool={ToolId.TAG_CLEANER}><SubscriptionGuard toolId={ToolId.TAG_CLEANER} displayName="XML Tag Cleaner"><TagCleaner /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/tableFixer" element={<ProtectedRoute><Layout currentTool={ToolId.TABLE_FIXER}><SubscriptionGuard toolId={ToolId.TABLE_FIXER} displayName="XML Table Fixer"><TableFixer /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/highlightsGen" element={<ProtectedRoute><Layout currentTool={ToolId.HIGHLIGHTS_GEN}><SubscriptionGuard toolId={ToolId.HIGHLIGHTS_GEN} displayName="Article Highlights Gen"><ArticleHighlights /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/viewSync" element={<ProtectedRoute><Layout currentTool={ToolId.VIEW_SYNC}><SubscriptionGuard toolId={ToolId.VIEW_SYNC} displayName="View Synchronizer"><ViewSync /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/referenceGen" element={<ProtectedRoute><Layout currentTool={ToolId.REFERENCE_GEN}><SubscriptionGuard toolId={ToolId.REFERENCE_GEN} displayName="Reference Updater"><ReferenceUpdater /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/refDupeCheck" element={<ProtectedRoute><Layout currentTool={ToolId.REF_DUPE_CHECK}><SubscriptionGuard toolId={ToolId.REF_DUPE_CHECK} displayName="Duplicate Ref Remover"><ReferenceDupeChecker /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/refExtractor" element={<ProtectedRoute><Layout currentTool={ToolId.REF_EXTRACTOR}><SubscriptionGuard toolId={ToolId.REF_EXTRACTOR} displayName="Bibliography Extractor"><ReferenceExtractor /></SubscriptionGuard></Layout></ProtectedRoute>} />
                    <Route path="/refPurger" element={<ProtectedRoute><Layout currentTool={ToolId.REF_PURGER}><SubscriptionGuard toolId={ToolId.REF_PURGER} displayName="Reference List Purger"><RefListPurger /></SubscriptionGuard></Layout></ProtectedRoute>} />
                </Routes>
            </HashRouter>
        </AuthProvider>
    );
};

export default App;