export interface CreditRole {
    name: string;
    url: string;
    aliases: string[];
    definition?: string;
    shortName?: string;
}

export interface Suggestion {
    name: string;
    dist: number;
}

export interface AuthorIssue {
    name: string;
    role: string;
    correctedTo?: string;
    suggestions?: Suggestion[];
    isError: boolean;
}

export interface DiffGroup {
    type: 'replace' | 'delete' | 'insert' | 'equal';
    left?: string;
    right?: string;
    text?: string;
}

export enum SubscriptionTier {
    NONE = 'none',
    SCRIBE = 'scribe',
    ARTISAN = 'artisan',
    VISIONARY = 'visionary'
}

export interface UserProfile {
    id: string;
    email: string;
    display_name?: string;
    avatar_url?: string;
    role: string;
    is_subscribed: boolean;
    subscription_tier: SubscriptionTier;
    subscription_end?: string;
    trial_start?: string;
    trial_end?: string;
    last_seen?: string;
    unlocked_tools: string[]; // List of tool IDs unlocked via keys
    notification_preferences?: {
        system_alerts: boolean;
        security_updates: boolean;
        maintenance_windows: boolean;
    };
    created_at?: string;
}

export interface SmartSuggestion {
    id: string;
    toolName: string;
    description: string;
    path: string;
    icon: React.ReactNode;
    condition: string;
}

export enum ToolId {
    XML_RENUMBER = 'xmlRenumber',
    XML_RENUMBER_EXP = 'xmlRenumberExp',
    CREDIT_GENERATOR = 'creditGenerator',
    QUICK_DIFF = 'quickDiff',
    TAG_CLEANER = 'tagCleaner',
    TABLE_FIXER = 'tableFixer',
    TABLE_BEAUTIFIER = 'tableBeautifier',
    HIGHLIGHTS_GEN = 'highlightsGen',
    VIEW_SYNC = 'viewSync',
    REFERENCE_GEN = 'referenceGen',
    REF_DUPE_CHECK = 'refDupeCheck',
    UNCITED_CLEANER = 'uncitedCleaner',
    OTHER_REF_SCANNER = 'otherRefScanner',
    REF_EXTRACTOR = 'refExtractor',
    GRANT_TAGGER = 'grantTagger',
    ID_AUDITOR = 'idAuditor',
    COMMENT_REPLACER = 'commentReplacer',
    CITATION_LINKER = 'citationLinker',
    CITATION_LINKER_EXP = 'citationLinkerExp',
    FORMULA_EDITOR_EXP = 'formulaEditorExp',
    SECTION_AUDITOR = 'sectionAuditor',
    AFFILIATION_SEQUENCER = 'affiliationSequencer',
    STRUCTURAL_ARCHITECT = 'structuralArchitect',
    REF_SORTER = 'refSorter',
    WORD_TO_XML = 'wordToXml',
    REF_TAGGER_EXP = 'refTaggerExp',
    DOCS = 'docs',
    DASHBOARD = 'dashboard'
}

export interface DefaultAvatar {
    id: string;
    url: string;
    name: string;
    created_at: string;
}
