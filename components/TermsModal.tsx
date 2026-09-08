import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    FileText, 
    ShieldAlert, 
    Users, 
    UserCheck, 
    Ban, 
    AlertTriangle, 
    CheckCircle2, 
    X, 
    ExternalLink,
    Scale,
    Lock,
    Mail,
    KeyRound
} from 'lucide-react';

interface TermsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden ring-4 ring-slate-900/5 my-auto"
                >
                    {/* Header */}
                    <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                                <Scale size={22} strokeWidth={2} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-tight text-white">Terms and Conditions of Use</h3>
                                <p className="text-xs text-indigo-200/80 font-medium">Production Toolkit • Authorized Access & Code of Conduct</p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            title="Close"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-slate-700 text-sm leading-relaxed custom-scrollbar">
                        {/* Preamble */}
                        <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3.5">
                            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 shrink-0 mt-0.5">
                                <FileText size={18} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 text-sm">Platform Access & Operational Guidelines</h4>
                                <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                                    By requesting access, activating credentials, or using these editorial utilities, you agree to comply with and be bound by the following Terms and Conditions. This platform is a specialized operational workspace for authorized operators.
                                </p>
                            </div>
                        </div>

                        {/* Clause 1 */}
                        <div className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-colors shadow-2xs space-y-3">
                            <div className="flex items-center gap-2.5 text-slate-900 font-black text-sm">
                                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">1</span>
                                <h4>Authorized Access & Operator Verification</h4>
                            </div>
                            <div className="grid gap-2.5 pl-8 text-xs text-slate-600">
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <span className="font-bold text-slate-900 block mb-0.5">Individual Operator Authorization:</span>
                                    Each provisioned account grants individual, non-transferable authorization strictly for the designated registered operator.
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <span className="font-bold text-rose-700 block mb-0.5">No Credential Sharing:</span>
                                    Sharing login credentials, access tokens, or tool sessions with unauthorized individuals is strictly prohibited.
                                </div>
                            </div>
                        </div>

                        {/* Clause 2 */}
                        <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/30 hover:border-rose-300 transition-colors shadow-2xs space-y-3">
                            <div className="flex items-center gap-2.5 text-rose-900 font-black text-sm">
                                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-rose-100 text-rose-700 text-xs font-bold">2</span>
                                <h4>Prohibited Misuse & Unauthorized External Services</h4>
                            </div>
                            <div className="grid gap-2.5 pl-8 text-xs text-slate-700">
                                <div className="p-3 rounded-xl bg-white border border-rose-200">
                                    <span className="font-bold text-rose-800 block mb-0.5">No Proxy Processing:</span>
                                    You are strictly forbidden from running XML conversions, renumbering, or executing scripts/tools on behalf of unauthorized non-members.
                                </div>
                                <div className="p-3 rounded-xl bg-white border border-rose-200">
                                    <span className="font-bold text-rose-800 block mb-0.5">No Commercial Exploitation or Resale:</span>
                                    You may not sell, broker, rent, or commercially exploit these internal utilities or offer commercial outsourcing services using this platform.
                                </div>
                            </div>
                        </div>

                        {/* Clause 3 */}
                        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 transition-colors shadow-2xs space-y-3">
                            <div className="flex items-center gap-2.5 text-emerald-900 font-black text-sm">
                                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">3</span>
                                <h4>Access Allocation & Team Arrangements</h4>
                            </div>
                            <div className="grid gap-3 pl-8 text-xs text-slate-700">
                                <p>
                                    The Production Toolkit is a personally developed operational environment. Access to editorial utilities, automated XML pipelines, and the Keeper editorial assistant is provisioned privately through the Administrator for verified personnel to sustain ongoing server infrastructure and maintenance:
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div className="p-3 rounded-xl bg-white border border-emerald-200 text-center shadow-2xs">
                                        <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Individual Operator</div>
                                        <div className="text-xs font-black text-emerald-800 mt-1 uppercase">Authorized Seat</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">1 Dedicated Workspace</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-emerald-200 text-center shadow-2xs">
                                        <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Editorial Pair</div>
                                        <div className="text-xs font-black text-emerald-800 mt-1 uppercase">Dual Allocation</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">Coordinated partner setup</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white border border-emerald-200 text-center shadow-2xs ring-2 ring-emerald-400/40">
                                        <div className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">Editorial Team</div>
                                        <div className="text-xs font-black text-emerald-800 mt-1 uppercase">Team Allocation</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">Coordinated group setup</div>
                                    </div>
                                </div>
                                <div className="p-3 rounded-xl bg-white border border-emerald-200 text-slate-600 text-[11px] space-y-1.5">
                                    <p>
                                        <strong>Collaborative Team Notice:</strong> Multi-seat arrangements apply strictly to separate, verified individual accounts collaborating within the workflow and do not permit shared logins.
                                    </p>
                                    <p className="flex items-center gap-1.5 text-emerald-900 font-semibold">
                                        <Mail size={13} className="text-emerald-700 shrink-0" />
                                        <span>Inquire with Admin: <a href="mailto:kgenso.realK@gmail.com" className="underline font-bold text-emerald-950 hover:text-emerald-700">kgenso.realK@gmail.com</a></span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Clause 4 */}
                        <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/30 hover:border-amber-300 transition-colors shadow-2xs space-y-3">
                            <div className="flex items-center gap-2.5 text-amber-900 font-black text-sm">
                                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold">4</span>
                                <h4>Access Revocation & System Integrity Enforcement</h4>
                            </div>
                            <div className="grid gap-2.5 pl-8 text-xs text-slate-700">
                                <div className="p-3 rounded-xl bg-white border border-amber-200">
                                    <span className="font-bold text-amber-900 block mb-0.5">Immediate Access Revocation:</span>
                                    Anyone caught sharing credentials, acting as an unauthorized proxy, or commercially exploiting these tools will have their access revoked permanently and immediately by the Administrator.
                                </div>
                                <div className="p-3 rounded-xl bg-white border border-amber-200">
                                    <span className="font-bold text-amber-900 block mb-0.5">Platform Protection:</span>
                                    If widespread system abuse, proxy usage, or security circumvention persists, the Administrator reserves the right to suspend or restrict platform access to protect server resources.
                                </div>
                            </div>
                        </div>

                        {/* Clause 5 */}
                        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-slate-300 transition-colors shadow-2xs space-y-3">
                            <div className="flex items-center gap-2.5 text-slate-900 font-black text-sm">
                                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-slate-200 text-slate-800 text-xs font-bold">5</span>
                                <h4>Operational Status & Utility Modifications</h4>
                            </div>
                            <div className="grid gap-2.5 pl-8 text-xs text-slate-600">
                                <div className="p-3 rounded-xl bg-white border border-slate-200">
                                    <span className="font-bold text-slate-800 block mb-0.5">"As-Is" Utility Provision:</span>
                                    Tools are provided on an "as-is" and "as-available" basis for editorial workflow assistance.
                                </div>
                                <div className="p-3 rounded-xl bg-white border border-slate-200">
                                    <span className="font-bold text-slate-800 block mb-0.5">System Evolution:</span>
                                    Tool features, algorithmic pipelines, security controls, and access guidelines are subject to modification at the sole discretion of the Administrator to maintain operational sustainability and system integrity.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                        <div className="text-[11px] text-slate-500 font-medium">
                            Admin Contact: <span className="font-bold text-slate-700">kgenso.realK@gmail.com</span>
                        </div>
                        <button 
                            onClick={onClose}
                            className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95"
                        >
                            I Understand & Agree
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default TermsModal;
