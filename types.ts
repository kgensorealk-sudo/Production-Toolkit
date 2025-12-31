
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

export enum ToolId {
    XML_RENUMBER = 'xmlRenumber',
    CREDIT_GENERATOR = 'creditGenerator',
    QUICK_DIFF = 'quickDiff',
    TAG_CLEANER = 'tagCleaner',
    TABLE_FIXER = 'tableFixer',
    HIGHLIGHTS_GEN = 'highlightsGen',
    VIEW_SYNC = 'viewSync',
    REFERENCE_GEN = 'referenceGen',
    DOCS = 'docs',
    DASHBOARD = 'dashboard'
}

export interface UserProfile {
    id: string;
    email?: string; // Added for display in Admin
    role: 'admin' | 'user';
    is_subscribed: boolean;
    subscription_start?: string | null;
    subscription_end?: string | null;
    trial_start?: string | null;
    trial_end?: string | null;
    created_at?: string; // Added for sorting
}
