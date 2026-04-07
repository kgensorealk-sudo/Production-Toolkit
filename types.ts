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

export interface Channel {
    id: string;
    name: string;
    description?: string;
    notes?: string;
    is_private: boolean;
    created_by: string;
    created_at: string;
}

export interface ChannelMember {
    id: string;
    channel_id: string;
    user_id: string;
    role: 'member' | 'admin';
    joined_at: string;
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
    GRANT_TAGGER = 'grantTagger',
    ID_AUDITOR = 'idAuditor',
    COMMENT_REPLACER = 'commentReplacer',
    CITATION_LINKER = 'citationLinker',
    SECTION_AUDITOR = 'sectionAuditor',
    AFFILIATION_SEQUENCER = 'affiliationSequencer',
    STRUCTURAL_ARCHITECT = 'structuralArchitect',
    DOCS = 'docs',
    DASHBOARD = 'dashboard',
    MESSAGING = 'messaging'
}

export interface Message {
    id: string;
    sender_id: string;
    receiver_id: string | null;
    channel_id?: string | null;
    content: string;
    file_url?: string | null;
    file_name?: string | null;
    is_read: boolean;
    created_at: string;
    sender?: UserProfile;
    receiver?: UserProfile;
}

export interface DefaultAvatar {
    id: string;
    url: string;
    name: string;
    created_at: string;
}