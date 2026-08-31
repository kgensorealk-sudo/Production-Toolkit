import { ToolId } from '../types';

export interface ToolInfo {
    id: ToolId;
    name: string;
    route: string;
    category: 'Citations & References' | 'Markup & XML Structure' | 'Conversion & Utilities';
    shortDesc: string;
    scenarios: string[];
    howToUse: string;
    keywords: string[];
    isExperimental?: boolean;
    stableAlternative?: { id: ToolId; name: string; route: string };
    warningNote?: string;
}

export const TOOL_REGISTRY: ToolInfo[] = [
    {
        id: ToolId.XML_RENUMBER,
        name: 'XML Normalizer',
        route: '/xmlRenumber',
        category: 'Citations & References',
        shortDesc: 'Sequentially renumbers references and synchronizes all in-text citation cross-references across the manuscript.',
        scenarios: [
            'Bibliography numbers are out of order (e.g. citation [3] appears before [1] in the body).',
            'References were deleted or inserted, throwing off all numbering down the line.',
            'Need to renumber references by order of appearance in the text.',
            'Updating all <ce:cross-ref refid="..."> attributes to match new bibliography IDs.'
        ],
        howToUse: 'Open XML Normalizer, paste your full document XML or body + reference list, configure sorting and prefix preferences, then click "Process & Renumber".',
        keywords: ['renumber', 'order of appearance', 'reorder', 'cross-ref', 'numeric citations', 'reference order', 'mismatched numbers']
    },
    {
        id: ToolId.CITATION_LINKER,
        name: 'Citation Linker Pro',
        route: '/citationLinker',
        category: 'Citations & References',
        shortDesc: 'Automatically scans orphan or unlinked in-text citations and connects them to bibliography IDs.',
        scenarios: [
            'In-text citations exist as plain text (e.g. "(Smith et al., 2020)" or "[14-16]") without <ce:cross-ref> tags.',
            'Cross-reference tags are missing refid attributes or have invalid broken links.',
            'Need to automatically map author-year or numeric citations to their target <ce:bib-reference id="...">.'
        ],
        howToUse: 'Paste your manuscript body and reference list, click "Scan & Link Citations", review detected matches, and export the linked XML with generated <ce:cross-ref> tags.',
        keywords: ['link citations', 'orphan citations', 'cross-ref', 'unlinked', 'author-year linking', 'missing refid']
    },
    {
        id: ToolId.STRUCTURAL_ARCHITECT,
        name: 'Reference Structure Repair (Structural Architect)',
        route: '/structuralArchitect',
        category: 'Citations & References',
        shortDesc: 'Audits and auto-repairs malformed reference structures, author initials, missing tags, and ID sequences according to DTD v5.6.',
        scenarios: [
            'References have missing or broken XML nodes (e.g., incomplete <sb:reference>, missing <sb:contribution> or <sb:host>).',
            'Author initials lack periods or spaces, or given names and surnames are merged incorrectly.',
            'Missing <ce:source-text> fallback or invalid langtype attributes.',
            'Malformed journal titles, volume/issue tags, or page number ranges.'
        ],
        howToUse: 'Paste your reference list XML into the editor, click "Audit & Auto-Repair", review structural corrections in the side-by-side view, and copy the compliant XML.',
        keywords: ['broken reference', 'malformed xml', 'author initials', 'source-text', 'sb:reference', 'dtd compliance', 'schema repair']
    },
    {
        id: ToolId.REF_DUPE_CHECK,
        name: 'Duplicate Ref Remover',
        route: '/refDupeCheck',
        category: 'Citations & References',
        shortDesc: 'Detects duplicate bibliography entries, merges them, and updates in-text citations.',
        scenarios: [
            'The same study or journal article is listed more than once under different reference numbers (e.g., ref 4 and ref 19 are identical).',
            'Multiple co-authors contributed different drafts resulting in duplicated citations.',
            'Need to merge duplicates and redirect all in-text <ce:cross-ref> calls to a single canonical reference.'
        ],
        howToUse: 'Paste your reference list XML or text, click "Scan for Duplicates", select which items to merge, and generate a deduplicated reference list.',
        keywords: ['duplicate references', 'dedup', 'identical citations', 'repeat references', 'merge references']
    },
    {
        id: ToolId.UNCITED_CLEANER,
        name: 'Uncited Ref Cleaner',
        route: '/uncitedCleaner',
        category: 'Citations & References',
        shortDesc: 'Detects bibliography references that are never cited in the body text and performs safe purging.',
        scenarios: [
            'References in <ce:bibliography> have no matching <ce:cross-ref> in the manuscript body.',
            'Editorial guidelines require removing unreferenced bibliography entries or querying the author.',
            'Bulk isolation of uncited items while preserving document integrity and valid XML.'
        ],
        howToUse: 'Paste the manuscript body and reference list XML, click "Audit Citations", inspect the list of uncited items, and choose to remove or export them.',
        keywords: ['uncited references', 'orphan references', 'unreferenced', 'unused bibliography', 'purge references']
    },
    {
        id: ToolId.WORD_TO_XML,
        name: 'MS Word to XML Converter',
        route: '/wordToXml',
        category: 'Conversion & Utilities',
        shortDesc: 'Converts MS Word clipboard text with superscripts, subscripts, bold, italics, and paragraphs into standard Journal CE XML.',
        scenarios: [
            'Author submitted revisions or additions in Microsoft Word with rich formatting.',
            'Text contains chemical formulas with subscripts, footnotes with superscripts, bold headings, and italicized species names.',
            'Converting formatted Word text into clean DTD elements (<ce:sup>, <ce:inf>, <ce:bold>, <ce:italic>, <ce:para>).'
        ],
        howToUse: 'Copy formatted text directly from Microsoft Word, paste into the rich input box, click "Scan & Convert", and copy the generated XML.',
        keywords: ['word to xml', 'ms word', 'superscript', 'subscript', 'docx conversion', 'rich text to xml', 'formatting to tags']
    },
    {
        id: ToolId.CREDIT_GENERATOR,
        name: 'CRediT Tagging',
        route: '/creditGenerator',
        category: 'Markup & XML Structure',
        shortDesc: 'Smart-detects contributor roles from raw text, auto-corrects typos, and generates standardized NISO CRediT XML.',
        scenarios: [
            'Author provided an informal Author Contributions statement (e.g., "JS did data analysis, AK designed study, MJ drafted manuscript").',
            'Need to map roles to the 14 official NISO CRediT roles (Conceptualization, Data curation, Methodology, Supervision, etc.).',
            'Auto-correcting typos in contributor roles and generating standardized <ce:author-group> and <ce:contributor-role> tags.'
        ],
        howToUse: 'Paste author names and raw contribution statements, let the smart analyzer detect matching CRediT roles, verify assignments, and generate compliant XML.',
        keywords: ['credit roles', 'contributor roles', 'niso credit', 'author contributions', 'conceptualization', 'methodology']
    },
    {
        id: ToolId.REF_EXTRACTOR,
        name: 'Bibliography Extractor',
        route: '/refExtractor',
        category: 'Citations & References',
        shortDesc: 'Extracts clean plain-text bibliographies from XML with normalized punctuation and spacing for Word proofing.',
        scenarios: [
            'Need to send a plain-text reference list to an author or copyeditor from an XML file.',
            'Stripping XML tags while preserving punctuation, italics, volume/page numbers, and DOIs in clean APA/Vancouver format.',
            'Word-ready bibliography extraction without residual tags or corrupted entities.'
        ],
        howToUse: 'Paste your reference XML, select your desired output format (Numbered, Author-Year, APA/Vancouver), and click "Extract Plain Text".',
        keywords: ['extract bibliography', 'xml to text', 'plain text references', 'strip tags', 'export to word']
    },
    {
        id: ToolId.GRANT_TAGGER,
        name: 'Grant Tagger',
        route: '/grantTagger',
        category: 'Markup & XML Structure',
        shortDesc: 'Identifies and tags funding agencies, sponsors, and grant award numbers in funding statements.',
        scenarios: [
            'Acknowledgments or funding sections contain grant numbers and sponsors (e.g., NIH R01, NSF, Wellcome Trust).',
            'Need to wrap agencies in <ce:grant-sponsor> and award IDs in <ce:grant-number> with cross-links according to standard funding guidelines.'
        ],
        howToUse: 'Paste funding statements or acknowledgments text, click "Analyze Grants", review identified sponsors and numbers, and generate compliant funding XML.',
        keywords: ['grants', 'funding', 'grant sponsor', 'grant number', 'acknowledgments', 'nih', 'nsf']
    },
    {
        id: ToolId.TABLE_BEAUTIFIER,
        name: 'Table XML Beautifier',
        route: '/tableBeautifier',
        category: 'Markup & XML Structure',
        shortDesc: 'Transforms single-line or minified table XML into structured, readable, multi-line formatted blocks.',
        scenarios: [
            'Table XML is collapsed on a single line or minified, making row and column debugging difficult.',
            'Formatting <table>, <tgroup>, <colspec>, <thead>, <tbody>, <row>, and <entry> tags with clean indentation.'
        ],
        howToUse: 'Paste condensed table XML, click "Beautify Table", and get structured, indented table markup.',
        keywords: ['table beautifier', 'format table', 'indent table', 'tgroup', 'colspec', 'row entry']
    },
    {
        id: ToolId.TABLE_FIXER,
        name: 'XML Table Fixer',
        route: '/tableFixer',
        category: 'Markup & XML Structure',
        shortDesc: 'Manages table footnotes by detaching notes into table legends or attaching legends back to cells.',
        scenarios: [
            'Table cell footnote markers need to be detached into standardized <legend> notes.',
            'Reattaching legend notes back to specific table entry cells.',
            'Cleaning footnote callout symbols (*, †, ‡, a, b, c) in complex tables.'
        ],
        howToUse: 'Paste table XML, choose "Detach Footnotes to Legend" or "Attach to Cells", review modifications, and export clean table XML.',
        keywords: ['table footnotes', 'table fixer', 'table legend', 'cell footnotes', 'table notes']
    },
    {
        id: ToolId.TAG_CLEANER,
        name: 'XML Tag Cleaner',
        route: '/tagCleaner',
        category: 'Markup & XML Structure',
        shortDesc: 'Safely strips specific editing option tags or unwanted inline markup while preserving document structure.',
        scenarios: [
            'Removing vendor tracking attributes, obsolete span tags, or review notes from XML.',
            'Stripping specific tags (e.g. <delete>, <insert>, <comment>) while retaining their inner text content.',
            'Cleaning conversion artifacts without breaking XML tree validity.'
        ],
        howToUse: 'Paste XML content, select which tags to strip or preserve, click "Clean Tags", and download the cleaned document.',
        keywords: ['tag cleaner', 'strip tags', 'remove inline markup', 'clean xml', 'remove comments']
    },
    {
        id: ToolId.QUICK_DIFF,
        name: 'Quick Text Diff',
        route: '/quickDiff',
        category: 'Conversion & Utilities',
        shortDesc: 'Instant side-by-side text and XML comparison with character-level highlights and line numbers.',
        scenarios: [
            'Comparing author revised text against the original published XML proof.',
            'Checking what changed after automated scripts or copyediting passes.',
            'Side-by-side visual diff showing additions, deletions, and inline modifications.'
        ],
        howToUse: 'Paste Original text on the left and Modified text on the right; view side-by-side diff highlighting with synchronized scroll.',
        keywords: ['diff', 'compare text', 'compare xml', 'revisions', 'what changed', 'side by side']
    },
    {
        id: ToolId.ID_AUDITOR,
        name: 'ID Prefix Auditor',
        route: '/idAuditor',
        category: 'Citations & References',
        shortDesc: 'Audits and normalizes ID sequences in references and tables while maintaining internal document cross-links.',
        scenarios: [
            'Reference IDs have inconsistent prefixes (e.g. mixture of "bib001", "b1", "ref1").',
            'Journal requires a strict prefix convention (e.g., "bib" or "b").',
            'Auditing all element IDs and updating internal reference links synchronously.'
        ],
        howToUse: 'Paste XML, specify target prefix rule (e.g. "bib1, bib2..." or "b1, b2..."), click "Audit & Normalize", and export standardized XML.',
        keywords: ['id auditor', 'prefix', 'bib prefix', 'normalize ids', 'inconsistent ids']
    },
    {
        id: ToolId.REF_SORTER,
        name: 'Reference Sorter',
        route: '/refSorter',
        category: 'Citations & References',
        shortDesc: 'Sorts reference lists alphabetically (by author surname and year) or numerically.',
        scenarios: [
            'Author-year reference list (Harvard/APA) is not strictly alphabetized by first author surname.',
            'Reordering reference lists by publication year or numerical sequence.',
            'Standardizing sorting order before publication.'
        ],
        howToUse: 'Paste reference XML, select "Alphabetical (A-Z by Author Surname)" or "Numeric", and click "Sort References".',
        keywords: ['sort references', 'alphabetize', 'alphabetical order', 'author year sort', 'reorder bibliography']
    },
    {
        id: ToolId.HIGHLIGHTS_GEN,
        name: 'Article Highlights Gen',
        route: '/highlightsGen',
        category: 'Markup & XML Structure',
        shortDesc: 'Converts author research highlights into standardized <ce:highlights> XML structures.',
        scenarios: [
            'Author provided research bullet points in plain text.',
            'Converting points into standard <ce:highlights><ce:highlight><ce:para> tags with validation of character limits.'
        ],
        howToUse: 'Paste bullet points, check character count limits, and click "Generate Highlights XML".',
        keywords: ['highlights', 'bullet points', 'ce:highlights', 'author highlights', 'summary bullets']
    },
    {
        id: ToolId.SECTION_AUDITOR,
        name: 'Section Auditor',
        route: '/sectionAuditor',
        category: 'Markup & XML Structure',
        shortDesc: 'Audits section heading hierarchy, levels, and numbering consistency across the manuscript.',
        scenarios: [
            'Section levels are skipped or malformed (e.g. jump from level 1 to level 3 heading).',
            'Section titles lack proper <ce:section-title> tags or inconsistent numbering schemes.'
        ],
        howToUse: 'Paste full manuscript XML, click "Audit Sections", review the hierarchical tree view, and fix heading inconsistencies.',
        keywords: ['section hierarchy', 'headings', 'section auditor', 'section title', 'nested sections']
    },
    {
        id: ToolId.AFFILIATION_SEQUENCER,
        name: 'Affiliation Sequencer',
        route: '/affiliationSequencer',
        category: 'Markup & XML Structure',
        shortDesc: 'Maps and sequences author affiliations, superscript markers, and address tags.',
        scenarios: [
            'Author affiliation superscripts are out of sequence (e.g. 1, 3, 2).',
            'Authors lack matching <ce:affiliation id="..."> tags or affiliations have unlinked authors.'
        ],
        howToUse: 'Paste author-group XML, click "Sequence Affiliations", reorder or relink superscripts, and export clean markup.',
        keywords: ['affiliation', 'author affiliation', 'superscript linking', 'author-group', 'institutions']
    },
    {
        id: ToolId.REFERENCE_GEN,
        name: 'Reference Updater',
        route: '/referenceGen',
        category: 'Citations & References',
        shortDesc: 'Merges updated or corrected reference records into an existing XML bibliography while preserving ID integrity.',
        scenarios: [
            'Received updated reference entries from PubMed, CrossRef, or copyeditors that need to overwrite existing references.',
            'Preserving original reference IDs while updating metadata (authors, journal title, pages, DOI).'
        ],
        howToUse: 'Paste original reference list and updated references, click "Merge & Update", and generate the updated list.',
        keywords: ['update references', 'merge bibliography', 'crossref update', 'pubmed update', 'refresh metadata']
    },
    {
        id: ToolId.OTHER_REF_SCANNER,
        name: 'Other-Ref Scanner',
        route: '/otherRefScanner',
        category: 'Citations & References',
        shortDesc: 'Isolates unstructured <ce:other-ref> elements for external catalog lookup or manual tagging.',
        scenarios: [
            'Manuscript contains references marked as <ce:other-ref> that could not be automatically structured.',
            'Need to export unstructured references for external database lookup or manual markup.'
        ],
        howToUse: 'Paste manuscript XML, click "Scan for Other-Ref", and copy formatted unstructured citations.',
        keywords: ['other-ref', 'unstructured reference', 'raw reference', 'scan other-ref']
    },
    {
        id: ToolId.XML_RENUMBER_EXP,
        name: 'XML Normalizer Pro (Experimental)',
        route: '/xmlRenumberExp',
        category: 'Citations & References',
        shortDesc: 'Advanced sequential citation renumbering with alphabetical sorting, range compression, and other-ref isolation.',
        scenarios: [
            'Testing advanced citation renumbering algorithms with alphabetical grouping or range compression.',
            'Sequential renumbering for complex multi-part manuscripts requiring range compression.'
        ],
        howToUse: 'Paste manuscript XML or body + reference list, configure sorting and prefix preferences, click "Process & Renumber". Verify all output carefully.',
        keywords: ['xml normalizer pro', 'renumber experimental', 'range compression', 'xmlrenumberexp', 'experimental normalizer'],
        isExperimental: true,
        stableAlternative: {
            id: ToolId.XML_RENUMBER,
            name: 'XML Normalizer',
            route: '/xmlRenumber'
        },
        warningNote: 'Experimental Version — not yet fully established. Verify renumbered reference outputs before production use.'
    },
    {
        id: ToolId.CITATION_LINKER_EXP,
        name: 'Citation Linker Pro MAX (Experimental)',
        route: '/citationLinkerExp',
        category: 'Citations & References',
        shortDesc: 'Multi-entity citation linker with fuzzy author/year resolution, float cross-refs, and auto-text detection.',
        scenarios: [
            'Fuzzy author-year linking across complex multi-author or multi-year papers.',
            'Testing multi-entity cross-reference linking for figures, tables, and sections.'
        ],
        howToUse: 'Paste manuscript body and reference list, click "Run Multi-Entity Scan", review matches, and export linked XML. Carefully inspect generated tags.',
        keywords: ['citation linker exp', 'citation linker pro max', 'multi-entity linker', 'fuzzy linking'],
        isExperimental: true,
        stableAlternative: {
            id: ToolId.CITATION_LINKER,
            name: 'Citation Linker Pro',
            route: '/citationLinker'
        },
        warningNote: 'Experimental Version — not yet fully established. Multi-entity linking algorithms are under active testing.'
    },
    {
        id: ToolId.FORMULA_EDITOR_EXP,
        name: 'Formula Studio Pro (Experimental)',
        route: '/formulaEditorExp',
        category: 'Markup & XML Structure',
        shortDesc: 'Interactive MathML formula editor with real-time two-way XML rendering, inline edit sync, and tag auto-repair.',
        scenarios: [
            'Editing and repairing MathML formulas with real-time visual equation preview.',
            'Converting LaTeX or raw formula text into standard MathML markup.'
        ],
        howToUse: 'Enter or paste MathML/formula XML, view live rendering, and double check equation markup before inserting into manuscript.',
        keywords: ['formula editor', 'mathml', 'math formulas', 'formula studio pro', 'equations'],
        isExperimental: true,
        warningNote: 'Experimental Version — not yet fully established. MathML tags and equations should be manually verified.'
    },
    {
        id: ToolId.REF_TAGGER_EXP,
        name: 'Reference XML Tagger Pro (Experimental)',
        route: '/refTaggerExp',
        category: 'Citations & References',
        shortDesc: 'Batch transforms plain-text reference lists into fully structured, schema-compliant XML bibliography nodes.',
        scenarios: [
            'Converting un-tagged plain-text reference lists into standard <ce:bib-reference> XML.',
            'Automated heuristic parsing of author names, publication years, journal titles, and DOIs.'
        ],
        howToUse: 'Paste raw reference text, run the experimental parser, and inspect every tagged node before saving.',
        keywords: ['reference tagger', 'plain text to xml', 'reftaggerexp', 'tag references'],
        isExperimental: true,
        warningNote: 'Experimental Version — not yet fully established. Machine-parsed references can miss edge cases—verify all tags.'
    },
    {
        id: ToolId.REF_SORTER,
        name: 'Reference Sorter',
        route: '/refSorter',
        category: 'Citations & References',
        shortDesc: 'Alphabetically sorts bibliography references by author surname and year.',
        scenarios: [
            'Sorting references alphabetically by first author surname.',
            'Harvard-style reference list reordering.'
        ],
        howToUse: 'Paste reference XML, select alphabetical sorting, and review sorted order.',
        keywords: ['sort references', 'alphabetical sort', 'ref sorter', 'harvard sort'],
        isExperimental: true,
        warningNote: 'Experimental Version — not yet fully established. Sorting algorithms are under active testing.'
    }
];

export const DASHBOARD_TOOL_IDS: ToolId[] = [
    ToolId.XML_RENUMBER,
    ToolId.REF_EXTRACTOR,
    ToolId.GRANT_TAGGER,
    ToolId.UNCITED_CLEANER,
    ToolId.ID_AUDITOR,
    ToolId.CITATION_LINKER,
    ToolId.OTHER_REF_SCANNER,
    ToolId.REFERENCE_GEN,
    ToolId.CREDIT_GENERATOR,
    ToolId.HIGHLIGHTS_GEN,
    ToolId.QUICK_DIFF,
    ToolId.TAG_CLEANER,
    ToolId.TABLE_FIXER,
    ToolId.TABLE_BEAUTIFIER,
    ToolId.WORD_TO_XML,
    ToolId.VIEW_SYNC,
    ToolId.STRUCTURAL_ARCHITECT
];

export const EXPERIMENTAL_TOOL_IDS: (ToolId | string)[] = [
    ToolId.XML_RENUMBER_EXP,
    ToolId.CITATION_LINKER_EXP,
    ToolId.FORMULA_EDITOR_EXP,
    ToolId.REF_TAGGER_EXP,
    ToolId.REF_SORTER,
    'experimental'
];

/**
 * Checks whether a given tool ID or route is present on the main Dashboard.
 */
export function isDashboardTool(id?: ToolId | string | null): boolean {
    if (!id) return false;
    const normalized = String(id).replace(/^#?\/?/, '');
    return DASHBOARD_TOOL_IDS.some(t => t === id || t === normalized || t.toLowerCase() === normalized.toLowerCase());
}

/**
 * Checks whether a given tool ID or route represents an experimental version.
 */
export function isExperimentalTool(id?: ToolId | string | null): boolean {
    if (!id) return false;
    const str = String(id).toLowerCase();
    return (
        EXPERIMENTAL_TOOL_IDS.includes(id as any) ||
        str.includes('exp') ||
        str.includes('experimental') ||
        str === '/experimental'
    );
}

/**
 * Retrieves ToolInfo by ID or route path.
 */
export function getToolInfo(id?: ToolId | string | null): ToolInfo | undefined {
    if (!id) return undefined;
    const normalized = String(id).replace(/^#?\/?/, '');
    return TOOL_REGISTRY.find(t => 
        t.id === id || 
        t.route === id || 
        t.route === `/${normalized}` ||
        t.id.toLowerCase() === normalized.toLowerCase()
    );
}

/**
 * Returns standard warning text for experimental tools.
 */
export function getExperimentalWarning(id?: ToolId | string | null): string {
    const info = getToolInfo(id);
    if (info?.warningNote) return info.warningNote;
    return "Notice: You are using an Experimental Version of this tool. Experimental modules are under active testing and not yet fully established. Please review all XML markup and output before publishing or applying to production manuscripts.";
}

/**
 * Finds matching tools based on a user's natural language scenario query.
 * Only returns official established tools present in the Dashboard console.
 */
export function findToolsForScenario(query: string, includeNonDashboard: boolean = false): ToolInfo[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    return TOOL_REGISTRY.filter(tool => {
        if (!includeNonDashboard && (!isDashboardTool(tool.id) || tool.isExperimental)) {
            return false;
        }
        const matchName = tool.name.toLowerCase().includes(q);
        const matchDesc = tool.shortDesc.toLowerCase().includes(q);
        const matchKeywords = tool.keywords.some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()));
        const matchScenarios = tool.scenarios.some(s => s.toLowerCase().includes(q));
        return matchName || matchDesc || matchKeywords || matchScenarios;
    });
}
