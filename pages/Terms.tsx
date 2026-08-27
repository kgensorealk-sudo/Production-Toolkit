import React from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { 
    Scale, 
    ShieldCheck, 
    ArrowLeft, 
    FileText, 
    Users, 
    DollarSign, 
    Ban, 
    AlertTriangle, 
    CheckCircle2, 
    Printer, 
    Mail,
    Lock
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Terms: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 flex flex-col">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => user ? navigate('/dashboard') : navigate('/login')}
                        className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 px-3.5 py-2 rounded-xl transition-all"
                    >
                        <ArrowLeft size={16} />
                        <span>{user ? 'Back to Workspace' : 'Back to Login'}</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200"></div>
                    <div className="flex items-center gap-2">
                        <Scale size={18} className="text-indigo-600" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-800">Production Toolkit Legal</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={handlePrint}
                        className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs transition-all"
                    >
                        <Printer size={14} />
                        <span>Print</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow max-w-4xl w-full mx-auto px-4 sm:px-8 py-10 md:py-16 space-y-10">
                {/* Title Card */}
                <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 md:p-12 shadow-xl border border-slate-800 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
                    <div className="relative z-10 space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold uppercase tracking-widest">
                            <Scale size={14} />
                            <span>Legal Agreement & Code of Conduct</span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white uppercase">
                            Terms and Conditions of Use
                        </h1>
                        <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-2xl font-light">
                            By subscribing to or using these tools, you agree to comply with and be bound by the following Terms and Conditions. Please read them carefully.
                        </p>
                    </div>
                </motion.div>

                {/* Section 1: Subscription & Account Access */}
                <motion.section 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-5"
                >
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-base shrink-0">
                            1
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                                Subscription & Account Access
                            </h2>
                            <p className="text-xs text-slate-400 font-medium">Individual licensing and credential security</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                                <Lock size={16} />
                                <h3>Individual License</h3>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Each subscription grants a <strong>non-transferable, non-exclusive license</strong> for one individual user only.
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                                <ShieldCheck size={16} />
                                <h3>No Account Sharing</h3>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Sharing credentials, login details, or tool access with non-subscribers is <strong>strictly prohibited</strong>.
                            </p>
                        </div>
                    </div>
                </motion.section>

                {/* Section 2: Prohibited Activities & Unauthorized Commercial Use */}
                <motion.section 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="bg-white rounded-3xl p-6 md:p-8 border border-rose-200 shadow-sm space-y-5"
                >
                    <div className="flex items-center gap-3 border-b border-rose-100 pb-4">
                        <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 font-black text-base shrink-0">
                            2
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-rose-950 uppercase tracking-tight">
                                Prohibited Activities & Unauthorized Commercial Use
                            </h2>
                            <p className="text-xs text-rose-600 font-medium">Restrictions on proxy usage and monetization</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-rose-50/40 border border-rose-200 space-y-2">
                            <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                                <Ban size={16} />
                                <h3>No Proxy Processing</h3>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                                You are <strong>strictly forbidden</strong> from running XML conversions, renumbering, or executing scripts/tools on behalf of non-subscribed users.
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl bg-rose-50/40 border border-rose-200 space-y-2">
                            <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                                <Ban size={16} />
                                <h3>No Reselling or Outsourcing Services</h3>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                                You may <strong>not sell, rent, or monetize</strong> services using these tools to third parties or non-members.
                            </p>
                        </div>
                    </div>
                </motion.section>

                {/* Section 3: Pricing & Group Rates */}
                <motion.section 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                    className="bg-white rounded-3xl p-6 md:p-8 border border-emerald-200 shadow-sm space-y-5"
                >
                    <div className="flex items-center gap-3 border-b border-emerald-100 pb-4">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-black text-base shrink-0">
                            3
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-emerald-950 uppercase tracking-tight">
                                Pricing & Group Rates
                            </h2>
                            <p className="text-xs text-emerald-600 font-medium">Monthly billing tiers and group eligibility</p>
                        </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                        Subscriptions are billed on a monthly basis at designated rates:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-6 rounded-2xl bg-emerald-50/30 border border-emerald-200 text-center space-y-2 hover:shadow-md transition-all">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Solo User</span>
                            <div className="text-3xl font-black text-emerald-700">₱300<span className="text-sm font-normal text-slate-500">/mo</span></div>
                            <p className="text-xs text-slate-500">1 Individual Subscriber</p>
                        </div>

                        <div className="p-6 rounded-2xl bg-emerald-50/30 border border-emerald-200 text-center space-y-2 hover:shadow-md transition-all">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">2 Users</span>
                            <div className="text-3xl font-black text-emerald-700">₱250<span className="text-sm font-normal text-slate-500">/mo each</span></div>
                            <p className="text-xs text-slate-500">Individual licenses</p>
                        </div>

                        <div className="p-6 rounded-2xl bg-emerald-50/70 border-2 border-emerald-400 text-center space-y-2 shadow-sm hover:shadow-md transition-all relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                Best Value
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">3+ Users</span>
                            <div className="text-3xl font-black text-emerald-800">₱175<span className="text-sm font-normal text-slate-600">/mo each</span></div>
                            <p className="text-xs text-emerald-700 font-medium">Individual licenses</p>
                        </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200 text-xs text-slate-700 flex items-start gap-2.5">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                        <span>
                            <strong>Group Rate Notice:</strong> Group rates apply strictly to separate, individual active subscribers joining together and do not grant shared account access.
                        </span>
                    </div>
                </motion.section>

                {/* Section 4: Account Banning, Subscription Cancellation, & Service Termination */}
                <motion.section 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                    className="bg-white rounded-3xl p-6 md:p-8 border border-amber-200 shadow-sm space-y-5"
                >
                    <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-700 font-black text-base shrink-0">
                            4
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-amber-950 uppercase tracking-tight">
                                Account Banning, Subscription Cancellation, & Service Termination
                            </h2>
                            <p className="text-xs text-amber-700 font-medium">Enforcement policy for policy violations and system abuse</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="p-5 rounded-2xl bg-amber-50/40 border border-amber-200 flex items-start gap-3">
                            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-bold text-amber-950 text-sm mb-1">Banning & Cancellation</h3>
                                <p className="text-xs text-slate-700 leading-relaxed">
                                    Anyone caught sharing their account, acting as a proxy for non-paying users, or selling services using these tools will be <strong>permanently banned and have their subscription discontinued immediately by the Admin without a refund</strong>.
                                </p>
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-amber-50/40 border border-amber-200 flex items-start gap-3">
                            <Ban size={18} className="text-amber-700 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-bold text-amber-950 text-sm mb-1">Public Service Shutdown</h3>
                                <p className="text-xs text-slate-700 leading-relaxed">
                                    If widespread system abuse or proxy usage persists, the <strong>Admin reserves the right to permanently shut down public access for all users without prior notice</strong>.
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.section>

                {/* Section 5: Service Availability & Modifications */}
                <motion.section 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 }}
                    className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-5"
                >
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 font-black text-base shrink-0">
                            5
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                                Service Availability & Modifications
                            </h2>
                            <p className="text-xs text-slate-400 font-medium">As-is provision and operational rights</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <h3 className="font-bold text-slate-900 text-sm">"As-Is" Status</h3>
                            <p className="leading-relaxed">
                                Tools are provided on an <strong>"as-is" and "as-available"</strong> basis.
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <h3 className="font-bold text-slate-900 text-sm">Right to Modify</h3>
                            <p className="leading-relaxed">
                                Features, security protocols, and pricing tiers are subject to modification at the <strong>sole discretion of the Admin</strong> to maintain system sustainability.
                            </p>
                        </div>
                    </div>
                </motion.section>

                {/* Admin Contact Box */}
                <div className="p-6 rounded-3xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-2xl bg-white/10 text-indigo-300">
                            <Mail size={20} />
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Questions or Subscription Inquiries?</div>
                            <div className="text-sm font-bold text-white mt-0.5">kgenso.realK@gmail.com</div>
                        </div>
                    </div>
                    <button 
                        onClick={() => user ? navigate('/dashboard') : navigate('/login')}
                        className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
                    >
                        {user ? 'Return to Workspace' : 'Proceed to Sign In'}
                    </button>
                </div>

                <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] pt-4 pb-8">
                    &copy; 2026 Editorial Systems Pro. All rights reserved.
                </div>
            </main>
        </div>
    );
};

export default Terms;
