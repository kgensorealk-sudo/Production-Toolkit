import React, { useState, useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { Routes, Route, Navigate, useNavigate } from 'react-router';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import XmlRenumber from './pages/XmlRenumber';
import CreditGenerator from './pages/CreditGenerator';
import QuickDiff from './pages/QuickDiff';
import TagCleaner from './pages/TagCleaner';
import TableFixer from './pages/TableFixer';
import TableBeautifier from './pages/TableBeautifier';
import ArticleHighlights from './pages/ArticleHighlights';
import ViewSync from './pages/ViewSync';
import ReferenceUpdater from './pages/ReferenceUpdater';
import ReferenceDupeChecker from './pages/ReferenceDupeChecker';
import UncitedRefCleaner from './pages/UncitedRefCleaner';
import OtherRefScanner from './pages/OtherRefScanner';
import ReferenceExtractor from './pages/ReferenceExtractor';
import RefListPurger from './pages/RefListPurger';
import GrantTagger from './pages/GrantTagger';
import IdAuditor from './pages/IdAuditor';
import CommentReplacer from './pages/CommentReplacer';
import Docs from './pages/Docs';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AuthModal from './components/AuthModal';
import { ToolId, ToolAccessMode } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoadingOverlay from './components/LoadingOverlay';
import ErrorBoundary from './components/ErrorBoundary';

/**
 * NODE ACCESS CONTROLLER
 * Dynamically enforces authorization based on Admin configuration.
 */
const NodeAccessController: React.FC<{ 
    children: React.ReactElement, 
    toolId: ToolId, 
    displayName: string
}> = ({ children, toolId, displayName }) => {
    const { profile, freeTools, isAdmin, toolAccessConfigs } = useAuth();
    const navigate = useNavigate();

    // 1. Get the dynamic access mode for this tool (Default to subscription)
    const mode = toolAccessConfigs[toolId] || ToolAccessMode.SUBSCRIPTION;

    // 2. Check for valid authorization state
    const isFree = freeTools.includes(toolId);
    
    // Check mode-specific logic
    let hasAccess = false;
    if (isAdmin || isFree) {
        hasAccess = true;
    } else if (mode === ToolAccessMode.SUBSCRIPTION) {
        hasAccess = !!profile?.is_subscribed;
    } else if (mode === ToolAccessMode.KEY_OR_SUBSCRIPTION) {
        hasAccess = !!profile?.is_subscribed || 
                    profile?.unlocked_tools?.includes(toolId) || 
                    profile?.unlocked_tools?.includes('universal');
    } else if (mode === ToolAccessMode.KEY_ONLY) {
        // Even if subscribed, a key is required
        hasAccess = profile?.unlocked_tools?.includes(toolId) || 
                    profile?.unlocked_tools?.includes('universal');
    }

    if (hasAccess) return children;

    // 3. Handle specific lock screens
    // If the mode requires a key (either as an option or exclusively), show the Key Entry UI
    if (mode === ToolAccessMode.KEY_OR_SUBSCRIPTION || mode === ToolAccessMode.KEY_ONLY) {
        return (
            <div className="relative h-full w-full overflow-hidden flex items-center justify-center bg-slate-50">
                <div className="absolute inset-0 bg-slate-100 opacity-50 pointer-events-none" />
                <AuthModal toolId={toolId} toolDisplayName={displayName} onSuccess={() => {}} />
            </div>
        );
    }

    // Default restricted screen for Subscription-Only tools
    return (
        <div className="relative h-full w-full overflow-hidden bg-slate-100 flex items-center justify-center">
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-md w-full border border-slate-200 text-center animate-scale-in relative ring-8 ring-slate-900/5">
                <div className="mb-8">
                    <div className="w-24 h-24 bg-amber-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm border border-amber-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Access Restricted</h2>
                    <p className="text-slate-500 mt-4 text-sm font-medium leading-relaxed">
                        The <b>{displayName}</b> module requires a validated Enterprise Subscription.
                    </p>
                </div>
                <button 
                    onClick={() => navigate('/dashboard')} 
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 uppercase tracking-widest text-xs"
                >
                    Return to Workspace
                </button>
            </div>
        </div>
    );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, loading } = useAuth();
    if (loading) return <LoadingOverlay message="Validating Session..." color="indigo" />;
    if (!session) return <Navigate to="/login" replace />;
    return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, isAdmin, loading } = useAuth();
    if (loading) return <LoadingOverlay message="Checking Authority..." color="slate" />;
    if (!session || !isAdmin) return <Navigate to="/" replace />;
    return <>{children}</>;
};

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <HashRouter>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/" element={<ProtectedRoute><Layout isLanding={true}><Landing /></Layout></ProtectedRoute>} />
                        <Route path="/admin" element={<AdminRoute><Layout><AdminDashboard /></Layout></AdminRoute>} />
                        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
                        <Route path="/docs" element={<ProtectedRoute><Layout><Docs /></Layout></ProtectedRoute>} />
                        
                        <Route path="/tableBeautifier" element={<ProtectedRoute><Layout currentTool={ToolId.TABLE_BEAUTIFIER}><NodeAccessController toolId={ToolId.TABLE_BEAUTIFIER} displayName="Table XML Beautifier"><TableBeautifier /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/xmlRenumber" element={<ProtectedRoute><Layout currentTool={ToolId.XML_RENUMBER}><NodeAccessController toolId={ToolId.XML_RENUMBER} displayName="XML Normalizer"><XmlRenumber /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/creditGenerator" element={<ProtectedRoute><Layout currentTool={ToolId.CREDIT_GENERATOR}><NodeAccessController toolId={ToolId.CREDIT_GENERATOR} displayName="CRediT Tagging"><CreditGenerator /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/uncitedCleaner" element={<ProtectedRoute><Layout currentTool={ToolId.UNCITED_CLEANER}><NodeAccessController toolId={ToolId.UNCITED_CLEANER} displayName="Uncited Ref Cleaner"><UncitedRefCleaner /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/otherRefScanner" element={<ProtectedRoute><Layout currentTool={ToolId.OTHER_REF_SCANNER}><NodeAccessController toolId={ToolId.OTHER_REF_SCANNER} displayName="Other-Ref Scanner"><OtherRefScanner /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/quickDiff" element={<ProtectedRoute><Layout currentTool={ToolId.QUICK_DIFF}><NodeAccessController toolId={ToolId.QUICK_DIFF} displayName="Quick Text Diff"><QuickDiff /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/tagCleaner" element={<ProtectedRoute><Layout currentTool={ToolId.TAG_CLEANER}><NodeAccessController toolId={ToolId.TAG_CLEANER} displayName="XML Tag Cleaner"><TagCleaner /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/tableFixer" element={<ProtectedRoute><Layout currentTool={ToolId.TABLE_FIXER}><NodeAccessController toolId={ToolId.TABLE_FIXER} displayName="XML Table Fixer"><TableFixer /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/highlightsGen" element={<ProtectedRoute><Layout currentTool={ToolId.HIGHLIGHTS_GEN}><NodeAccessController toolId={ToolId.HIGHLIGHTS_GEN} displayName="Article Highlights Gen"><ArticleHighlights /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/viewSync" element={<ProtectedRoute><Layout currentTool={ToolId.VIEW_SYNC}><NodeAccessController toolId={ToolId.VIEW_SYNC} displayName="View Synchronizer"><ViewSync /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/referenceGen" element={<ProtectedRoute><Layout currentTool={ToolId.REFERENCE_GEN}><NodeAccessController toolId={ToolId.REFERENCE_GEN} displayName="Reference Updater"><ReferenceUpdater /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/refDupeCheck" element={<ProtectedRoute><Layout currentTool={ToolId.REF_DUPE_CHECK}><NodeAccessController toolId={ToolId.REF_DUPE_CHECK} displayName="Duplicate Ref Remover"><ReferenceDupeChecker /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/refExtractor" element={<ProtectedRoute><Layout currentTool={ToolId.REF_EXTRACTOR}><NodeAccessController toolId={ToolId.REF_EXTRACTOR} displayName="Bibliography Extractor"><ReferenceExtractor /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/refPurger" element={<ProtectedRoute><Layout currentTool={ToolId.REF_PURGER}><NodeAccessController toolId={ToolId.REF_PURGER} displayName="Reference List Purger"><RefListPurger /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/grantTagger" element={<ProtectedRoute><Layout currentTool={ToolId.GRANT_TAGGER}><NodeAccessController toolId={ToolId.GRANT_TAGGER} displayName="Grant Tagger"><GrantTagger /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/idAuditor" element={<ProtectedRoute><Layout currentTool={ToolId.ID_AUDITOR}><NodeAccessController toolId={ToolId.ID_AUDITOR} displayName="ID Prefix Auditor"><IdAuditor /></NodeAccessController></Layout></ProtectedRoute>} />
                        <Route path="/commentReplacer" element={<ProtectedRoute><Layout currentTool={ToolId.COMMENT_REPLACER}><NodeAccessController toolId={ToolId.COMMENT_REPLACER} displayName="Comment Replacer"><CommentReplacer /></NodeAccessController></Layout></ProtectedRoute>} />
                    </Routes>
                </HashRouter>
            </AuthProvider>
        </ErrorBoundary>
    );
};

export default App;