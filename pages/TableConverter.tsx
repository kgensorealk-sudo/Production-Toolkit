import React, { useState } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import { convertTable, detectFormat, TableFormat } from '../utils/tableLogic';

const TableConverter: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [inputFormat, setInputFormat] = useState<'auto' | TableFormat>('auto');
    const [outputFormat, setOutputFormat] = useState<TableFormat>('html');
    const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    const handleConvert = () => {
        if (!input.trim()) {
            setToast({ msg: "Please enter table data to convert.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                const result = convertTable(input, inputFormat, outputFormat);
                setOutput(result);
                setToast({ msg: "Conversion successful!", type: "success" });
                
                // Switch to preview if HTML output
                if (outputFormat === 'html') {
                    setActiveTab('preview');
                } else {
                    setActiveTab('code');
                }
            } catch (e: any) {
                setToast({ msg: e.message || "Conversion failed", type: "error" });
            } finally {
                setIsLoading(false);
            }
        }, 500);
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Copied!", type: "success" }));
    };

    const detectedLabel = input && inputFormat === 'auto' ? `(Detected: ${detectFormat(input).toUpperCase()})` : '';

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">Table Converter</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Convert tables between HTML, Markdown, CSV, JSON, and XML formats.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
                {/* Input Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-cyan-100 transition-all duration-300">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">IN</span>
                                Input
                            </label>
                            <select 
                                value={inputFormat} 
                                onChange={(e) => setInputFormat(e.target.value as any)}
                                className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:border-cyan-500"
                            >
                                <option value="auto">Auto-detect</option>
                                <option value="csv">CSV</option>
                                <option value="markdown">Markdown</option>
                                <option value="html">HTML</option>
                                <option value="json">JSON</option>
                            </select>
                            <span className="text-[10px] text-slate-400 font-mono">{detectedLabel}</span>
                        </div>
                        <button onClick={() => setInput('')} className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                    </div>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" 
                        placeholder="Paste your table data here (CSV, Markdown, HTML, JSON)..."
                        spellCheck={false}
                    />
                </div>
                
                {/* Output Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                         <div className="flex items-center gap-3">
                            <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-cyan-600 font-mono shadow-sm">OUT</span>
                                Result
                            </label>
                            <select 
                                value={outputFormat} 
                                onChange={(e) => setOutputFormat(e.target.value as any)}
                                className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:border-cyan-500"
                            >
                                <option value="html">HTML</option>
                                <option value="markdown">Markdown</option>
                                <option value="csv">CSV</option>
                                <option value="json">JSON</option>
                                <option value="xml">XML</option>
                            </select>
                        </div>
                        {output && (
                            <button onClick={copyOutput} className="text-xs font-bold text-cyan-600 hover:bg-cyan-50 px-3 py-1.5 rounded border border-transparent hover:border-cyan-100 transition-colors">Copy</button>
                        )}
                    </div>
                    
                    {/* Tabs */}
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                         <button 
                            onClick={() => setActiveTab('code')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'code' 
                                ? 'bg-slate-50 text-cyan-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Raw Code
                         </button>
                         <button 
                            onClick={() => setActiveTab('preview')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'preview' 
                                ? 'bg-slate-50 text-cyan-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Preview Render
                         </button>
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden">
                        {isLoading && <LoadingOverlay message="Converting Table..." color="blue" />}
                        
                        {activeTab === 'code' && (
                             <textarea 
                                value={output}
                                readOnly
                                className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed" 
                                placeholder="Converted code will appear here..."
                            />
                        )}

                        {activeTab === 'preview' && (
                            <div className="w-full h-full overflow-auto p-6 bg-white custom-scrollbar">
                                {output ? (
                                    <div className="prose prose-sm max-w-none">
                                        {/* 
                                            We render HTML directly if format is HTML. 
                                            For other formats, we convert to HTML temporarily for preview 
                                        */}
                                        <div dangerouslySetInnerHTML={{ 
                                            __html: outputFormat === 'html' ? output : (
                                                output ? convertTable(output, outputFormat, 'html') : ''
                                            )
                                        }} />
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 opacity-60 text-sm">
                                        No table to preview
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center">
                <button 
                    onClick={handleConvert} 
                    disabled={isLoading}
                    className={`bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3.5 px-10 rounded-xl shadow-lg shadow-cyan-500/30 transform transition-all active:scale-95 ${isLoading ? 'opacity-80 cursor-wait' : 'hover:-translate-y-0.5'}`}
                >
                    Convert Table
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default TableConverter;
