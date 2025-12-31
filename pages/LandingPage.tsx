import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingOverlay from '../components/LoadingOverlay';

const FeatureBlock: React.FC<{ 
    title: string; 
    problem: string; 
    solution: string; 
    color: string;
    delay: string;
}> = ({ title, problem, solution, color, delay }) => (
    <div className={`glass-panel bg-white/80 p-6 rounded-2xl animate-slide-up group hover:scale-[1.02] transition-all duration-300`} style={{ animationDelay: delay }}>
        <h3 className={`text-xl font-bold mb-3 ${color}`}>{title}</h3>
        <div className="space-y-4">
            <div className="flex gap-3 items-start opacity-70 group-hover:opacity-100 transition-opacity">
                <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed"><span className="font-semibold text-slate-800">The Pain:</span> {problem}</p>
            </div>
            <div className="h-px bg-slate-100"></div>
            <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed"><span className="font-semibold">The Solution:</span> {solution}</p>
            </div>
        </div>
    </div>
);

const LandingPage: React.FC = () => {
    const { user, profile, isAdmin, isSubscribed, isTrialing, daysLeft, authError, signOut, loading } = useAuth();
    const navigate = useNavigate();
    const [showContactModal, setShowContactModal] = useState(false);
    const [minLoading, setMinLoading] = useState(true);

    // Enforce a minimum loading time of 1.5 seconds to prevent flashing states
    useEffect(() => {
        const timer = setTimeout(() => {
            setMinLoading(false);
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    // Check if we are still effectively loading:
    // 1. Global auth loading
    // 2. Minimum timer not finished
    // 3. Profile data is still being fetched (user exists but profile is null)
    const isProfileSyncing = user && !profile && !authError;
    
    if (loading || minLoading || isProfileSyncing) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingOverlay message="Loading Workspace..." color="indigo" />
            </div>
        );
    }

    // Determine if the user has valid access (Admin, Paid, or Trial)
    // Note: In AuthContext, isSubscribed is true if isTrialing is true
    const isAccessActive = isSubscribed || isAdmin;

    // Determine the specific type of status (Expired Sub, Expired Trial, or Fresh Account)
    // Only relevant if !isAccessActive
    const getExpirationState = () => {
        if (!profile) return { type: 'fresh', date: null };
        
        const now = new Date();
        const subEnd = profile.subscription_end ? new Date(profile.subscription_end) : null;
        const trialEnd = profile.trial_end ? new Date(profile.trial_end) : null;

        // 1. Subscription Expired (Priority)
        if (subEnd && subEnd < now) {
            return { type: 'subscription', date: subEnd.toLocaleDateString() };
        }
        
        // 2. Trial Expired
        if (trialEnd && trialEnd < now) {
            return { type: 'trial', date: trialEnd.toLocaleDateString() };
        }

        // 3. Fresh Account / No Previous Subscription
        return { type: 'fresh', date: null };
    };

    const { type: expireType, date: expireDate } = getExpirationState();

    return (
        <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 relative">
            
            {/* Modal */}
            {showContactModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative border border-slate-200 animate-scale-in">
                        <button 
                            onClick={() => setShowContactModal(false)} 
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-2 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                        
                        <div className="text-center">
                            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-5">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-3">Upgrade Your Access</h3>
                            <p className="text-slate-600 mb-8 leading-relaxed">
                                To unlock the full workflow suite, please contact the administrator directly through Facebook Messenger.
                            </p>
                            <a 
                                href="https://www.messenger.com/" 
                                target="_blank" 
                                rel="noreferrer"
                                className="block w-full bg-[#0084FF] hover:bg-[#0078e7] text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transform transition-all hover:-translate-y-1 active:scale-95 text-lg"
                            >
                                Open Messenger
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className="text-center mb-16 animate-fade-in pt-10">
                
                {authError && (
                    <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl max-w-2xl mx-auto flex items-center gap-3 text-red-700 animate-slide-up">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <span className="text-sm font-medium text-left">{authError} (You are seeing this limited view)</span>
                    </div>
                )}

                {/* Account Status Card */}
                {!isAccessActive ? (
                    <div className="mb-8 p-6 bg-amber-50 border border-amber-200 rounded-2xl max-w-2xl mx-auto shadow-sm">
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3">
                                {expireType === 'trial' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                ) : expireType === 'fresh' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                )}
                            </div>
                            <h2 className="text-lg font-bold text-amber-900">
                                {expireType === 'trial' ? 'Free Trial Ended' : 
                                 expireType === 'fresh' ? 'License Required' : 'Subscription Expired'}
                            </h2>
                            <p className="text-amber-700 mt-1 max-w-lg">
                                {expireType === 'trial' ? (
                                    <>We hope you enjoyed the preview! Your trial access ended on <span className="font-semibold">{expireDate}</span>.</>
                                ) : expireType === 'fresh' ? (
                                    <>Hi <span className="font-semibold">{user?.email}</span>. To access the Production Toolkit tools, please activate a subscription.</>
                                ) : (
                                    <>Hi <span className="font-semibold">{user?.email}</span>, your access ended on {expireDate || 'Unknown Date'}.</>
                                )}
                            </p>
                            <div className="mt-4">
                                <button 
                                    onClick={() => setShowContactModal(true)}
                                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-amber-500/20"
                                >
                                    {expireType === 'trial' ? 'Upgrade to Pro' : 
                                     expireType === 'fresh' ? 'Get Started' : 'Renew Access'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mb-6 flex flex-col items-center animate-slide-up">
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider mb-2 ${
                            isTrialing 
                            ? 'bg-orange-50 border-orange-100 text-orange-700' 
                            : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                        }`}>
                            <span className={`w-2 h-2 rounded-full ${isTrialing ? 'bg-orange-500' : 'bg-indigo-500'}`}></span>
                            {isTrialing ? 'Free Trial Active' : 'Professional Edition'}
                        </div>
                        {isTrialing && daysLeft !== null && (
                            <p className="text-sm text-slate-500 font-medium">{daysLeft} days remaining in trial</p>
                        )}
                    </div>
                )}
                
                <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
                    Stop fixing XML <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">by hand.</span>
                </h1>
                <p className="text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed">
                    Production workflows are complex. Missing a single tag or breaking a reference ID can cause hours of rework. 
                    Unlock the suite designed to automate the error-prone parts of your day.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
                <FeatureBlock 
                    title="XML Renumbering"
                    color="text-blue-600"
                    problem="Manually renumbering 50+ citations and finding every cross-reference in the text is tedious and error-prone."
                    solution="One-click renumbering that automatically finds and updates every <cross-ref> in the document, ensuring perfect sync."
                    delay="100ms"
                />
                <FeatureBlock 
                    title="CRediT Tagging"
                    color="text-purple-600"
                    problem="Author statements come in inconsistent formats. Parsing names, mapping to CRediT taxonomy, and generating XML tags takes forever."
                    solution="Paste raw text, get valid NISO XML instantly. Auto-corrects typos (e.g., 'Writting') and deduplicates roles."
                    delay="200ms"
                />
                <FeatureBlock 
                    title="Table Footnotes"
                    color="text-pink-600"
                    problem="Tables often have general legends incorrectly tagged as specific footnotes, breaking the layout."
                    solution="Visual interface to detach footnotes into legends or attach legends back to specific cells without touching code."
                    delay="300ms"
                />
                <FeatureBlock 
                    title="View Synchronization"
                    color="text-indigo-600"
                    problem="Dual-view XMLs (Compact vs Extended) often drift out of sync, causing validation errors."
                    solution="Select a source of truth and instantly mirror content to the other view while regenerating unique IDs."
                    delay="400ms"
                />
                <FeatureBlock 
                    title="Tag Cleaning"
                    color="text-teal-600"
                    problem="Editorial tracking tags (<opt_DEL>) clutter the file, making it hard to read or process."
                    solution="Bulk accept or reject changes. Cleanse the entire document structure in milliseconds."
                    delay="500ms"
                />
                <FeatureBlock 
                    title="Reference Generation"
                    color="text-sky-600"
                    problem="Converting a Word document bibliography into structured Elsevier/NISO XML is a manual copy-paste nightmare."
                    solution="Intelligent parser extracts Authors, Year, Title, Journal, and Volume info and builds the XML for you."
                    delay="600ms"
                />
            </div>

            <div className="bg-slate-900 rounded-3xl p-10 md:p-16 text-center relative overflow-hidden animate-scale-in">
                {/* Decorative blobs */}
                <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 right-0 w-64 h-64 bg-violet-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 translate-x-1/2 translate-y-1/2"></div>
                
                <div className="relative z-10">
                    <h2 className="text-3xl font-bold text-white mb-6">
                        {isAccessActive ? "Your workspace is ready" : "Ready to accelerate your workflow?"}
                    </h2>
                    <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
                        {isAccessActive 
                            ? "You have full access to the Production Toolkit. Jump back in to continue your work." 
                            : "Upgrade your account to gain full access to the Dashboard and all automation tools."}
                    </p>
                    <button 
                        onClick={() => isAccessActive ? navigate('/') : setShowContactModal(true)}
                        className={`font-bold py-4 px-10 rounded-xl shadow-lg transform transition-all hover:-translate-y-1 active:scale-95 text-lg ${
                            isAccessActive 
                            ? 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/40' 
                            : 'bg-white text-slate-900 hover:bg-indigo-50'
                        }`}
                    >
                        {isAccessActive 
                            ? 'Continue to Dashboard' 
                            : (expireType === 'trial' ? 'Get Pro Access' : expireType === 'fresh' ? 'Subscribe Now' : 'Renew Access')}
                    </button>
                    {!isAccessActive && (
                        <p className="mt-4 text-xs text-slate-500">
                            Contact administrator for enterprise licensing.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LandingPage;