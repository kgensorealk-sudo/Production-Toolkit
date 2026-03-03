export interface CreditRole {
    name: string;
    url: string;
    aliases: string[];
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

export interface UserProfile {
    id: string;
    email: string;
    role: string;
    is_subscribed: boolean;
    subscription_end?: string;
    trial_start?: string;
    trial_end?: string;
    last_seen?: string;
    unlocked_tools: string[]; // List of tool IDs unlocked via keys
}

export enum ToolId {
    XML_RENUMBER = 'xmlRenumber',
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
    REF_PURGER = 'refPurger',
    GRANT_TAGGER = 'grantTagger',
    ID_AUDITOR = 'idAuditor',
    COMMENT_REPLACER = 'commentReplacer',
    CITATION_LINKER = 'citationLinker',
    JM_QUERY_GEN = 'jmQueryGen',
    DOCS = 'docs',
    DASHBOARD = 'dashboard'
}