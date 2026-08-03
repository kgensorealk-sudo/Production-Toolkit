import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
    Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, 
    List, ListOrdered, ListTodo, Quote, Code, SquareCode, Link, 
    AlertTriangle, Info, CheckCircle2, AlertCircle, Minus, Table, 
    Smile, Eye, Columns, Edit3, Sparkles, X, Check, Copy, FileText,
    Maximize2, Minimize2
} from 'lucide-react';

interface RichTextEditorProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    minHeight?: string;
}

const TEMPLATES = [
    {
        name: 'System Maintenance',
        icon: '🔧',
        content: `### 🛠️ Scheduled System Maintenance Notice\n\nPlease be advised that our servers will undergo routine maintenance to optimize database indexing and security controls.\n\n* **Scheduled Window:** 02:00 UTC - 04:00 UTC\n* **Expected Impact:** Minor API latency or brief disconnection\n* **Action Required:** None\n\n> 💡 **Tip:** All in-progress sessions will automatically resume once maintenance completes.`
    },
    {
        name: 'Feature Release',
        icon: '🚀',
        content: `### 🚀 Major Protocol Upgrade Deployed\n\nWe have deployed a significant update to the production engine! Key enhancements include:\n\n1. **Enhanced XML Formatting:** Improved list indentation and node hierarchy\n2. **Rich Text Broadcasts:** Full support for Markdown, tables, and callouts\n3. **Realtime State Syncing:** Instant session updates across nodes\n\nCheck out the documentation or test out the new features in your dashboard!`
    },
    {
        name: 'Security Alert',
        icon: '🚨',
        content: `### 🚨 Critical Security Update\n\nOur automated perimeter defenses detected updated authentication guidelines.\n\n* **Action Required:** Please review your API Access Keys\n* **Priority:** High\n\n> ⚠️ **Notice:** Deprecated access keys must be rotated before the end of the current billing cycle.`
    }
];

const EMOJIS = ['📢', '🚀', '⚠️', '🚨', '✅', 'ℹ️', '💡', '📌', '🔧', '🔒', '🎉', '⚡', '🛠️', '🌐', '📊'];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
    value,
    onChange,
    placeholder = 'Enter transmission broadcast payload...',
    minHeight = '320px'
}) => {
    const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('split');
    const [isExpandedModal, setIsExpandedModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkText, setLinkText] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [copied, setCopied] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Format selection in textarea
    const insertFormat = (prefix: string, suffix: string = '', defaultText: string = 'text') => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = value.substring(start, end);
        const textToInsert = selected || defaultText;

        const newValue = value.substring(0, start) + prefix + textToInsert + suffix + value.substring(end);
        onChange(newValue);

        setTimeout(() => {
            textarea.focus();
            const newCursorStart = start + prefix.length;
            const newCursorEnd = newCursorStart + textToInsert.length;
            textarea.setSelectionRange(newCursorStart, newCursorEnd);
        }, 0);
    };

    // Block line formatter (e.g. lists, headings)
    const insertBlockPrefix = (blockPrefix: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = value.substring(start, end);

        if (selected.includes('\n')) {
            const lines = selected.split('\n').map(line => `${blockPrefix}${line}`).join('\n');
            const newValue = value.substring(0, start) + lines + value.substring(end);
            onChange(newValue);
        } else {
            // Find start of line
            const lastLineBreak = value.lastIndexOf('\n', start - 1);
            const lineStart = lastLineBreak === -1 ? 0 : lastLineBreak + 1;
            const newValue = value.substring(0, lineStart) + blockPrefix + value.substring(lineStart);
            onChange(newValue);
        }

        setTimeout(() => textarea.focus(), 0);
    };

    const handleInsertLink = (e: React.FormEvent) => {
        e.preventDefault();
        if (!linkUrl) return;
        const label = linkText || linkUrl;
        insertFormat(`[${label}](`, `)`, '');
        setShowLinkModal(false);
        setLinkText('');
        setLinkUrl('');
    };

    const handleInsertEmoji = (emoji: string) => {
        insertFormat(emoji, '', '');
        setShowEmojiPicker(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            insertFormat('**', '**', 'bold text');
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            insertFormat('*', '*', 'italic text');
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const textarea = textareaRef.current;
            if (textarea) {
                const selected = value.substring(textarea.selectionStart, textarea.selectionEnd);
                setLinkText(selected);
            }
            setShowLinkModal(true);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
    const charCount = value.length;
    const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return (
        <div className="flex flex-col border-2 border-slate-200 rounded-[2rem] bg-white shadow-sm overflow-hidden transition-all focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
            {/* Top Toolbar Header */}
            <div className="bg-slate-50/90 border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
                {/* Formatting Tools */}
                <div className="flex flex-wrap items-center gap-1">
                    <button
                        type="button"
                        onClick={() => insertFormat('**', '**', 'bold')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Bold (Ctrl+B)"
                    >
                        <Bold size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertFormat('*', '*', 'italic')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Italic (Ctrl+I)"
                    >
                        <Italic size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertFormat('~~', '~~', 'strikethrough')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Strikethrough"
                    >
                        <Strikethrough size={15} />
                    </button>

                    <div className="h-4 w-[1px] bg-slate-200 mx-1" />

                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('# ')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Heading 1"
                    >
                        <Heading1 size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('## ')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Heading 2"
                    >
                        <Heading2 size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('### ')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Heading 3"
                    >
                        <Heading3 size={15} />
                    </button>

                    <div className="h-4 w-[1px] bg-slate-200 mx-1" />

                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('* ')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Bulleted List"
                    >
                        <List size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('1. ')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Numbered List"
                    >
                        <ListOrdered size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('- [ ] ')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Task List"
                    >
                        <ListTodo size={15} />
                    </button>

                    <div className="h-4 w-[1px] bg-slate-200 mx-1" />

                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('> ')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Blockquote"
                    >
                        <Quote size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertFormat('`', '`', 'code')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Inline Code"
                    >
                        <Code size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertFormat('```\n', '\n```', 'code block')}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Code Block"
                    >
                        <SquareCode size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const textarea = textareaRef.current;
                            if (textarea) {
                                setLinkText(value.substring(textarea.selectionStart, textarea.selectionEnd));
                            }
                            setShowLinkModal(true);
                        }}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Insert Link (Ctrl+K)"
                    >
                        <Link size={15} />
                    </button>

                    <div className="h-4 w-[1px] bg-slate-200 mx-1" />

                    {/* Alert Templates */}
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('> ℹ️ **Info:** ')}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100"
                        title="Insert Info Callout"
                    >
                        <Info size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('> ⚠️ **Warning:** ')}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-all border border-transparent hover:border-amber-100"
                        title="Insert Warning Callout"
                    >
                        <AlertTriangle size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('> 🚨 **Alert:** ')}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100"
                        title="Insert Critical Alert"
                    >
                        <AlertCircle size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => insertBlockPrefix('> ✅ **Success:** ')}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-100"
                        title="Insert Success Callout"
                    >
                        <CheckCircle2 size={15} />
                    </button>

                    <div className="h-4 w-[1px] bg-slate-200 mx-1" />

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className={`p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border ${showEmojiPicker ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-transparent hover:border-slate-200'}`}
                            title="Quick Emojis"
                        >
                            <Smile size={15} />
                        </button>

                        {showEmojiPicker && (
                            <div className="absolute top-full left-0 mt-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 grid grid-cols-5 gap-1.5 w-48 animate-in fade-in zoom-in-95">
                                {EMOJIS.map(e => (
                                    <button
                                        key={e}
                                        type="button"
                                        onClick={() => handleInsertEmoji(e)}
                                        className="p-2 hover:bg-slate-100 rounded-xl text-lg transition-transform active:scale-125 text-center"
                                    >
                                        {e}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowTemplates(!showTemplates)}
                            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all border flex items-center gap-1.5 ${showTemplates ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                        >
                            <FileText size={13} />
                            Templates
                        </button>

                        {showTemplates && (
                            <div className="absolute top-full left-0 mt-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 w-64 animate-in fade-in zoom-in-95">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest p-2 border-b border-slate-100">Quick Presets</p>
                                <div className="space-y-1 mt-1">
                                    {TEMPLATES.map(tmpl => (
                                        <button
                                            key={tmpl.name}
                                            type="button"
                                            onClick={() => {
                                                onChange(tmpl.content);
                                                setShowTemplates(false);
                                            }}
                                            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-indigo-50 hover:text-indigo-900 transition-colors flex items-center gap-2.5 text-xs font-bold text-slate-700"
                                        >
                                            <span className="text-base">{tmpl.icon}</span>
                                            <span>{tmpl.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mode Toggles & Helper Actions */}
                <div className="flex items-center gap-2 ml-auto">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        title="Copy Markdown"
                    >
                        {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                    </button>

                    <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setMode('edit')}
                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 ${mode === 'edit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            title="Edit Only"
                        >
                            <Edit3 size={12} />
                            Edit
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('split')}
                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 ${mode === 'split' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            title="Side-by-Side Split View"
                        >
                            <Columns size={12} />
                            Split
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('preview')}
                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 ${mode === 'preview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            title="Preview Only"
                        >
                            <Eye size={12} />
                            Preview
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsExpandedModal(!isExpandedModal)}
                        className={`p-2 rounded-xl transition-all border ${isExpandedModal ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                        title={isExpandedModal ? "Minimize Editor Workspace" : "Maximize Fullscreen Workspace"}
                    >
                        {isExpandedModal ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>
            </div>

            {/* Editor Workspace Area */}
            <div className={`relative min-h-[300px] flex flex-col md:flex-row flex-grow bg-slate-50/50 ${isExpandedModal ? 'h-[75vh]' : ''}`}>
                {/* Editor Input Column */}
                {(mode === 'edit' || mode === 'split') && (
                    <div className={`p-4 flex flex-col ${mode === 'split' ? 'w-full md:w-1/2 border-b md:border-b-0 md:border-r border-slate-200' : 'w-full'}`}>
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            style={{ minHeight: isExpandedModal ? '100%' : minHeight }}
                            className="w-full h-full min-h-[280px] bg-white border border-slate-200 rounded-2xl p-5 text-sm font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all resize-y leading-relaxed custom-scrollbar shadow-inner"
                        />
                    </div>
                )}

                {/* Rendered Rich Text Preview Column */}
                {(mode === 'preview' || mode === 'split') && (
                    <div className={`p-6 overflow-y-auto custom-scrollbar ${mode === 'split' ? 'w-full md:w-1/2 bg-white' : 'w-full bg-white'}`}>
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                <Sparkles size={12} className="text-indigo-500" />
                                Rich Visual Render
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">~{readTimeMinutes} min read</span>
                        </div>

                        {value.trim() ? (
                            <div className="prose prose-slate prose-sm max-w-none prose-headings:font-black prose-headings:tracking-tight prose-headings:uppercase prose-p:leading-relaxed prose-p:text-slate-700 prose-strong:font-black prose-strong:text-slate-900 prose-code:font-mono prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-blockquote:border-l-4 prose-blockquote:border-indigo-500 prose-blockquote:bg-indigo-50/50 prose-blockquote:p-4 prose-blockquote:rounded-r-2xl prose-blockquote:not-italic prose-blockquote:text-slate-800">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {value}
                                </ReactMarkdown>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-40">
                                <FileText size={32} className="text-slate-400 mb-2" />
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Awaiting Transmission Payload</p>
                                <p className="text-[11px] text-slate-400 mt-1">Type in the editor or select a template above</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Stats Bar */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-2.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <div className="flex items-center gap-6 font-mono">
                    <span>{charCount} Characters</span>
                    <span>{wordCount} Words</span>
                    <span>{value.split('\n').length} Lines</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Markdown Enabled</span>
                </div>
            </div>

            {/* Link Insertion Modal */}
            {showLinkModal && (
                <div className="fixed inset-0 z-[300] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <Link size={14} className="text-indigo-600" />
                                Insert Hyperlink
                            </h4>
                            <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleInsertLink} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Display Text</label>
                                <input
                                    type="text"
                                    placeholder="e.g. View Documentation"
                                    value={linkText}
                                    onChange={e => setLinkText(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Target URL *</label>
                                <input
                                    type="url"
                                    required
                                    placeholder="https://example.com"
                                    value={linkUrl}
                                    onChange={e => setLinkUrl(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowLinkModal(false)}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase rounded-xl shadow-lg shadow-indigo-200 transition-all"
                                >
                                    Insert Link
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RichTextEditor;
