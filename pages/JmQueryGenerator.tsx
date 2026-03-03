import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    MessageSquare, 
    Copy, 
    Check, 
    Trash2, 
    Sparkles, 
    AlertCircle,
    Info,
    Send
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';

const QUICK_SUGGESTIONS = [
    { label: 'Author Addition', text: 'Author wants to add [Name] to the author list.' },
    { label: 'Title Change', text: 'Author provided a revised article title: [New Title].' },
    { label: 'Uncited Figure', text: 'Figure [X] is currently uncited in the text body.' },
    { label: 'Replacement Figure', text: 'Author provided a replacement for Figure [X]. No details provided.' },
    { label: 'Mismatch Panels', text: 'Panels [X] are mentioned in the caption but missing in artwork.' },
    { label: 'Coversheet Update', text: 'Update coversheet for [X] physical figures.' },
];

const JmQueryGenerator: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [feedback, setFeedback] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSuggestionClick = (text: string) => {
        setInput(prev => prev ? `${prev}\n${text}` : text);
    };

    const handleGenerate = async (isRefining = false) => {
        if (!input.trim()) {
            setToast({ msg: "Please provide raw notes or comments.", type: "error" });
            return;
        }

        if (isRefining && !feedback.trim()) {
            setToast({ msg: "Please provide feedback for correction.", type: "error" });
            return;
        }

        setIsLoading(true);
        try {
            // Robust API key retrieval
            const envKey = (process.env.GEMINI_API_KEY);
            const viteKey = (process.env.VITE_GEMINI_API_KEY);
            const metaKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY);
            const fallbackKey = (process.env.API_KEY);
            
            const apiKey = envKey || viteKey || metaKey || fallbackKey;
                           
            if (!apiKey) {
                console.error("API Key Detection Failed:", { envKey: !!envKey, viteKey: !!viteKey, metaKey: !!metaKey, fallbackKey: !!fallbackKey });
                throw new Error("Gemini API Key is missing. Please set GEMINI_API_KEY in your Vercel Environment Variables and redeploy. If testing locally, ensure it is in your .env file.");
            }
            const ai = new GoogleGenAI({ apiKey });
            
            let prompt = input;
            if (isRefining) {
                prompt = `ORIGINAL INPUT: ${input}\n\nPREVIOUS GENERATED QUERY: ${output}\n\nUSER FEEDBACK/CORRECTION: ${feedback}\n\nPlease regenerate the query based on the feedback while still following all the core rules.`;
            }

            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    systemInstruction: `You are an expert Journal Production Editor.
Your task is to transform raw production notes, author comments, or artwork/metadata issues into formal, standardized TO THE JM queries.

CORE FORMATTING RULES:
- Every response must be a SINGLE combined query.
- Every query must begin exactly with: TO THE JM:
- Every query involving an unresolved production issue must end exactly with: File is on pending status until matter is resolved. Thank you.
- Use "the text body" instead of "the manuscript" for uncited items.
- If the input contains multiple issues, MERGE them into one cohesive query. Do NOT repeat "TO THE JM:" or the pending clause for each issue. Use a single "TO THE JM:" at the start and a single pending clause at the end. Label each distinct concern with (a), (b), (c), etc. within the same paragraph. Do NOT use line breaks or bullet points; the entire query must be a single continuous block of text.

TONE SELECTION:
- Direct/Strict: For technical faults, unusable files, missing metadata. Use "Kindly provide", "Unusable due to...", "The file is unreadable", "Please resupply in acceptable format".
- Collaborative/Soft: For ambiguous author intent or editorial guidance. Use "Kindly assist the author", "Please advise on the best way to proceed", "Kindly confirm how we may proceed".
- Neutral/Procedural: For formal reporting. No directive tone. Report and request verification.

FIGURE REPLACEMENT PROTOCOLS:
- Scenario A (Detailed instructions): "The author has provided a replacement for [Figure X] that includes content changes compared to the current version. The author notes that [summarize comment]. Please confirm if we can use this replacement image."
- Scenario B (No details): "The author provided a replacement for [Figure X]. However, it is unclear whether the reason for this replacement is quality improvement, addition/removal of elements, or changed content. Please validate if we can proceed with the new version."
- Scenario C (Technical faults): Use terms like "pixelated text", "cutoff data", "unconverted characters", "blurry and overlapping data", "poor image and text quality", "unusable in present format". Request PDF, TIF, JPG, or DOC format.

UNCITED ITEMS & MISMATCHES:
- Uncited Items:
  - Direct: "Kindly ask the author to provide citations for [Reference/Figure/Table X] in the text body or confirm if this could be deleted."
  - Soft: "Kindly assist the author in providing citations for [Reference/Figure/Table X] in the text body or confirm if they may be removed."
  - Neutral: "The following [Reference/Figure/Table X] is currently uncited in the text body. Please verify with the author whether a citation is needed or if it may be deleted."
- Panel Label Mismatch: "Panels [X] have been mentioned in the figure caption but are not found in the artwork. Please check and amend as necessary."
- Symbol Mismatch: "‘[Symbol A]’ is mentioned in the caption but ‘[Symbol B]’ is present in the artwork. Please check and amend as necessary."

METADATA & ADMINISTRATIVE:
- Coversheet Updates: "If affirmed, kindly update coversheet accordingly reflecting [X] physical figures/tables/schemes/GA." or "If affirmed, kindly update coversheet accordingly reflecting the revised article title." (Mandatory for addition/removal of figures, tables, schemes, GA, or edits to the article title).
- Author Changes: "Please validate author's request to [add/remove/reorder] authors." (Do NOT include coversheet updates for author changes).
- Name Clarification: "Please confirm if [Name A] is the given name and [Name B] is the surname to ensure correct indexing."

OUTPUT REQUIREMENTS:
- Generate production-ready TO THE JM queries.
- Apply correct tone automatically.
- Include pending clause when required.
- Follow all formatting rules strictly.
- Output ONLY the final query.
- Do NOT include explanations, commentary, or labels.`
                }
            });

            setOutput(response.text || '');
            if (isRefining) {
                setFeedback('');
                setToast({ msg: "Query refined based on feedback.", type: "success" });
            }
        } catch (error: any) {
            console.error("Generation Error:", error);
            setToast({ msg: `Generation failed: ${error.message || "Unknown error"}`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (!output) return;
        navigator.clipboard.writeText(output);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        setToast({ msg: "Query copied to clipboard.", type: "success" });
    };

    const handleClear = () => {
        setInput('');
        setOutput('');
        setFeedback('');
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-12">
            <div className="mb-12">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 shadow-sm">
                        <MessageSquare className="text-indigo-600" size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">JM Query Generator</h1>
                        <p className="text-slate-500 font-medium text-sm">Transform raw production notes into standardized editorial queries.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Input Section */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <Info size={12} />
                            Raw Input Source
                        </div>
                        <button 
                            onClick={handleClear}
                            className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600 transition-colors flex items-center gap-1"
                        >
                            <Trash2 size={12} />
                            Clear
                        </button>
                    </div>
                    
                    {/* Quick Suggestions */}
                    <div className="flex flex-wrap gap-2 px-2">
                        {QUICK_SUGGESTIONS.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => handleSuggestionClick(s.text)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                            >
                                + {s.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative group">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Paste raw production notes, author comments, or artwork issues here..."
                            className="w-full h-[400px] p-6 bg-white border border-slate-200 rounded-[2rem] shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium text-slate-700 leading-relaxed resize-none"
                        />
                        <div className="absolute bottom-6 right-6">
                            <button
                                onClick={() => handleGenerate(false)}
                                disabled={isLoading || !input.trim()}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {isLoading ? (
                                    <Sparkles className="animate-spin" size={14} />
                                ) : (
                                    <Send size={14} />
                                )}
                                Generate Query
                            </button>
                        </div>
                    </div>
                </div>

                {/* Output Section */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <Sparkles size={12} className="text-amber-500" />
                            Standardized Query
                        </div>
                        {output && (
                            <button 
                                onClick={handleCopy}
                                className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors flex items-center gap-1"
                            >
                                {copied ? <Check size={12} /> : <Copy size={12} />}
                                {copied ? 'Copied' : 'Copy Query'}
                            </button>
                        )}
                    </div>
                    <div className="relative h-[400px] bg-slate-900 rounded-[2rem] p-8 overflow-hidden shadow-2xl border border-slate-800">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
                        
                        <AnimatePresence mode="wait">
                            {output ? (
                                <motion.div
                                    key="output"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="h-full overflow-auto custom-scrollbar"
                                >
                                    <p className="text-indigo-300 font-mono text-xs leading-relaxed whitespace-pre-wrap selection:bg-indigo-500/30">
                                        {output}
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="placeholder"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="h-full flex flex-col items-center justify-center text-center px-8"
                                >
                                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 border border-slate-700">
                                        <AlertCircle className="text-slate-600" size={32} />
                                    </div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-loose">
                                        Awaiting input data.<br />Standardized query will appear here.
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Feedback/Correction Area */}
                    <AnimatePresence>
                        {output && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-2 overflow-hidden"
                            >
                                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                                    <div className="flex items-center gap-2 text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">
                                        <MessageSquare size={10} />
                                        Feedback / Correction
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={feedback}
                                            onChange={(e) => setFeedback(e.target.value)}
                                            placeholder="e.g., 'Make the tone softer' or 'Change Fig 1 to Fig 2'..."
                                            className="flex-grow px-4 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                            onKeyDown={(e) => e.key === 'Enter' && handleGenerate(true)}
                                        />
                                        <button
                                            onClick={() => handleGenerate(true)}
                                            disabled={isLoading || !feedback.trim()}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                        >
                                            Refine
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Guidelines / Legend */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center border border-rose-100">
                            <AlertCircle className="text-rose-500" size={16} />
                        </div>
                        <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Direct Tone</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        Used for technical faults, unusable files, or missing metadata. Employs strict directives like "Kindly provide" or "Unusable due to...".
                    </p>
                </div>

                <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center border border-amber-100">
                            <Sparkles className="text-amber-500" size={16} />
                        </div>
                        <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Collaborative</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        Used for ambiguous author intent. Employs softer language like "Kindly assist the author" or "Please advise on the best way to proceed".
                    </p>
                </div>

                <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
                            <Info className="text-slate-400" size={16} />
                        </div>
                        <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Procedural</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        Used for formal reporting without directives. Simply reports the finding and requests verification from the JM.
                    </p>
                </div>
            </div>

            {isLoading && <LoadingOverlay message="Analyzing Production Notes..." color="indigo" />}
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default JmQueryGenerator;
