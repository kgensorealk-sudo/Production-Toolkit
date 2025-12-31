import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import XmlRenumber from './pages/XmlRenumber';
import CreditGenerator from './pages/CreditGenerator';
import QuickDiff from './pages/QuickDiff';
import TagCleaner from './pages/TagCleaner';
import TableFixer from './pages/TableFixer';
import ArticleHighlights from './pages/ArticleHighlights';
import ViewSync from './pages/ViewSync';
import ReferenceGenerator from './pages/ReferenceGenerator';
import Docs from './pages/Docs';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToolId } from './types';
import LoadingOverlay from './components/LoadingOverlay';

// 1. Authenticated but maybe not subscribed
const ProtectedRoute: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { user, loading } = useAuth();
    
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50"><LoadingOverlay color="indigo" message="Loading..." /></div>;
    }
    
    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    return <>{children}</>;
};

// 2. Authenticated AND (Subscribed OR Admin)
const SubscribedRoute: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { user, loading, isSubscribed, isAdmin } = useAuth();
    
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50"><LoadingOverlay color="indigo" message="Loading..." /></div>;
    }
    
    if (!user) {
        return <Navigate to="/auth" replace />;
    }

    // If not subscribed and not admin, send to landing page (the "interactive page")
    if (!isSubscribed && !isAdmin) {
        return <Navigate to="/landing" replace />;
    }

    return <>{children}</>;
};

// 3. Not Authenticated
const PublicRoute: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50"><LoadingOverlay color="indigo" message="Loading..." /></div>;
    }

    if (user) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

const AppRoutes: React.FC = () => {
    return (
        <Routes>
            {/* Public Access */}
            <Route path="/auth" element={
                <PublicRoute>
                    <Layout><AuthPage /></Layout>
                </PublicRoute>
            } />
            
            {/* Authenticated (Any User) - This is the "Interactive Page" for unsubscribed users */}
            <Route path="/landing" element={
                <ProtectedRoute>
                    <Layout><LandingPage /></Layout>
                </ProtectedRoute>
            } />

            {/* Subscribed Access (Dashboard & Tools) */}
            <Route path="/" element={
                <SubscribedRoute>
                    <Layout><Dashboard /></Layout>
                </SubscribedRoute>
            } />

            <Route path="/docs" element={
                <SubscribedRoute>
                    <Layout><Docs /></Layout>
                </SubscribedRoute>
            } />
            
            <Route path="/xmlRenumber" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.XML_RENUMBER}>
                        <XmlRenumber />
                    </Layout>
                </SubscribedRoute>
            } />
            
            <Route path="/creditGenerator" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.CREDIT_GENERATOR}>
                        <CreditGenerator />
                    </Layout>
                </SubscribedRoute>
            } />

            <Route path="/quickDiff" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.QUICK_DIFF}>
                        <QuickDiff />
                    </Layout>
                </SubscribedRoute>
            } />
            
            <Route path="/tagCleaner" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.TAG_CLEANER}>
                        <TagCleaner />
                    </Layout>
                </SubscribedRoute>
            } />

            <Route path="/tableFixer" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.TABLE_FIXER}>
                        <TableFixer />
                    </Layout>
                </SubscribedRoute>
            } />

            <Route path="/highlightsGen" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.HIGHLIGHTS_GEN}>
                        <ArticleHighlights />
                    </Layout>
                </SubscribedRoute>
            } />

            <Route path="/viewSync" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.VIEW_SYNC}>
                        <ViewSync />
                    </Layout>
                </SubscribedRoute>
            } />

            <Route path="/referenceGen" element={
                <SubscribedRoute>
                    <Layout currentTool={ToolId.REFERENCE_GEN}>
                        <ReferenceGenerator />
                    </Layout>
                </SubscribedRoute>
            } />
            
            {/* Catch all redirect */}
            <Route path="*" element={<Navigate to="/" replace>{null}</Navigate>} />
        </Routes>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <HashRouter>
                <AppRoutes />
            </HashRouter>
        </AuthProvider>
    );
};

export default App;