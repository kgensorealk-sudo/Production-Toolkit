import React, { useState } from 'react';
import { 
    FileCode, 
    CheckCircle2, 
    Activity, 
    Layers, 
    Link2, 
    BookOpen, 
    Sparkles, 
    ShieldCheck, 
    Search,
    ChevronDown,
    ChevronUp,
    X,
    Copy,
    Check,
    Filter,
    ListChecks,
    Info,
    CheckCheck,
    Tag,
    AlertCircle
} from 'lucide-react';

export interface AuditScanStage {
    id: string;
    zoneNumber: number;
    label: string;
    shortName: string;
    category: string;
    tagPattern: string;
    description: string;
    severity: 'Critical' | 'High' | 'Major';
    standardRef: string;
    tagChips: string[];
    rules: string[];
    practicalTip: string;
    icon: React.ComponentType<{ className?: string }>;
}

export const AUDIT_STAGES: AuditScanStage[] = [
    {
        id: 'dtd_header',
        zoneNumber: 1,
        label: 'DTD & Header Metadata',
        shortName: 'Header & DTD',
        category: 'Metadata Architecture',
        tagPattern: '<item-info>, <ce:doi>, <ce:pii>',
        description: 'Verifying DTD version, entity encoding, PII identifiers, DOCTYPE declarations, and item metadata...',
        severity: 'Critical',
        standardRef: 'DTD v5.6 §2.1 & JATS 1.3',
        tagChips: ['<!DOCTYPE article>', '<item-info>', '<ce:pii>', '<ce:doi>', '&amp;', 'native UTF-8'],
        rules: [
            'Validate strict DOCTYPE declaration against Journal DTD v5.6 specifications',
            'Named entities and numerical Unicode entities are not allowed: enforce native UTF-8 (reject &eacute;, &alpha;, &#x00E9;, &#233;)',
            'Verify PII structure S0000-0000(00)00000-0 with valid check digit',
            'Check DOI syntax format 10.xxxx/... and mandatory URL resolver prefix',
            'Verify article classification attribute docsubtype (e.g. fla, sco, rev, abs)'
        ],
        practicalTip: 'Named entities (e.g. &alpha;) and numerical Unicode entities (e.g. &#x00A0;) cause parser rejection. File must be pure UTF-8 with standard XML entity set (&amp;, &lt;, &gt;, &quot;, &apos;).',
        icon: FileCode
    },
    {
        id: 'floats_labels',
        zoneNumber: 2,
        label: 'Float Nodes & Label Typography',
        shortName: 'Floats & Labels',
        category: 'Floats & Captions',
        tagPattern: '<ce:floats>, <ce:figure>, <ce:table>',
        description: 'Checking figure/table definitions, sequential numbering, and sniffing plural label typos...',
        severity: 'High',
        standardRef: 'DTD v5.6 §4.2',
        tagChips: ['<ce:floats>', '<ce:figure>', '<ce:table>', '<ce:label>', '<ce:caption>'],
        rules: [
            'Group all figures and tables cleanly inside <ce:floats> or isolate from body flow',
            'Plural typo detection: sniff and singularize faulty labels (e.g. "Tables 4" → "Table 4")',
            'Enforce sequential Arabic numbering without gaps or duplicate labels',
            'Ensure caption anatomy: <ce:label> followed immediately by structured <ce:caption>'
        ],
        practicalTip: 'Never pluralize individual float labels even for multi-panel artwork. Multi-panel figures use sub-labels like "Figure 1(a-c)".',
        icon: Layers
    },
    {
        id: 'float_anchors',
        zoneNumber: 3,
        label: 'Float Anchor Proximity',
        shortName: 'Float Anchors',
        category: 'Layout Anchoring',
        tagPattern: '<ce:float-anchor refid="...">',
        description: 'Auditing float-anchor distances relative to first in-text callout locations...',
        severity: 'High',
        standardRef: 'DTD v5.6 §4.5 Layout Rules',
        tagChips: ['<ce:float-anchor>', 'refid="fig1"', 'refid="tbl1"', '<ce:sections>'],
        rules: [
            'Anchor proximity rule: anchor placed within 1–2 paragraphs of first in-text callout',
            'Prevent orphan float-anchors pointing to non-existent figure or table target IDs',
            'Boundary constraint: float-anchors must reside in <ce:sections>, never in abstracts',
            'Duplicate anchor prevention: ensure only one primary float-anchor per float element'
        ],
        practicalTip: 'Float anchors dictate automatic pagination engine breaks. Misplaced anchors force figures to migrate several pages away.',
        icon: Link2
    },
    {
        id: 'paragraph_views',
        zoneNumber: 4,
        label: 'Section Anatomy & Dual Views',
        shortName: 'Paragraph Views',
        category: 'Structural Hierarchy',
        tagPattern: '<ce:para view="extended"> vs <ce:para view="compact-standard">',
        description: 'Analyzing section hierarchy and checking dual-view paragraph balance...',
        severity: 'Major',
        standardRef: 'DTD v5.6 §3.4 Dual-View Spec',
        tagChips: ['view="extended"', 'view="compact-standard"', '<ce:section>', '<ce:section-title>'],
        rules: [
            'Dual-view paragraph balance: verify matching pairs for extended and compact-standard views',
            'Strict section hierarchy: <ce:sections> → <ce:section> → <ce:section-title> → <ce:para>',
            'Flag illegal block elements nested directly inside paragraphs (e.g. bare table nodes)',
            'Validate that abstracts, highlights, and graphical abstracts close before main sections'
        ],
        practicalTip: 'Dual views power responsive web vs print output. An extended paragraph lacking a compact counterpart causes automated typesetting to abort.',
        icon: BookOpen
    },
    {
        id: 'cross_refs',
        zoneNumber: 5,
        label: 'In-Text Cross-References',
        shortName: 'In-Text Cross-Refs',
        category: 'Cross-Linking Integrity',
        tagPattern: '<ce:cross-ref refid="..."> & unlinked citations',
        description: 'Validating target refid attributes and scanning for plain-text bracket mentions...',
        severity: 'Critical',
        standardRef: 'DTD v5.6 §5.1 Linking Spec',
        tagChips: ['<ce:cross-ref>', '<ce:cross-refs>', 'refid="..."', 'prefix="cf"'],
        rules: [
            'Target validity check: all refid attributes must resolve to valid declared IDs',
            'Strict prefix convention: standard DTD prefix is always "cf" (never "cfs" for plural)',
            'Raw citation sniffer: identify unlinked bracketed text citations (e.g. "[12-14]") and wrap in tags',
            'Multi-citation range expansion: ensure hyphenated citation ranges expand to discrete target IDs'
        ],
        practicalTip: 'Broken refids trigger fatal parser validation errors upon production ingestion. The prefix is always "cf" regardless of reference count.',
        icon: Search
    },
    {
        id: 'bibliography',
        zoneNumber: 6,
        label: 'Bibliography & Reference Models',
        shortName: 'Bibliography',
        category: 'Citations & References',
        tagPattern: '<ce:bibliography>, <ce:other-ref>, <sb:issue>, <sb:article-number>',
        description: 'Cross-checking reference IDs, mandatory ce:other-ref attributes, and sb:issue content models...',
        severity: 'Critical',
        standardRef: 'DTD v5.6 §6.3 Reference Spec',
        tagChips: ['<ce:bibliography>', '<ce:other-ref id="...">', '<sb:issue>', '<sb:article-number>', '<sb:series>'],
        rules: [
            'Structured bibliography verification: validate complete <sb:reference> node anatomy',
            'Element "ce:other-ref" must have an "id" attribute for cross-reference linking (DTD requirement)',
            'Content model of "sb:issue" must strictly match (sb:editors?,((sb:title,sb:translated-title?)|sb:translated-title)?,sb:conference?,sb:series,sb:issue-nr?,sb:date)',
            'Element "sb:article-number" formatting: strictly validate clean article number without "Art. No.", "Article", or "No." prefixes',
            'Uncited reference purge: cross-check bibliography IDs against in-text <ce:cross-ref> calls',
            'Author name and publication year validation against first author citation callout'
        ],
        practicalTip: 'In <sb:issue>, both <sb:series> and <sb:date> are mandatory. Inside <sb:article-number>, never include "Art. No." or spaces. Every <ce:other-ref> requires a declared id.',
        icon: ShieldCheck
    },
    {
        id: 'credit_grants',
        zoneNumber: 7,
        label: 'CRediT Roles, Initials & Typography',
        shortName: 'CRediT & Typography',
        category: 'Authorship & Disclosures',
        tagPattern: '<ce:contributor-role>, <ce:initials>, punctuation spacing',
        description: 'Verifying NISO CRediT roles, author initial spacing, and punctuation spacing compliance...',
        severity: 'Major',
        standardRef: 'NISO Z39.108-2020 & Publishing Typo Standard',
        tagChips: ['<ce:contributor-role>', '<ce:initials>', 'spacing ".,;?!:"', '<ce:grant-sponsor>'],
        rules: [
            'NISO CRediT taxonomy audit: validate role keywords against the 14 standardized contributor terms',
            'Punctuation spacing warning: punctuation characters ".,;?!:" should not be preceded by a space character ("impaired , along")',
            'Author initial typography: enforce single-spaced initials (e.g. "J. K." vs unspaced "J.K.")',
            'Grant and funding disclosure syntax: <ce:grant-sponsor> with linked <ce:grant-number>',
            'Affiliation and corresponding author linkage: verify superscripts match <ce:affiliation id="..."> tags'
        ],
        practicalTip: 'Spurious spaces before punctuation (e.g. "impaired , along") cause orphan punctuation wraps in typesetting. Punctuation must attach directly to the preceding word.',
        icon: Sparkles
    }
];

export interface DetectedXmlMetadata {
    articleId?: string;
    doi?: string;
    figuresCount?: number;
    tablesCount?: number;
    referencesCount?: number;
}

export function sniffXmlMetadata(text: string): DetectedXmlMetadata | undefined {
    if (!text) return undefined;
    const doiMatch = text.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
    const piiMatch = text.match(/[S|B][0-9]{4}-?[0-9]{4}\(?[0-9]{2}\)?[0-9]{5}-?[0-9X]/i) || text.match(/<ce:pii>([^<]+)<\/ce:pii>/i);
    const figuresCount = (text.match(/<ce:figure\b|\b(?:figure|fig\.?)\s*\d+/gi) || []).length;
    const tablesCount = (text.match(/<ce:table\b|\b(?:table|tab\.?)\s*\d+/gi) || []).length;
    const referencesCount = (text.match(/<ce:bib-reference\b|<sb:reference\b|\breferences?\b/gi) || []).length;

    return {
        articleId: piiMatch ? (piiMatch[1] || piiMatch[0]) : undefined,
        doi: doiMatch ? doiMatch[0] : undefined,
        figuresCount: figuresCount > 0 ? figuresCount : undefined,
        tablesCount: tablesCount > 0 ? tablesCount : undefined,
        referencesCount: referencesCount > 0 ? referencesCount : undefined,
    };
}

interface XmlAuditProgressTrackerProps {
    progress: number;
    currentStageIndex: number;
    detectedMetadata?: DetectedXmlMetadata;
    isCompleted?: boolean;
    sticky?: boolean;
    onSkip?: () => void;
    variant?: 'docked-bar' | 'full';
    onClose?: () => void;
}

export const XmlAuditProgressTracker: React.FC<XmlAuditProgressTrackerProps> = ({
    progress,
    currentStageIndex,
    detectedMetadata,
    isCompleted = false,
    variant = 'full',
    onSkip,
    onClose
}) => {
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'details'>('grid');
    const [selectedZoneIndex, setSelectedZoneIndex] = useState<number>(() => Math.min(currentStageIndex, AUDIT_STAGES.length - 1));
    const [filterCategory, setFilterCategory] = useState<'all' | 'critical' | 'floats' | 'citations'>('all');
    const [copiedZoneId, setCopiedZoneId] = useState<string | null>(null);

    const completed = isCompleted || progress >= 100;
    const activeStage = AUDIT_STAGES[Math.min(currentStageIndex, AUDIT_STAGES.length - 1)] || AUDIT_STAGES[0];
    const ActiveIcon = activeStage.icon;

    const inspectStage = AUDIT_STAGES[selectedZoneIndex] || activeStage;
    const InspectIcon = inspectStage.icon;

    const filteredStages = AUDIT_STAGES.filter(stage => {
        if (filterCategory === 'critical') return stage.severity === 'Critical';
        if (filterCategory === 'floats') return stage.id === 'floats_labels' || stage.id === 'float_anchors' || stage.id === 'paragraph_views';
        if (filterCategory === 'citations') return stage.id === 'cross_refs' || stage.id === 'bibliography' || stage.id === 'credit_grants';
        return true;
    });

    const handleCopyZoneSpec = (stage: AuditScanStage) => {
        const specSummary = `Zone ${stage.zoneNumber}: ${stage.label} (${stage.standardRef})\n` +
            `Tags: ${stage.tagPattern}\n` +
            `Severity: ${stage.severity}\n` +
            `Verification Criteria:\n${stage.rules.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}\n` +
            `Tip: ${stage.practicalTip}`;
        
        navigator.clipboard?.writeText(specSummary);
        setCopiedZoneId(stage.id);
        setTimeout(() => setCopiedZoneId(null), 2000);
    };

    if (variant === 'docked-bar') {
        return (
            <div className="shrink-0 bg-slate-900 border-b border-indigo-500/30 text-slate-100 shadow-sm relative z-20 transition-all select-none">
                {/* Compact Main Bar: Height ~38px, docked cleanly beneath chat header */}
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs shrink-0 ${
                            completed
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-indigo-600/30 text-cyan-300 border border-indigo-400/40'
                        }`}>
                            {completed ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                                <Activity className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                            )}
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-bold text-white tracking-wide truncate">
                                    7-Stage XML Scanner
                                </span>
                                <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full font-semibold border ${
                                    completed
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 animate-pulse'
                                }`}>
                                    {completed ? '✓ All 7 Zones Verified' : `Zone ${Math.min(currentStageIndex + 1, AUDIT_STAGES.length)}: ${activeStage.shortName}`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Center / Right Controls: Progress bar, percentage, metadata & inspect button */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Mini progress bar */}
                        <div className="w-16 sm:w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60 hidden xs:block">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                    completed
                                        ? 'bg-gradient-to-r from-cyan-400 via-indigo-400 to-emerald-400'
                                        : 'bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400'
                                }`}
                                style={{ width: `${completed ? 100 : Math.max(8, Math.min(100, progress))}%` }}
                            />
                        </div>

                        <span className={`text-[10px] font-mono font-bold ${completed ? 'text-emerald-300' : 'text-cyan-300'}`}>
                            {completed ? '100%' : `${Math.round(progress)}%`}
                        </span>

                        {/* Sniffed figures/tables/references counters */}
                        {detectedMetadata && (
                            <div className="hidden md:flex items-center gap-1 text-[9px] text-slate-300 font-mono">
                                {detectedMetadata.figuresCount !== undefined && <span>🖼️{detectedMetadata.figuresCount}</span>}
                                {detectedMetadata.tablesCount !== undefined && <span>📊{detectedMetadata.tablesCount}</span>}
                                {detectedMetadata.referencesCount !== undefined && <span>📚{detectedMetadata.referencesCount}</span>}
                            </div>
                        )}

                        {/* Inspect Inspection Zones Toggle */}
                        <button
                            type="button"
                            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 transition-all cursor-pointer ${
                                isDetailsExpanded
                                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                            }`}
                            title={isDetailsExpanded ? 'Hide publishing inspection zones' : 'Inspect Publishing XML Schema Inspection Zones'}
                        >
                            <ListChecks className="w-3 h-3 text-cyan-300" />
                            <span>Zones</span>
                            <span className="text-[9px] font-mono px-1 rounded bg-slate-900/80 text-cyan-300">7</span>
                            {isDetailsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {/* Skip Stage Delay Button (Visible during active scan) */}
                        {!completed && onSkip && (
                            <button
                                type="button"
                                onClick={onSkip}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-600/40 hover:bg-indigo-600/70 text-cyan-300 hover:text-white border border-indigo-400/40 flex items-center gap-0.5 transition-colors cursor-pointer"
                                title="Fast-forward scan stages and show results immediately"
                            >
                                <span>⚡ Skip</span>
                            </button>
                        )}

                        {/* Dismiss Banner Button */}
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Dismiss audit progress banner"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Enhanced Publishing XML Schema Inspection Zones Drawer */}
                {isDetailsExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-slate-800 bg-slate-950/95 max-h-64 overflow-y-auto custom-scrollbar text-[10px] space-y-2">
                        {/* Inspection Zones Header with View Mode and Filter Chips */}
                        <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-slate-800/80">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>Publishing XML Schema Inspection Zones</span>
                                </span>
                                <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-indigo-950/80 text-cyan-300 border border-indigo-800/60 font-semibold">
                                    DTD v5.6 &amp; JATS
                                </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                                {/* Mode Toggle: Overview Grid vs Deep Dive Inspector */}
                                <div className="flex rounded-md bg-slate-900 border border-slate-800 p-0.5 text-[9px]">
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('grid')}
                                        className={`px-2 py-0.5 rounded cursor-pointer font-semibold transition-all ${
                                            viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        Grid
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('details')}
                                        className={`px-2 py-0.5 rounded cursor-pointer font-semibold transition-all ${
                                            viewMode === 'details' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        Inspector
                                    </button>
                                </div>

                                <span className="font-mono text-[9.5px] text-cyan-300">
                                    {completed ? '7/7 Verified' : `Zone ${currentStageIndex + 1}/7 Scanning`}
                                </span>
                            </div>
                        </div>

                        {/* Filter Categories */}
                        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5 text-[9px]">
                            <span className="text-slate-500 font-semibold flex items-center gap-0.5 pr-1 shrink-0">
                                <Filter className="w-2.5 h-2.5" /> Filter:
                            </span>
                            {[
                                { id: 'all', label: 'All 7 Zones' },
                                { id: 'critical', label: 'Critical Rules (3)' },
                                { id: 'floats', label: 'Floats & Anchors (3)' },
                                { id: 'citations', label: 'Citations & CRediT (3)' }
                            ].map(f => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => setFilterCategory(f.id as any)}
                                    className={`shrink-0 px-1.5 py-0.5 rounded font-medium border transition-all cursor-pointer ${
                                        filterCategory === f.id
                                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 font-bold'
                                            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {/* View 1: Overview Grid */}
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {filteredStages.map((st) => {
                                    const stageIndex = AUDIT_STAGES.findIndex(s => s.id === st.id);
                                    const isDone = completed || stageIndex < currentStageIndex;
                                    const isCurrent = !completed && stageIndex === currentStageIndex;
                                    const StIcon = st.icon;

                                    return (
                                        <div
                                            key={st.id}
                                            onClick={() => {
                                                setSelectedZoneIndex(stageIndex);
                                                setViewMode('details');
                                            }}
                                            className={`p-2 rounded-lg border transition-all cursor-pointer group ${
                                                isDone
                                                    ? 'bg-slate-900/80 hover:bg-slate-900 border-emerald-500/30 text-slate-200 hover:border-emerald-400/50'
                                                    : isCurrent
                                                        ? 'bg-indigo-950/70 border-cyan-400/60 text-white shadow-xs shadow-cyan-500/10'
                                                        : 'bg-slate-900/40 hover:bg-slate-900/60 border-slate-800 text-slate-400'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-1.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] ${
                                                        isDone 
                                                            ? 'bg-emerald-500/20 text-emerald-400' 
                                                            : isCurrent 
                                                                ? 'bg-indigo-600/40 text-cyan-300' 
                                                                : 'bg-slate-800 text-slate-500'
                                                    }`}>
                                                        {isDone ? (
                                                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                                        ) : isCurrent ? (
                                                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                                        ) : (
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                                        )}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[9px] font-mono text-cyan-400/90 font-bold">
                                                                Z{st.zoneNumber}
                                                            </span>
                                                            <span className="font-bold text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
                                                                {st.label}
                                                            </span>
                                                        </div>
                                                        <span className="text-[8.5px] text-slate-400 block truncate">
                                                            {st.category} · {st.standardRef}
                                                        </span>
                                                    </div>
                                                </div>

                                                <span className={`text-[8.5px] font-mono px-1 py-0.2 rounded shrink-0 ${
                                                    st.severity === 'Critical'
                                                        ? 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                                                        : st.severity === 'High'
                                                            ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                                                            : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/60'
                                                }`}>
                                                    {st.severity}
                                                </span>
                                            </div>

                                            {/* Tag Chips Preview */}
                                            <div className="mt-1.5 flex items-center gap-1 flex-wrap font-mono text-[8px] text-cyan-300/80">
                                                {st.tagChips.slice(0, 3).map((chip, ci) => (
                                                    <span key={ci} className="px-1 py-0.2 rounded bg-slate-950 border border-slate-800">
                                                        {chip}
                                                    </span>
                                                ))}
                                                {st.tagChips.length > 3 && (
                                                    <span className="text-slate-500">+{st.tagChips.length - 3}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* View 2: Detailed Zone Inspector */
                            <div className="space-y-2">
                                {/* Zone Selector Pills */}
                                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1">
                                    {AUDIT_STAGES.map((st, i) => {
                                        const isDone = completed || i < currentStageIndex;
                                        const isCurrent = !completed && i === currentStageIndex;
                                        const isSelected = i === selectedZoneIndex;

                                        return (
                                            <button
                                                key={st.id}
                                                type="button"
                                                onClick={() => setSelectedZoneIndex(i)}
                                                className={`shrink-0 px-2 py-1 rounded-md text-[9.5px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs'
                                                        : isDone
                                                            ? 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-emerald-500/30'
                                                            : isCurrent
                                                                ? 'bg-indigo-950 text-cyan-300 border-cyan-400/50'
                                                                : 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300'
                                                }`}
                                            >
                                                {isDone ? (
                                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                                ) : isCurrent ? (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
                                                ) : (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                                                )}
                                                <span>Z{st.zoneNumber}: {st.shortName}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Active Inspected Zone Card */}
                                <div className="p-2.5 rounded-xl bg-slate-900 border border-indigo-500/40 space-y-2 shadow-inner">
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg bg-indigo-900/80 border border-indigo-400/50 flex items-center justify-center shrink-0">
                                                <InspectIcon className="w-3.5 h-3.5 text-cyan-300" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[11px] font-bold text-white">
                                                        Zone {inspectStage.zoneNumber}: {inspectStage.label}
                                                    </span>
                                                    <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-cyan-300 border border-indigo-800">
                                                        {inspectStage.standardRef}
                                                    </span>
                                                </div>
                                                <p className="text-[9.5px] text-slate-400">
                                                    {inspectStage.category} · Severity: <span className="font-semibold text-slate-300">{inspectStage.severity}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleCopyZoneSpec(inspectStage)}
                                            className="px-2 py-0.5 rounded text-[9.5px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                                            title="Copy zone specification checklist"
                                        >
                                            {copiedZoneId === inspectStage.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                            <span>{copiedZoneId === inspectStage.id ? 'Copied!' : 'Copy Spec'}</span>
                                        </button>
                                    </div>

                                    {/* Tag Chips */}
                                    <div className="flex items-center gap-1 flex-wrap font-mono text-[9px] text-cyan-300">
                                        <span className="text-slate-400 font-sans text-[9px] mr-1">Target Tags:</span>
                                        {inspectStage.tagChips.map((chip, ci) => (
                                            <span key={ci} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                                                {chip}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Verification Criteria Checklist */}
                                    <div className="space-y-1 pt-1 border-t border-slate-800">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Schema Verification Checklist:
                                        </span>
                                        <div className="grid grid-cols-1 gap-1">
                                            {inspectStage.rules.map((rule, ri) => (
                                                <div key={ri} className="flex items-start gap-1.5 text-[9.5px] text-slate-300">
                                                    <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                                                    <span>{rule}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Practical Editorial Tip */}
                                    <div className="p-1.5 rounded-lg bg-indigo-950/40 border border-indigo-900/60 flex items-start gap-1.5 text-[9px] text-indigo-200">
                                        <Info className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                                        <span><strong className="text-indigo-100">Production Tip:</strong> {inspectStage.practicalTip}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Variant === 'full': Comprehensive Editorial Inspection Matrix
    return (
        <div className="w-full bg-slate-900 border border-indigo-500/40 rounded-2xl p-3.5 shadow-xl text-slate-100 select-none overflow-hidden relative">
            {/* Ambient Background Accents */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Header / Title Bar */}
            <div className="flex items-center justify-between mb-2 relative z-10">
                <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shadow-inner shrink-0 ${
                        completed 
                            ? 'bg-emerald-600/50 border border-emerald-400/60 text-emerald-300' 
                            : 'bg-indigo-600/60 border border-indigo-400/50 text-cyan-300'
                    }`}>
                        {completed ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : (
                            <Activity className="w-4 h-4 animate-pulse" />
                        )}
                    </span>
                    <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black tracking-wide text-white uppercase flex items-center gap-1">
                                {completed ? '7-Stage XML Schema Scan Verified' : '7-Stage XML Schema Scanner'}
                            </span>
                            <span className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold border ${
                                completed
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 animate-pulse'
                            }`}>
                                {completed ? '100% Compliant' : 'Live Scan'}
                            </span>
                        </div>
                        {detectedMetadata?.articleId && (
                            <p className="text-[10px] text-slate-400 font-mono">
                                Target: {detectedMetadata.articleId} {detectedMetadata.doi ? `(${detectedMetadata.doi})` : ''}
                            </p>
                        )}
                    </div>
                </div>

                <div className="text-right shrink-0">
                    <span className={`text-sm font-black font-mono tracking-tight ${completed ? 'text-emerald-300' : 'text-cyan-300'}`}>
                        {completed ? '100%' : `${Math.round(progress)}%`}
                    </span>
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                        {completed ? '7 of 7 Zones Checked' : `Zone ${Math.min(currentStageIndex + 1, AUDIT_STAGES.length)} of ${AUDIT_STAGES.length}`}
                    </p>
                </div>
            </div>

            {/* Active Visual Progress Bar */}
            <div className="relative w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/60 mb-2.5 shadow-inner">
                <div 
                    className={`h-full transition-all duration-300 ease-out rounded-full relative ${
                        completed 
                            ? 'bg-gradient-to-r from-cyan-400 via-indigo-400 to-emerald-400' 
                            : 'bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400'
                    }`}
                    style={{ width: `${completed ? 100 : Math.max(4, Math.min(100, progress))}%` }}
                >
                    {!completed && (
                        <div className="absolute top-0 right-0 bottom-0 w-2 bg-white rounded-full shadow-[0_0_8px_#ffffff]" />
                    )}
                </div>
            </div>

            {/* Current Active Stage & Target Info Card */}
            {!completed ? (
                <div className="bg-slate-800/70 border border-indigo-400/30 rounded-xl p-2.5 mb-2.5 relative z-10 transition-all">
                    <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-900/80 border border-indigo-400/40 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                            <ActiveIcon className="w-3.5 h-3.5 text-cyan-300 animate-spin-slow" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                                <span className="text-[11px] font-bold text-indigo-100 flex items-center gap-1.5">
                                    <span>Zone {activeStage.zoneNumber}: {activeStage.label}</span>
                                    <span className="text-[9px] font-mono text-cyan-400 font-normal">({activeStage.standardRef})</span>
                                </span>
                                <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-md bg-indigo-950/80 text-cyan-300 border border-indigo-800/60 truncate max-w-[200px]">
                                    {activeStage.tagPattern}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">
                                {activeStage.description}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Verified Manuscript Schema Architecture Summary Pill Grid */
                <div className="bg-slate-850/80 border border-emerald-500/30 rounded-xl p-2.5 mb-2.5 relative z-10 transition-all">
                    <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
                        <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="font-semibold text-slate-200">
                                DTD Architecture Sniff Completed · All 7 Zones Pass
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {detectedMetadata?.figuresCount !== undefined && (
                                <span className="px-1.5 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-800/60 text-cyan-300 font-mono text-[9.5px]">
                                    🖼️ {detectedMetadata.figuresCount} Figures
                                </span>
                            )}
                            {detectedMetadata?.tablesCount !== undefined && (
                                <span className="px-1.5 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-800/60 text-cyan-300 font-mono text-[9.5px]">
                                    📊 {detectedMetadata.tablesCount} Tables
                                </span>
                            )}
                            {detectedMetadata?.referencesCount !== undefined && (
                                <span className="px-1.5 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-800/60 text-cyan-300 font-mono text-[9.5px]">
                                    📚 {detectedMetadata.referencesCount} References
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 7 Inspection Zone Horizontal Steps Strip */}
            <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-slate-800/80">
                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5 w-full">
                    {AUDIT_STAGES.map((stage, idx) => {
                        const isDone = completed || idx < currentStageIndex;
                        const isCurrent = !completed && idx === currentStageIndex;

                        return (
                            <button
                                key={stage.id}
                                type="button"
                                onClick={() => {
                                    setSelectedZoneIndex(idx);
                                    setIsDetailsExpanded(true);
                                }}
                                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-semibold transition-all border cursor-pointer ${
                                    isDone
                                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                                        : isCurrent
                                            ? 'bg-indigo-900/90 border-cyan-400/60 text-cyan-200 shadow-xs shadow-cyan-500/20 animate-pulse'
                                            : 'bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-400'
                                }`}
                                title={`Zone ${stage.zoneNumber}: ${stage.label} (${stage.tagPattern})`}
                            >
                                {isDone ? (
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                ) : isCurrent ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
                                ) : (
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                                )}
                                <span>Z{stage.zoneNumber}: {stage.shortName}</span>
                            </button>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                    className="shrink-0 p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title={isDetailsExpanded ? 'Collapse inspection zones details' : 'Expand full inspection zones details'}
                >
                    {isDetailsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
            </div>

            {/* Expandable Publishing XML Schema Inspection Zones Panel */}
            {isDetailsExpanded && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[10px] space-y-2 text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-cyan-300 uppercase tracking-wider text-[9.5px] flex items-center gap-1.5">
                            <ListChecks className="w-3 h-3" />
                            <span>Publishing XML Schema Inspection Zones — Detailed Breakdown:</span>
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">
                            Zone {inspectStage.zoneNumber} Selected
                        </span>
                    </div>

                    {/* Active Selected Zone Card */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-indigo-500/30 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-white text-[11px]">
                                        Zone {inspectStage.zoneNumber}: {inspectStage.label}
                                    </span>
                                    <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-cyan-300 border border-indigo-800">
                                        {inspectStage.standardRef}
                                    </span>
                                </div>
                                <span className="text-[9px] text-slate-400 block mt-0.5">
                                    {inspectStage.category} · Severity: {inspectStage.severity}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleCopyZoneSpec(inspectStage)}
                                className="px-2 py-0.5 rounded text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                            >
                                {copiedZoneId === inspectStage.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedZoneId === inspectStage.id ? 'Copied' : 'Copy'}</span>
                            </button>
                        </div>

                        {/* Rules Checklist */}
                        <div className="space-y-1 pt-1 border-t border-slate-850">
                            {inspectStage.rules.map((rule, ri) => (
                                <div key={ri} className="flex items-start gap-1.5 text-[9.5px]">
                                    <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                                    <span className="text-slate-300">{rule}</span>
                                </div>
                            ))}
                        </div>

                        {/* Practical Tip */}
                        <div className="p-1.5 rounded-lg bg-indigo-950/40 border border-indigo-900/60 text-[9px] text-indigo-200">
                            <strong className="text-indigo-100">Editorial Rule:</strong> {inspectStage.practicalTip}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
