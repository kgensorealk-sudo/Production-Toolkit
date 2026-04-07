import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Download, X, Loader2 } from 'lucide-react';

const HtmlViewer: React.FC = () => {
    const [searchParams] = useSearchParams();
    const url = searchParams.get('url');
    const fileName = searchParams.get('name') || 'document.html';
    
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!url) {
            setError('No URL provided');
            setLoading(false);
            return;
        }

        const fetchContent = async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Failed to fetch the HTML file. It might be restricted by CORS or the link might be invalid.');
                const text = await response.text();
                setContent(text);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchContent();
    }, [url]);

    const handleDownload = () => {
        if (!content) return;
        const blob = new Blob([content], { type: 'text/html' });
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Fetching Document Content...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-600 mb-6 border border-red-100">
                    <X size={40} />
                </div>
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Failed to Load Document</h1>
                <p className="text-slate-500 text-sm font-medium max-w-md mb-8">{error}</p>
                <button 
                    onClick={() => window.close()}
                    className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-xl"
                >
                    Close Window
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex flex-col bg-white">
            {/* Header */}
            <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <FileText size={20} />
                    </div>
                    <div className="flex flex-col">
                        <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 truncate max-w-[300px]">{fileName}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document Viewer</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                        <Download size={14} />
                        Download
                    </button>
                    <button 
                        onClick={() => window.close()}
                        className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"
                        title="Close Viewer"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-grow bg-slate-100 p-4 md:p-8 overflow-hidden">
                <div className="w-full h-full max-w-6xl mx-auto bg-white rounded-2xl shadow-2xl shadow-slate-200 overflow-hidden border border-slate-200">
                    <iframe
                        srcDoc={content || ''}
                        title={fileName}
                        className="w-full h-full border-none"
                        sandbox="allow-scripts allow-same-origin"
                    />
                </div>
            </div>
        </div>
    );
};

export default HtmlViewer;
