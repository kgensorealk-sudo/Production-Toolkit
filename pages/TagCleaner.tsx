
import React, { useState } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface ReportItem {
    id: number;
    type: 'Insertion' | 'Deletion' | 'Comment';
    content: string;
    action: 'Kept' | 'Removed' | 'Restored';
}

const TagCleaner: React.FC = () => {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [reportData, setReportData] = useState<ReportItem[]>([]);
    const [activeTab, setActiveTab] = useState<'output' | 'report'>('output');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const processTags = (action: 'accept' | 'reject') => {
        if (!input.trim()) {
            setToast({ msg: "Please enter XML text to clean.", type: "warn" });
            return;
        }
        setIsLoading(true);
        setTimeout(() => {
            let current = input;
            const newReport: ReportItem[] = [];
            let idCounter = 1;

            const processPattern = (text: string, regex: RegExp, type: 'Insertion' | 'Deletion' | 'Comment', mode: 'accept' | 'reject') => {
                return text.replace(regex, (match, content) => {
                    let itemAction: 'Kept' | 'Removed' | 'Restored' = 'Kept';
                    let replacement = match;

                    if (type === 'Comment') {
                        itemAction = 'Removed';
                        replacement = '';
                    } else if (type === 'Insertion') {
                        if (mode === 'accept') { 
                            itemAction = 'Kept'; 
                            replacement = content; 
                        } else { 
                            itemAction = 'Removed'; 
                            replacement = ''; 
                        }
                    } else if (type === 'Deletion') {
                        if (mode === 'accept') { 
                            itemAction = 'Removed'; 
                            replacement = ''; 
                        } else { 
                            itemAction = 'Restored'; 
                            replacement = content; 
                        }
                    }

                    newReport.push({
                        id: idCounter++,
                        type,
                        content: content.trim(), 
                        action: itemAction
                    });
                    return replacement;
                });
            };

            // 1. Process Comments (Always remove)
            current = processPattern(current, /<opt_comment(?:\s+[^>]*)?>([\s\S]*?)<\/opt_comment>/gi, 'Comment', action);
            
            // 2. Process Insertions
            current = processPattern(current, /<opt_INS(?:\s+[^>]*)?>([\s\S]*?)<\/opt_INS>/gi, 'Insertion', action);

            // 3. Process Deletions
            current = processPattern(current, /<opt_DEL(?:\s+[^>]*)?>([\s\S]*?)<\/opt_DEL>/gi, 'Deletion', action);

            // 4. Final cleanup of any orphaned/malformed tags that weren't caught in pairs
            current = current.replace(/<\/?opt_(?:INS|DEL|comment)(?:\s+[^>]*)?>/gi, '');

            setOutput(current);
            setReportData(newReport);
            
            // If we have changes, show the report stats in toast, otherwise just success
            if (newReport.length > 0) {
                setToast({ 
                    msg: `Processed ${newReport.length} tags (${action === 'accept' ? 'Accepted' : 'Rejected'} All)`, 
                    type: "success" 
                });
                setActiveTab('report');
            } else {
                setToast({ msg: "No tags found to clean.", type: "warn" });
                setActiveTab('output');
            }
            
            setIsLoading(false);
        }, 600);
    };

    const copyOutput = () => {
        if (!output) return;
        navigator.clipboard.writeText(output).then(() => setToast({ msg: "Copied!", type: "success" }));
    };

    const downloadCSV = () => {
        if (reportData.length === 0) return;
        const headers = ['ID', 'Type', 'Action', 'Content Snippet'];
        const rows = reportData.map(item => [
            item.id,
            item.type,
            item.action,
            item.content.replace(/"/g, '""').substring(0, 200) // limit snippet length in CSV
        ]);
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'tag_cleaning_report.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const stats = {
        total: reportData.length,
        insertions: reportData.filter(i => i.type === 'Insertion').length,
        deletions: reportData.filter(i => i.type === 'Deletion').length,
        comments: reportData.filter(i => i.type === 'Comment').length
    };

    // Keyboard Shortcuts
    useKeyboardShortcuts({
        onPrimary: () => processTags('accept'),
        onSecondary: () => processTags('reject'),
        onCopy: () => {
            if (activeTab === 'output' && output) copyOutput();
        },
        onClear: () => {
            setInput('');
            setToast({msg: 'Input cleared', type:'warn'});
        }
    }, [input, output, activeTab]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mb-3">XML Tag Cleaner</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto">Manage editorial markup by accepting or rejecting changes in bulk.</p>
            </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[600px]">
                {/* Input Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-teal-100 transition-all duration-300">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                             <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono shadow-sm">1</span>
                            Input XML
                        </label>
                        <button onClick={() => setInput('')} title="Alt+Delete" className="text-xs font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors">Clear</button>
                    </div>
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-white resize-none leading-relaxed placeholder-slate-300" 
                        placeholder="Paste XML with <opt_DEL>, <opt_INS> or <opt_comment> tags..."
                        spellCheck={false}
                    />
                </div>
                
                {/* Output/Report Column */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-50 px-5 py-2 border-b border-slate-100 flex justify-between items-center">
                        <label className="font-bold text-slate-700 text-sm flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-xs text-teal-600 font-mono shadow-sm">2</span>
                            Results
                        </label>
                        {activeTab === 'output' && (
                            <button onClick={copyOutput} title="Ctrl+Shift+C" className="text-xs font-bold text-teal-600 hover:bg-teal-50 px-3 py-1.5 rounded border border-transparent hover:border-teal-100 transition-colors">Copy Result</button>
                        )}
                        {activeTab === 'report' && reportData.length > 0 && (
                            <button onClick={downloadCSV} className="text-xs font-bold text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded border border-slate-200 transition-colors flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Export CSV
                            </button>
                        )}
                    </div>
                    
                    {/* Tabs */}
                    <div className="bg-white px-2 pt-2 border-b border-slate-100 flex space-x-1">
                         <button 
                            onClick={() => setActiveTab('output')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'output' 
                                ? 'bg-slate-50 text-teal-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Cleaned XML
                         </button>
                         <button 
                            onClick={() => setActiveTab('report')} 
                            className={`flex-1 py-2 text-xs font-bold rounded-t-lg transition-all duration-200 border-t border-x ${activeTab === 'report' 
                                ? 'bg-slate-50 text-teal-600 border-slate-200 translate-y-[1px]' 
                                : 'bg-white text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-700'}`}
                         >
                            Change Report {reportData.length > 0 && <span className="ml-1 bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px]">{reportData.length}</span>}
                         </button>
                    </div>

                    <div className="flex-grow relative bg-slate-50 overflow-hidden">
                         {isLoading && <LoadingOverlay message="Cleaning Tags..." color="teal" />}
                         
                         {activeTab === 'output' && (
                             <textarea 
                                value={output}
                                readOnly
                                className="w-full h-full p-6 text-sm font-mono text-slate-800 border-0 focus:ring-0 outline-none bg-transparent resize-none leading-relaxed" 
                                placeholder="Processed text will appear here..."
                            />
                         )}

                         {activeTab === 'report' && (
                             <div className="h-full flex flex-col bg-white">
                                 {/* Stats Bar */}
                                 <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex gap-4 text-xs font-medium text-slate-600">
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Total: <b>{stats.total}</b></div>
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Insertions: <b>{stats.insertions}</b></div>
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400"></span> Deletions: <b>{stats.deletions}</b></div>
                                     <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span> Comments: <b>{stats.comments}</b></div>
                                 </div>
                                 
                                 {/* Table */}
                                 <div className="flex-grow overflow-auto custom-scrollbar">
                                    {reportData.length > 0 ? (
                                        <table className="min-w-full divide-y divide-slate-200">
                                            <thead className="bg-slate-50 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-16">ID</th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-24">Type</th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-24">Action</th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Content Preview</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-slate-200">
                                                {reportData.map((item) => (
                                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-4 py-2 text-xs font-mono text-slate-400">{item.id}</td>
                                                        <td className="px-4 py-2">
                                                            <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${
                                                                item.type === 'Insertion' ? 'bg-emerald-100 text-emerald-800' : 
                                                                item.type === 'Deletion' ? 'bg-rose-100 text-rose-800' : 
                                                                'bg-amber-100 text-amber-800'
                                                            }`}>
                                                                {item.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-xs font-medium text-slate-600">
                                                            <span className={`px-2 py-0.5 rounded border ${
                                                                item.action === 'Kept' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                                item.action === 'Restored' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                                'bg-slate-50 text-slate-500 border-slate-200'
                                                            }`}>
                                                                {item.action}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-xs font-mono text-slate-700 truncate max-w-[200px]" title={item.content}>
                                                            {item.content || <span className="text-slate-300 italic">Empty</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                            <p className="text-sm">No changes recorded yet.</p>
                                        </div>
                                    )}
                                 </div>
                             </div>
                         )}
                    </div>
                </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-6">
                <button 
                    onClick={() => processTags('accept')} 
                    disabled={isLoading}
                    title="Ctrl+Enter"
                    className="group flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-emerald-500/30 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-1 w-full sm:w-auto min-w-[200px]"
                >
                    <div className="p-1 bg-emerald-500 rounded group-hover:bg-emerald-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div className="flex flex-col items-start text-left">
                        <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Workflow</span>
                        <span className="leading-none text-lg">Accept All</span>
                    </div>
                </button>

                <button 
                    onClick={() => processTags('reject')} 
                    disabled={isLoading}
                    title="Ctrl+Shift+Enter"
                    className="group flex items-center justify-center gap-3 bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-rose-500/30 transform transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-1 w-full sm:w-auto min-w-[200px]"
                >
                    <div className="p-1 bg-rose-500 rounded group-hover:bg-rose-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <div className="flex flex-col items-start text-left">
                         <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Workflow</span>
                        <span className="leading-none text-lg">Reject All</span>
                    </div>
                </button>
            </div>
            
            <div className="mt-6 text-center">
                 <p className="text-xs text-slate-400">
                    <span className="font-semibold">Accept All:</span> Keeps insertions, removes deletions. <span className="mx-2">•</span> 
                    <span className="font-semibold">Reject All:</span> Removes insertions, restores deletions.
                </p>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default TagCleaner;
