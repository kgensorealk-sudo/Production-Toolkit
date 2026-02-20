import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Rocket, Bug, Zap, History, ChevronRight } from 'lucide-react';
import { RELEASE_NOTES, ReleaseNote } from '../constants/releaseNotes';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <History size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Version History</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Toolkit Evolution Log</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-grow overflow-y-auto p-8 custom-scrollbar space-y-10">
              {RELEASE_NOTES.map((note, idx) => (
                <div key={note.version} className="relative">
                  {/* Timeline line */}
                  {idx !== RELEASE_NOTES.length - 1 && (
                    <div className="absolute left-[19px] top-10 bottom-[-40px] w-0.5 bg-slate-100" />
                  )}
                  
                  <div className="flex gap-6">
                    <div className={`shrink-0 w-10 h-10 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 ${
                      note.type === 'major' ? 'bg-indigo-600 text-white' : 
                      note.type === 'minor' ? 'bg-indigo-100 text-indigo-600' : 
                      'bg-slate-100 text-slate-500'
                    }`}>
                      <span className="text-[10px] font-black">{note.version.split('.')[0]}</span>
                    </div>
                    
                    <div className="flex-grow">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{note.title}</h3>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 uppercase">
                          {note.date}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                          note.type === 'major' ? 'bg-indigo-100 text-indigo-700' : 
                          note.type === 'minor' ? 'bg-blue-100 text-blue-700' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          v{note.version}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {note.changes.map((change, cIdx) => (
                          <div key={cIdx} className="flex items-start gap-3 group">
                            <div className={`mt-1 p-1 rounded-md shrink-0 ${
                              change.type === 'feature' ? 'text-emerald-500 bg-emerald-50' : 
                              change.type === 'fix' ? 'text-rose-500 bg-rose-50' : 
                              'text-amber-500 bg-amber-50'
                            }`}>
                              {change.type === 'feature' ? <Rocket size={12} /> : 
                               change.type === 'fix' ? <Bug size={12} /> : 
                               <Zap size={12} />}
                            </div>
                            <p className="text-sm text-slate-600 font-medium leading-relaxed">
                              {change.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center">
              <button 
                onClick={onClose}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black py-3 px-8 rounded-xl transition-all active:scale-95 text-[10px] uppercase tracking-widest shadow-lg shadow-slate-900/10"
              >
                Close Log
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ReleaseNotesModal;
