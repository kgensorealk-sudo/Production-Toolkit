
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { ToolId } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoadingOverlay from './components/LoadingOverlay';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireSubscription?: boolean }> = ({ children, requireSubscription = false }) => {
    const { session, profile, loading } = useAuth();
    
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <LoadingOverlay message="Authenticating..." color="indigo" />
            </div>
        );
    }
    
    if (!session) {
        return <Navigate to="/login" replace />;
    }

    if (requireSubscription && !profile?.is_subscribed) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, profile, loading } = useAuth();
    
    if (loading) {
        return <LoadingOverlay message="Verifying Admin..." color="slate" />;
    }
    
    if (!session || profile?.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <HashRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<ProtectedRoute><Landing /></ProtectedRoute>} />
                    <Route path="/admin" element={<AdminRoute><Layout><AdminDashboard /></Layout></AdminRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute requireSubscription={true}><Layout><Dashboard /></Layout></ProtectedRoute>} />
                    <Route path="/docs" element={<ProtectedRoute requireSubscription={true}><Layout><Docs /></Layout></ProtectedRoute>} />
                    
                    <Route path="/xmlRenumber" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.XML_RENUMBER}>
                                <XmlRenumber />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/uncitedCleaner" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.UNCITED_CLEANER}>
                                <UncitedRefCleaner />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/otherRefScanner" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.OTHER_REF_SCANNER}>
                                <OtherRefScanner />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/refExtractor" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.REFERENCE_EXTRACTOR}>
                                <ReferenceExtractor />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/refListPurger" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.REF_LIST_PURGER}>
                                <RefListPurger />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    
                    <Route path="/creditGenerator" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.CREDIT_GENERATOR}>
                                <CreditGenerator />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/quickDiff" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.QUICK_DIFF}>
                                <QuickDiff />
                            </Layout>
                        </ProtectedRoute>
                    } />
                    
                    <Route path="/tagCleaner" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.TAG_CLEANER}>
                                <TagCleaner />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/tableFixer" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.TABLE_FIXER}>
                                <TableFixer />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/highlightsGen" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.HIGHLIGHTS_GEN}>
                                <ArticleHighlights />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/viewSync" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.VIEW_SYNC}>
                                <ViewSync />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/referenceGen" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.REFERENCE_GEN}>
                                <ReferenceUpdater />
                            </Layout>
                        </ProtectedRoute>
                    } />

                    <Route path="/refDupeCheck" element={
                        <ProtectedRoute requireSubscription={true}>
                            <Layout currentTool={ToolId.REF_DUPE_CHECK}>
                                <ReferenceDupeChecker />
                            </Layout>
                        </ProtectedRoute>
                    } />
                </Routes>
            </HashRouter>
        </AuthProvider>
    );
};

export default App;
