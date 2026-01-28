import React, { useState } from 'react';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

interface GrantPair {
    sponsor: string;
    numbers: string[];
    sponsorId?: string;
    numberIds?: string[];
}

const GrantTagger: React.FC = () => {
    const [statement, setStatement] = useState('');
    const [grantList, setGrantList] = useState('');
    const [output, setOutput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'warn' | 'error' | 'info' } | null>(null);

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
                // We split by double newline or the literal start of "Grant Sponsor" to isolate blocks
                const rawBlocks = grantList.split(/\n\s*\n|\n(?=Grant Sponsor:)/i).filter(l => l.trim());
                const groupedPairs: Map<string, Set<string>> = new Map();
                
                rawBlocks.forEach(block => {
                    const sponsorMatch = block.match(/Grant Sponsor:\s*(.*)/i);
                    const numberMatch = block.match(/Grant Number:\s*(.*)/i);
                    
                    if (sponsorMatch) {
                        const sponsor = sponsorMatch[1].trim();
                        if (!groupedPairs.has(sponsor)) {
                            groupedPairs.set(sponsor, new Set());
                        }
                        
                        if (numberMatch) {
                            // Support: ",", ";", and the word "and"
                            const numStr = numberMatch[1].trim();
                            const nums = numStr
                                .split(/[,;]|\band\b/i)
                                .map(n => n.trim())
                                .filter(Boolean);
                            
                            nums.forEach(n => groupedPairs.get(sponsor)!.add(n));
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
                // We sort by length descending to ensure "ABC Tech Foundation (Global)" 
                // is matched before "ABC Tech Foundation".
                const sortedSponsors = [...finalPairs].sort((a, b) => b.sponsor.length - a.sponsor.length);
                
                sortedSponsors.forEach(pair => {
                    let searchIdx = 0;
                    while ((searchIdx = result.indexOf(pair.sponsor, searchIdx)) !== -1) {
                        // Check for collision with already tagged segments
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

                // Step B: Match Numbers
                // Numbers link back to their parent sponsorId via 'refid'
                finalPairs.forEach(pair => {
                    pair.numbers.forEach((num, idx) => {
                        const numId = pair.numberIds![idx];
                        let searchIdx = 0;
                        while ((searchIdx = result.indexOf(num, searchIdx)) !== -1) {
                            // Verify Boundaries to avoid tagging partials (e.g. "123" inside "12345")
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
                setToast({ msg: `Successfully tagged ${finalPairs.length} sponsor groups.`, type: "success" });
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
        onClear: () => { setStatement(''); setGrantList(''); setOutput(''); }
    }, [statement, grantList]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-10 text-center animate-fade-in">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl mb-3 uppercase tracking-tighter">Grant XML Tagger</h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-light italic">
                    Precision parsing for multi-grant associations. Supports comma, semicolon, and "and" delimiters for grant numbers.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[750px]">
                <div className="flex flex-col gap-6 h-full overflow-hidden">
                    {/* Section 1: Statement */}
                    <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[8px]">1</span>
                                Funding Statement
                            </label>
                            <button onClick={() => setStatement('')} className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase transition-colors">Clear</button>
                        </div>
                        <textarea 
                            value={statement} 
                            onChange={e => setStatement(e.target.value)} 
                            className="flex-grow p-8 font-mono text-sm border-0 focus:ring-0 resize-none bg-transparent leading-relaxed" 
                            placeholder="Paste the raw funding paragraph from the manuscript..."
                            spellCheck={false}
                        />
                    </div>
                    
                    {/* Section 2: List */}
                    <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col group focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <label className="font-black text-slate-800 text-[10px] uppercase tracking-widest flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[8px]">2</span>
                                Grant Entity Matrix
                            </label>
                            <button onClick={() => setGrantList('')} className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase transition-colors">Clear</button>
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
                                className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-2"
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
                    className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black py-5 px-20 rounded-[2.5rem] shadow-2xl shadow-slate-900/10 transition-all active:scale-95 uppercase tracking-[0.3em] text-xs"
                >
                    Run Tagging Sequence
                </button>
            </div>

            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default GrantTagger;