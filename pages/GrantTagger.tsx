import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, Zap, RotateCcw, AlertCircle } from 'lucide-react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { KeeperAvatar, KeeperState } from '../components/KeeperAvatar';
import { extractGrantsOffline, sanitizeGrantExtractionResult, ExtractedGrantPair } from '../utils/grantExtractor';

interface GrantPair {
    sponsor: string;
    numbers: string[];
    sponsorId?: string;
    numberIds?: string[];
}

const GrantTagger: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [statement, setStatement] = useState('');
    const [grantList, setGrantList] = useState('');
    const [output, setOutput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

    // Keeper State Management
    const [keeperState, setKeeperState] = useState<KeeperState>('idle');
    const [keeperMessage, setKeeperMessage] = useState(
        'Paste or type a funding statement into Box 1. I will automatically analyze it and populate the Grant Sponsor and Grant Number into the matrix for you!'
    );
    const [isKeeperAnalyzing, setIsKeeperAnalyzing] = useState(false);
    const [lastAnalyzedText, setLastAnalyzedText] = useState('');
    const [detectedSponsors, setDetectedSponsors] = useState<string[]>([]);
    const [modelBadge, setModelBadge] = useState<string>('');
    const [matrixHighlight, setMatrixHighlight] = useState(false);
    const [autoAnalyzeEnabled, setAutoAnalyzeEnabled] = useState(true);

    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (location.state?.transferredXml) {
            const xml = location.state.transferredXml;
            setStatement(xml);
            setToast({ 
                msg: `Data successfully imported from ${location.state.sourceTool || 'previous tool'}.`, 
                type: 'success' 
            });
            navigate(location.pathname, { replace: true, state: {} });
            
            // Auto-trigger Keeper on imported statement
            if (xml.trim().length >= 15) {
                runKeeperAnalysis(xml.trim(), true);
            }
        }
    }, [location, navigate]);

    /**
     * Executes the grant analysis using Keeper
     */
    const runKeeperAnalysis = async (inputText: string, forced = false) => {
        const trimmed = (inputText || '').trim();
        if (!trimmed) {
            setKeeperState('idle');
            setKeeperMessage('Paste or type a funding statement into Box 1. I will automatically analyze it and populate the Grant Sponsor and Grant Number into the matrix for you!');
            setDetectedSponsors([]);
            return;
        }

        if (!forced && trimmed === lastAnalyzedText) {
            return;
        }

        setIsKeeperAnalyzing(true);
        setKeeperState('thinking');
        setKeeperMessage('*sniff sniff* 🐾 Keeper spotted a funding statement! Analyzing explicit funding bodies and grant numbers...');

        try {
            let applied = false;

            // Attempt backend server API call first
            try {
                const res = await fetch('/api/ai/grant-extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ statement: trimmed }),
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.result && data.result.trim()) {
                        setGrantList(data.result);
                        setLastAnalyzedText(trimmed);
                        const sponsors = data.pairs?.map((p: ExtractedGrantPair) => p.sponsor) || [];
                        setDetectedSponsors(sponsors);
                        setModelBadge(data.modelUsed || 'Gemini Flash');
                        setKeeperState('success');
                        setKeeperMessage(
                            `🐾 Woof! Keeper identified ${sponsors.length} grant sponsor(s) and automatically filled the Grant Entity Matrix below!`
                        );
                        setMatrixHighlight(true);
                        setTimeout(() => setMatrixHighlight(false), 2500);
                        setToast({
                            msg: `🐾 Keeper extracted ${sponsors.length} grant sponsor(s) into matrix!`,
                            type: 'success'
                        });
                        applied = true;
                    }
                }
            } catch (fetchErr) {
                console.warn('[GrantTagger] Server endpoint failed, falling back to Keeper offline rule engine:', fetchErr);
            }

            // Fallback to client-side rule extractor if server call is unreachable or unconfigured
            if (!applied) {
                const offline = extractGrantsOffline(trimmed);
                if (offline.formattedText) {
                    setGrantList(offline.formattedText);
                    setLastAnalyzedText(trimmed);
                    const sponsors = offline.pairs.map(p => p.sponsor);
                    setDetectedSponsors(sponsors);
                    setModelBadge('Offline Keeper Engine');
                    setKeeperState('success');
                    setKeeperMessage(
                        `🐾 Woof! Keeper identified ${sponsors.length} grant sponsor(s) and populated the Grant Entity Matrix!`
                    );
                    setMatrixHighlight(true);
                    setTimeout(() => setMatrixHighlight(false), 2500);
                    setToast({
                        msg: `🐾 Keeper extracted ${sponsors.length} grant sponsor(s) into matrix!`,
                        type: 'success'
                    });
                } else {
                    setKeeperState('idle');
                    setKeeperMessage(
                        "🐾 Keeper sniffed through the text, but couldn't detect any explicit grant sponsors or numbers. You can refine the text or enter them manually."
                    );
                }
            }
        } catch (err: any) {
            console.error('[GrantTagger] Keeper analysis error:', err);
            setKeeperState('idle');
            setKeeperMessage("🐾 Keeper encountered a hiccup. You can click 'Analyze with Keeper' to try again.");
        } finally {
            setIsKeeperAnalyzing(false);
        }
    };

    // Auto-analyze debounced effect when user types into the statement box
    useEffect(() => {
        if (!autoAnalyzeEnabled) return;
        const trimmed = statement.trim();

        if (trimmed.length < 15) {
            if (!trimmed) {
                setKeeperState('idle');
                setKeeperMessage('Paste or type a funding statement into Box 1. I will automatically analyze it and populate the Grant Sponsor and Grant Number into the matrix for you!');
                setDetectedSponsors([]);
                setModelBadge('');
            }
            return;
        }

        if (trimmed === lastAnalyzedText) return;

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            runKeeperAnalysis(trimmed, false);
        }, 1100);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [statement, autoAnalyzeEnabled, lastAnalyzedText]);

    // Handle immediate analysis on paste
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pastedText = e.clipboardData.getData('text');
        if (pastedText && pastedText.trim().length >= 15) {
            setTimeout(() => {
                runKeeperAnalysis(pastedText.trim(), true);
            }, 100);
        }
    };

    const escapeXml = (unsafe: string) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const highlightXml = (xml: string) => {
        if (!xml) return '';
        let html = xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Style Tags
        html = html.replace(/(&lt;\/?)([\w:-]+)(.*?)(&gt;)/g, (m, prefix, tag, attrs, suffix) => {
            const coloredAttrs = attrs.replace(/(\s+)([\w:-]+)(=)(&quot;.*?&quot;)/g,
                '$1<span class="text-purple-600 italic">$2</span><span class="text-slate-400">$3</span><span class="text-blue-600 font-bold">$4</span>'
            );
            return `<span class="text-indigo-600 font-bold">${prefix}${tag}</span>${coloredAttrs}<span class="text-indigo-600 font-bold">${suffix}</span>`;
        });

        // Highlight the Actual Text Content within tags
        html = html.replace(/(&gt;)([^<]+)(&lt;)/g, '$1<span class="text-slate-900 font-medium">$2</span>$3');
        
        return html;
    };

    const processTags = () => {
        if (!statement.trim() || !grantList.trim()) {
            setToast({ msg: "Both Funding Statement and Grant Matrix are required.", type: "warn" });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            try {
                // 1. ADVANCED PARSING PHASE
                const rawBlocks = grantList.split(/\n\s*\n|\n(?=Grant Sponsor:)/i).filter(l => l.trim());
                const groupedPairs: Map<string, Set<string>> = new Map();
                
                rawBlocks.forEach(block => {
                    const sponsorMatch = block.match(/Grant Sponsor:\s*(.*)/i);
                    const numberMatch = block.match(/Grant Number:\s*(.*)/i);
                    
                    if (sponsorMatch) {
                        const sponsor = sponsorMatch[1].trim().replace(/[.;]+$/, '');
                        if (sponsor && !groupedPairs.has(sponsor)) {
                            groupedPairs.set(sponsor, new Set());
                        }
                        
                        if (numberMatch && sponsor) {
                            const numStr = numberMatch[1].trim();
                            // If explicit "No grant number provided" rule output, do NOT treat it as a literal number
                            if (!/no grant number provided|none|not provided|n\/a|not stated/i.test(numStr)) {
                                const nums = numStr
                                    .split(/[,;]|\band\b/i)
                                    .map(n => n.trim().replace(/^[:#\s-]+/, '').replace(/[.;]+$/, ''))
                                    .filter(Boolean);
                                
                                nums.forEach(n => groupedPairs.get(sponsor)!.add(n));
                            }
                        }
                    }
                });

                if (groupedPairs.size === 0) {
                    setToast({ msg: "No valid sponsor-grant pairs detected in matrix.", type: "warn" });
                    setIsLoading(false);
                    return;
                }

                // 2. ID GENERATION PHASE (Hierarchical)
                const finalPairs: GrantPair[] = [];
                let gtsCounter = 5;
                let gtnCounter = 5;

                groupedPairs.forEach((numberSet, sponsor) => {
                    const gtsId = `gts${gtsCounter.toString().padStart(4, '0')}`;
                    gtsCounter += 5;
                    
                    const numbers = Array.from(numberSet);
                    const numberIds = numbers.map(() => {
                        const gtnId = `gtn${gtnCounter.toString().padStart(4, '0')}`;
                        gtnCounter += 5;
                        return gtnId;
                    });

                    finalPairs.push({
                        sponsor,
                        numbers,
                        sponsorId: gtsId,
                        numberIds
                    });
                });

                // 3. TAGGING ENGINE (Surgical Replacements)
                let result = statement;
                const replacements: { start: number, end: number, text: string }[] = [];

                // Step A: Match Sponsors
                const sortedSponsors = [...finalPairs].sort((a, b) => b.sponsor.length - a.sponsor.length);
                
                sortedSponsors.forEach(pair => {
                    let searchIdx = 0;
                    while ((searchIdx = result.indexOf(pair.sponsor, searchIdx)) !== -1) {
                        const isCollision = replacements.some(r => 
                            (searchIdx >= r.start && searchIdx < r.end) || 
                            (searchIdx + pair.sponsor.length > r.start && searchIdx + pair.sponsor.length <= r.end)
                        );
                        
                        if (!isCollision) {
                            replacements.push({
                                start: searchIdx,
                                end: searchIdx + pair.sponsor.length,
                                text: `<ce:grant-sponsor id="${pair.sponsorId}">${escapeXml(pair.sponsor)}</ce:grant-sponsor>`
                            });
                        }
                        searchIdx += pair.sponsor.length;
                    }
                });

                // Step B: Match Numbers (only if actual numbers exist)
                finalPairs.forEach(pair => {
                    pair.numbers.forEach((num, idx) => {
                        const numId = pair.numberIds![idx];
                        let searchIdx = 0;
                        while ((searchIdx = result.indexOf(num, searchIdx)) !== -1) {
                            const charBefore = result[searchIdx - 1] || '';
                            const charAfter = result[searchIdx + num.length] || '';
                            
                            const isBoundaryBefore = !charBefore || /[\s\(\[,\.;:]/.test(charBefore);
                            const isBoundaryAfter = !charAfter || /[\s\)\]\.,;:!]/.test(charAfter);

                            const isCollision = replacements.some(r => 
                                (searchIdx >= r.start && searchIdx < r.end) || 
                                (searchIdx + num.length > r.start && searchIdx + num.length <= r.end)
                            );
                            
                            if (!isCollision && isBoundaryBefore && isBoundaryAfter) {
                                replacements.push({
                                    start: searchIdx,
                                    end: searchIdx + num.length,
                                    text: `<ce:grant-number id="${numId}" refid="${pair.sponsorId}">${escapeXml(num)}</ce:grant-number>`
                                });
                            }
                            searchIdx += num.length;
                        }
                    });
                });

                // Step C: Apply Replacements (Reverse Order to maintain index integrity)
                replacements.sort((a, b) => b.start - a.start);
                replacements.forEach(r => {
                    result = result.substring(0, r.start) + r.text + result.substring(r.end);
                });

                setOutput(result);
                setToast({ msg: `Successfully tagged ${finalPairs.length} sponsor group(s).`, type: "success" });
                setIsLoading(false);
            } catch (err) {
                console.error(err);
                setToast({ msg: "Tagging engine failure. Check input formats.", type: "error" });
                setIsLoading(false);
            }
        }, 600);
    };

    useKeyboardShortcuts({
        onPrimary: processTags,
        onClear: () => { 
            setStatement(''); 
            setGrantList(''); 
            setOutput('');
            setDetectedSponsors([]);
            setKeeperState('idle');
            setKeeperMessage('Paste or type a funding statement into Box 1. I will automatically analyze it and populate your Grant Entity Matrix!');
        }
    }, [statement, grantList]);

    return (
        <div className="max-w-full mx-auto px-2 py-8 sm:px-4 lg:px-6">
            {/* Header */}
            <div className="mb-6 text-center animate-fade-in">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">
                    Grant XML Tagger
                </h1>
                <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto font-light leading-relaxed">
                    Precision parsing for multi-grant associations. Powered by <strong className="text-emerald-700 font-semibold">Keeper</strong> to automatically extract sponsors and grant numbers from manuscript funding statements.
                </p>
            </div>

            {/* Keeper Editorial Assistant Panel */}
            <div className="mb-6 bg-gradient-to-r from-emerald-50/90 via-slate-50 to-emerald-50/50 rounded-3xl border border-emerald-200/70 p-5 shadow-xs transition-all">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-4">
                        <div 
                            className="relative shrink-0 cursor-pointer pt-0.5 sm:pt-0" 
                            onClick={() => setKeeperState(prev => prev === 'petting' ? 'idle' : 'petting')} 
                            title="Click to pet Keeper! 🐾"
                        >
                            <KeeperAvatar size="md" state={keeperState} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-slate-900 text-sm uppercase tracking-tight flex items-center gap-1.5">
                                    🐾 Keeper Editorial Assistant
                                </span>
                                {modelBadge && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        {modelBadge}
                                    </span>
                                )}
                                {isKeeperAnalyzing && (
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                        Analyzing statement...
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 max-w-2xl font-medium leading-relaxed">
                                {keeperMessage}
                            </p>

                            {/* Detected Sponsors Chips */}
                            {detectedSponsors.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">Sponsors:</span>
                                    {detectedSponsors.map((s, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold shadow-xs">
                                            <Check className="w-2.5 h-2.5" />
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                        <button
                            onClick={() => runKeeperAnalysis(statement, true)}
                            disabled={isKeeperAnalyzing || !statement.trim()}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                            title="Trigger Keeper to analyze funding statement"
                        >
                            {isKeeperAnalyzing ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Analyzing...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>{grantList.trim() ? 'Re-analyze with Keeper' : 'Analyze with Keeper'}</span>
                                </>
                            )}
                        </button>
                        {grantList.trim() && (
                            <button
                                onClick={processTags}
                                disabled={isLoading || !statement.trim()}
                                className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                                title="Run XML tagging sequence"
                            >
                                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Tag XML</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Input & Output Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[740px]">
                <div className="flex flex-col gap-6 h-full overflow-hidden">
                    {/* Section 1: Funding Statement */}
                    <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-200 transition-all">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[8px]">1</span>
                                Funding Statement
                            </label>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => runKeeperAnalysis(statement, true)}
                                    disabled={isKeeperAnalyzing || !statement.trim()}
                                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition-colors uppercase disabled:opacity-40 cursor-pointer"
                                    title="Ask Keeper to analyze this statement"
                                >
                                    <Sparkles className="w-3 h-3 text-emerald-600" />
                                    Sniff with Keeper
                                </button>
                                <button 
                                    onClick={() => { 
                                        setStatement(''); 
                                        setGrantList(''); 
                                        setDetectedSponsors([]); 
                                        setKeeperState('idle'); 
                                        setKeeperMessage('Paste or type a funding statement into Box 1. I will automatically analyze it and populate your Grant Entity Matrix!'); 
                                    }} 
                                    className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase transition-colors cursor-pointer"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                        <textarea 
                            value={statement} 
                            onChange={e => setStatement(e.target.value)} 
                            onPaste={handlePaste}
                            className="flex-grow p-8 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                            placeholder="Paste the raw funding paragraph from the manuscript (Keeper will automatically analyze it)..."
                            spellCheck={false}
                        />
                    </div>
                    
                    {/* Section 2: Grant Entity Matrix */}
                    <div className={`flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-200 transition-all ${matrixHighlight ? 'ring-2 ring-emerald-400 bg-emerald-50/20' : ''}`}>
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[8px]">2</span>
                                Grant Entity Matrix
                                {detectedSponsors.length > 0 && (
                                    <span className="ml-2 text-[9px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200">
                                        🐾 Populated by Keeper ({detectedSponsors.length})
                                    </span>
                                )}
                            </label>
                            <button 
                                onClick={() => { setGrantList(''); setDetectedSponsors([]); }} 
                                className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase transition-colors cursor-pointer"
                            >
                                Clear
                            </button>
                        </div>
                        <textarea 
                            value={grantList} 
                            onChange={e => setGrantList(e.target.value)} 
                            className="flex-grow p-8 font-mono text-[11px] border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                            placeholder={"Grant Sponsor: Sponsor Name\nGrant Number: 12345, 67890 and ABC-123\n\nGrant Sponsor: Second Sponsor..."}
                            spellCheck={false}
                        />
                    </div>
                </div>

                {/* Results Section */}
                <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col relative">
                    <div className="bg-slate-100 px-10 py-5 border-b border-slate-200 flex justify-between items-center shadow-sm">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Tagged XML Stream</h3>
                        {output && (
                            <button 
                                onClick={() => { navigator.clipboard.writeText(output); setToast({msg:'Copied!', type:'success'}); }} 
                                className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy Stream
                            </button>
                        )}
                    </div>
                    <div className="flex-grow relative bg-slate-50/20 overflow-hidden flex flex-col">
                        {isLoading && <LoadingOverlay message="Synchronizing Entities..." color="emerald" />}
                        <div className="flex-grow p-10 overflow-auto custom-scrollbar">
                            {!output ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-60 grayscale">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-sm font-black uppercase tracking-widest">System Ready for Protocol</p>
                                </div>
                            ) : (
                                <div 
                                    className="font-mono text-xs leading-[1.8] whitespace-pre-wrap break-all bg-white p-12 rounded-[2.5rem] border border-slate-200 shadow-inner"
                                    dangerouslySetInnerHTML={{ __html: highlightXml(output) }}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-10 text-center">
                <button 
                    onClick={processTags} 
                    disabled={isLoading}
                    className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black py-5 px-20 rounded-[2.5rem] shadow-2xl shadow-slate-900/10 transition-all active:scale-95 uppercase tracking-[0.3em] text-xs cursor-pointer disabled:cursor-not-allowed"
                >
                    Run Tagging Sequence
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default GrantTagger;
