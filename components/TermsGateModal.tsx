import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scale, CheckCircle2, ShieldAlert, LogOut, ChevronRight, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import TermsModal from './TermsModal';

interface TermsGateModalProps {
    isOpen: boolean;
}

const TermsGateModal: React.FC<TermsGateModalProps> = ({ isOpen }) => {
    const { updateProfile, signOut, user } = useAuth();
    const [isChecked, setIsChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTermsDetailsOpen, setIsTermsDetailsOpen] = useState(false);

    if (!isOpen) return null;

    const handleAccept = async () => {
        if (!isChecked || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await updateProfile({
                terms_accepted: true,
                accepted_terms_at: new Date().toISOString()
            });
            if (user?.id) {
                try {
                    localStorage.setItem(`terms_accepted_${user.id}`, 'true');
                } catch (e) {}
            }
        } catch (error) {
            console.error("Failed to persist terms acceptance:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl border border-slate-200 max-w-xl w-full p-6 sm:p-10 text-slate-900 relative overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 shrink-0">
                            <Scale size={28} />
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                                Legal Protocol
                            </span>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                                Terms of Use Agreement
                            </h2>
                        </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6 font-medium">
                        To access Production Toolkit features and editorial conversion modules, all users must review and explicitly accept our Terms and Conditions of Use.
                    </p>

                    {/* Key Policies Brief */}
                    <div className="space-y-3 mb-6 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-100 text-xs">
                        <div className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                                1
                            </div>
                            <div>
                                <p className="font-black text-slate-800 uppercase tracking-wide text-[11px]">Individual User License</p>
                                <p className="text-slate-500 text-[11px] mt-0.5">Non-transferable license strictly bound to one user. Account and credential sharing are prohibited.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                                2
                            </div>
                            <div>
                                <p className="font-black text-slate-800 uppercase tracking-wide text-[11px]">Prohibited Proxy Processing</p>
                                <p className="text-slate-500 text-[11px] mt-0.5">Running conversions, normalizations, or scripts on behalf of non-subscribed third parties is strictly forbidden.</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px]">
                                3
                            </div>
                            <div>
                                <p className="font-black text-slate-800 uppercase tracking-wide text-[11px]">Compliance & Monitoring</p>
                                <p className="text-slate-500 text-[11px] mt-0.5">Usage telemetry and device binding protocols are enforced. Violations result in immediate access revocation.</p>
                            </div>
                        </div>
                    </div>

                    {/* Checkbox Section */}
                    <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 mb-6">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                id="terms-gate-checkbox"
                                checked={isChecked}
                                onChange={(e) => setIsChecked(e.target.checked)}
                                className="mt-0.5 w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 shrink-0"
                            />
                            <span className="text-xs font-bold text-slate-800 leading-snug">
                                I have read, acknowledge, and agree to comply with the{' '}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsTermsDetailsOpen(true);
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 underline font-black inline-flex items-center gap-0.5"
                                >
                                    Terms and Conditions of Use
                                </button>
                            </span>
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <button
                            type="button"
                            onClick={() => signOut()}
                            className="w-full sm:w-auto px-5 py-3.5 rounded-2xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                        >
                            <LogOut size={16} />
                            Decline & Sign Out
                        </button>

                        <button
                            type="button"
                            onClick={handleAccept}
                            disabled={!isChecked || isSubmitting}
                            className="w-full sm:flex-1 py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <CheckCircle2 size={18} />
                            )}
                            {isSubmitting ? 'Recording Acceptance...' : 'Accept Terms & Continue'}
                        </button>
                    </div>
                </motion.div>
            </div>

            <TermsModal
                isOpen={isTermsDetailsOpen}
                onClose={() => setIsTermsDetailsOpen(false)}
            />
        </AnimatePresence>
    );
};

export default TermsGateModal;
