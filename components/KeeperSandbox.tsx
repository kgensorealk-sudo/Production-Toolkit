import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

import {
    Sparkles,
    X,
    Send,
    RotateCcw,
    Copy,
    Check,
    ChevronDown,
    ChevronUp,
    Minus,
    Maximize2,
    Minimize2,
    User,
    Cpu,
    ExternalLink,
    Compass,
    AlertTriangle,
    ArrowRight,
    FileText,
    GripHorizontal,
    Pin,
    Zap,
    Paperclip
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { isExperimentalTool, getToolInfo } from '../utils/toolRegistry';
import { startTypingSimulation, TypingSimulatorController } from '../utils/typingSimulator';
import { generateOfflineKeeperResponse, sanitizeOutput, KeeperUserContext, OFFLINE_FAQ_TOPICS, KEEPER_CONTACT_ADMIN_NOTICE, getOfflineFaqResponse } from '../utils/keeperEngine';
import { KeeperAvatar, KeeperState } from './KeeperAvatar';
import { supabase } from '../supabaseClient';

const keeperAvatar = '/keeper_avatar.jpg';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    /** Which backend produced this reply — e.g. 'gemini-3.7-flash', 'gpt-5.4-mini',
     *  or one of the offline-engine variants ('offline-keeper', 'offline-keeper-fallback',
     *  'offline-keeper-recovery'). Undefined for user messages and legacy stored messages. */
    modelUsed?: string;
}

/**
 * Turns a raw modelUsed string from the API (or the client-side offline catch path)
 * into a short display label plus whether it represents a degraded/offline answer.
 * This exists so the UI never has to hardcode a provider name again — previously the
 * header always said "Gemini AI" regardless of which model (or the offline engine)
 * actually generated the reply, because data.modelUsed from the API was being discarded.
 */
export const getModelBadgeInfo = (modelUsed?: string): { label: string; isOffline: boolean } => {
    if (!modelUsed) {
        return { label: 'Editorial AI', isOffline: false };
    }
    if (modelUsed === 'keeper-subscription-lock') {
        return { label: '🔒 Subscribed Only', isOffline: false };
    }
    if (modelUsed.startsWith('offline-keeper')) {
        return { label: '😴 Lazy Mode (Offline)', isOffline: true };
    }
    if (modelUsed === 'gpt-4o' || modelUsed === 'gpt-4o-mini') {
        return { label: `OpenAI (${modelUsed})`, isOffline: false };
    }
    if (modelUsed.startsWith('gpt')) {
        return { label: 'OpenAI GPT', isOffline: false };
    }
    if (modelUsed.startsWith('gemini')) {
        return { label: `Gemini (${modelUsed.replace('gemini-', '')})`, isOffline: false };
    }
    return { label: modelUsed, isOffline: false };
};

/**
 * Formats a message timestamp for display under a chat bubble — just the local
 * time (e.g. "2:41 PM"), since the date is already implied by the daily-reset behavior.
 */
export const formatMessageTime = (timestamp: number): string => {
    try {
        return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
        return '';
    }
};

interface KeeperSandboxProps {
    promptRequest?: { text: string; id: number };
}

export interface DogGreetingInfo {
    period: 'morning' | 'afternoon' | 'evening' | 'night';
    timeLabel: string;
    greeting: string;
    tagline: string;
}

/**
 * Returns greeting info based on the user's current local time of day.
 */
export const getTimeOfDayDogGreeting = (date: Date = new Date()): DogGreetingInfo => {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) {
        return {
            period: 'morning',
            timeLabel: 'Morning Shift',
            greeting: 'Good morning!',
            tagline: 'Ears perked and ready for today\'s editorial proofs!'
        };
    } else if (hour >= 12 && hour < 17) {
        return {
            period: 'afternoon',
            timeLabel: 'Afternoon Shift',
            greeting: 'Good afternoon!',
            tagline: 'Paws on keyboard — ready to power through proofs and citations!'
        };
    } else if (hour >= 17 && hour < 22) {
        return {
            period: 'evening',
            timeLabel: 'Evening Shift',
            greeting: 'Good evening!',
            tagline: 'Double-checking references and tags before final sign-off!'
        };
    } else {
        return {
            period: 'night',
            timeLabel: 'Late Night Shift',
            greeting: 'Good evening!',
            tagline: 'Loyal night watch — ready for late-night production proofing!'
        };
    }
};

/**
 * Helper to get the current date in YYYY-MM-DD local format for daily reset tracking.
 */
export const getTodayDateKey = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Generates the clean, charming editorial welcome message for Keeper.
 */
export const generateKeeperWelcomeMessage = (): Message => {
    const hour = new Date().getHours();
    let timeGreeting = "Good afternoon";
    if (hour >= 5 && hour < 12) {
        timeGreeting = "Good morning";
    } else if (hour >= 12 && hour < 17) {
        timeGreeting = "Good afternoon";
    } else {
        timeGreeting = "Good evening";
    }

    const content = `### **${timeGreeting}! 🐾 Keeper at your service.**

I'm your trusty Japanese Spitz Editorial AI companion — equipped with a keen nose for broken citations, malformed XML nodes, and tricky Journal Manager (JM) queries!

---

#### **What We Can Tackle Together:**

**1. 📝 Standardized Journal Manager (JM) Queries**
Formulate protocol-compliant queries ready for the JM:
* **Authorship & Order Changes:** *Query to JM: The authors requested to exchange the positions of the second and third authors (Yiqi Wang and Wei Peng). A signed authorship change form has been submitted to the journal.*
* **Author Name Corrections:** *Query to JM: Author requested to change the author name from [Original] to [Amended]*
* **Corresponding Author Email:** *Query to JM: Corresponding author email address is required, so either disregard or let the author provide*
* **Figure & Artwork Updates:** *Query to JM: The author provided a replacement for Figure 3 with data changes*
* **Uncited Citations:** *Query to JM: Reference [14] is uncited in the text body*

**2. 🏷️ Journal XML & Structure Specifications**
* Assistance with \`<sb:reference>\` structures, \`<ce:cross-ref>\` linking, CRediT contributor taxonomy, grant tags, and table footnotes.

**3. 🧭 Workflow Navigation & Tool Discovery**
* Let me fetch the exact tool you need among our 18 production modules for affiliation ID sequencing, reference renumbering, citation linking, or MS Word conversion!

---
*Pick a quick prompt below or paste raw author notes directly into the box! 🐾*`;

    return {
        id: `init-welcome-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: Date.now()
    };
};

const ROUTE_TOOL_NAMES: Record<string, string> = {
    '/affiliationSequencer': 'Open Affiliation Sequencer',
    '/affiliationIdSequencer': 'Open Affiliation Sequencer',
    '/affiliation-id-normalizer': 'Open Affiliation Sequencer',
    '/viewSync': 'Open View Synchronizer',
    '/quickDiff': 'Open Quick Text Diff',
    '/uncitedCleaner': 'Open Uncited Ref Cleaner',
    '/xmlRenumber': 'Open XML Normalizer',
    '/citationLinker': 'Open Citation Linker Pro',
    '/structuralArchitect': 'Open Reference Structure Repair',
    '/creditGenerator': 'Open CRediT Tagging',
    '/wordToXml': 'Open MS Word to XML Converter',
    '/tableBeautifier': 'Open Table XML Beautifier',
    '/tableFixer': 'Open XML Table Fixer',
    '/grantTagger': 'Open Grant Tagger',
    '/idAuditor': 'Open ID Prefix Auditor',
    '/refExtractor': 'Open Bibliography Extractor',
    '/tagCleaner': 'Open XML Tag Cleaner',
    '/highlightsGen': 'Open Article Highlights Gen',
    '/referenceGen': 'Open Reference Updater',
    '/otherRefScanner': 'Open Other-Ref Scanner',
    '/dashboard': 'Workspace Dashboard',
    '/admin': 'Admin Portal',
    '/settings': 'Account Settings & Subscriptions',
    '/login': 'Log In / Register',
};

const SCENARIO_CATEGORIES = [
    {
        category: '📝 Master JM Queries',
        items: [
            { label: 'Author Order / Authorship Query', prompt: 'Query to JM: The authors requested to exchange the positions of the second and third authors (Yiqi Wang and Wei Peng). A signed authorship change form has been submitted to the journal.' },
            { label: 'Author Name Change Query', prompt: 'Query to JM: Author requested to change the author name from Muhammed Afnas "Villayateri" to "Vilayatteri"' },
            { label: 'Corresponding Author Email Query', prompt: 'Query to JM: Corresponding author email address is required, so either disregard or let the author provide' },
            { label: 'Figure Replacement Query', prompt: 'Query to JM: The author provided a replacement for Figure 3. However, it\'s unclear whether the reason for this replacement is quality improvement, the addition or removal of elements, or changed content. Could you please validate if we can proceed with the new version?' },
            { label: 'Uncited Reference in Text Body', prompt: 'Query to JM: Reference [14] is uncited in the text body. Kindly ask author for citation or confirmation to delete.' },
            { label: 'Figure Panel Label Mismatch', prompt: 'Query to JM: Panels (c) and (d) are mentioned in the caption for Figure 2 but are not found in the artwork. Please check and amend as necessary.' }
        ]
    },
    {
        category: '🔢 Citations & References',
        items: [
            { label: 'Renumber references & callouts', prompt: 'Which tool should I use when references or citation callouts are out of order in the body text, and how does it work?' },
            { label: 'Link plain-text citations', prompt: 'What tool connects unlinked in-text citations like "[1-3]" or "(Smith et al., 2021)" to bibliography entries with <ce:cross-ref> tags?' },
            { label: 'Repair broken XML reference nodes', prompt: 'How do I audit and auto-repair malformed reference XML, missing <sb:reference> tags, and unformatted author initials using Reference Structure Repair?' },
            { label: 'Purge uncited bibliography entries', prompt: 'Which tool detects bibliography references that are never cited in the text body and allows safe purging?' },
            { label: 'Audit ID prefixes & cross-links', prompt: 'Which tool audits and normalizes reference ID prefixes (e.g. bib0010 vs b1) and synchronizes internal document cross-links?' }
        ]
    },
    {
        category: '🛠️ XML Markup & Document Utilities',
        items: [
            { label: 'Sequence Affiliation IDs (+5 Increments)', prompt: 'How do I use the Affiliation Sequencer to renumber <ce:affiliation> IDs sequentially in increments of 5 (af0005, af0010, af0015...) while preserving affiliation-id?' },
            { label: 'Upstream Feedback: Leftover Uncited Section', prompt: 'I received an upstream feedback because i forgot to remove the Uncited Reference section. What should I do to fix and validate this?' },
            { label: 'Synchronize paragraph views (compact vs extended)', prompt: 'How do I synchronize and mirror text edits and citation callouts between compact and extended paragraph views using View Synchronizer?' },
            { label: 'Convert Word text to Journal XML', prompt: 'Which tool converts formatted text from MS Word with bold, italics, chemical subscripts (<ce:inf>), and superscripts (<ce:sup>) into standard Journal CE XML?' },
            { label: 'Tag author CRediT roles', prompt: 'How do I use the CRediT Tagging tool to convert informal author contribution statements into NISO CRediT XML (<ce:contributor-role>)?' },
            { label: 'Table footnotes & legend notes', prompt: 'Which tool manages and relocates table footnotes (<ce:table-footnote>) and table legend notes?' },
            { label: 'Tag research grants & sponsors', prompt: 'How do I tag funding sponsors and award numbers with <ce:grant-sponsor> and <ce:grant-number>?' },
            { label: 'Dashboard Editorial Tools Guide', prompt: 'Which tools are available in the Production Toolkit Pro dashboard console, and how do they streamline production workflows?' }
        ]
    },
    {
        category: '👤 Account, Subscription & Access',
        items: [
            { label: 'Check My Subscription & Role', prompt: 'What is my current subscription status, account tier, and system role (Admin or not)?' },
            { label: 'Identify User Subscription Status', prompt: 'Can you identify user subscription statuses and explain how subscription tiers and admin privileges work in Production Toolkit Pro?' },
            { label: 'How to unlock tools or renew', prompt: 'How do I activate or renew my subscription and unlock production tools using an access key?' }
        ]
    }
];

const STORAGE_KEY = 'prod_toolkit_keeper_messages_v9';
const LAST_DATE_KEY = 'prod_toolkit_keeper_last_date';

export const KeeperSandbox: React.FC<KeeperSandboxProps> = ({ promptRequest }) => {
    const currentTool: ToolId | undefined = undefined;
    const { user, profile, isAdmin, freeTools, session } = useAuth();


    const isExpLocation = false;
    const isExpTool = isExperimentalTool(currentTool);
    const isExperimental = isExpTool || isExpLocation;
    const currentToolInfo = getToolInfo(currentTool);

    // Subscription status check: active subscription or admin privilege required to converse with Keeper
    const hasActiveSubscription = Boolean(
        isAdmin || (profile?.is_subscribed && (!profile?.subscription_end || new Date(profile.subscription_end) >= new Date()))
    );

    // Visibility & Open state
    const isVisible=true;
    const isOpen=true;
    const isExpanded=true;
    const [inputPrompt, setInputPrompt] = useState('');
    useEffect(() => {
        if (promptRequest) setInputPrompt(promptRequest.text);
    }, [promptRequest]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentlyTypingId, setCurrentlyTypingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [hasUnread, setHasUnread] = useState(false);
    const [successCelebration, setSuccessCelebration] = useState(false);
    const [isLazyMode, setIsLazyMode] = useState(false);

    // Offline FAQ mode: when the backend (or a network failure) signals `offline: true`,
    // Keeper stops accepting free text entirely and shows a fixed topic list instead —
    // free-text classification is what caused wrong/confusing answers, so once we know
    // the live models are down, don't keep guessing from typed text.
    const [isOfflineFaqMode, setIsOfflineFaqMode] = useState(false);
    const [offlineFaqTopics, setOfflineFaqTopics] = useState<{ id: string; label: string }[]>(
        OFFLINE_FAQ_TOPICS.map(({ id, label }) => ({ id, label }))
    );
    const [offlineNotice, setOfflineNotice] = useState<string>(KEEPER_CONTACT_ADMIN_NOTICE);

    // Inactivity timer to trigger lazy mode (power nap)
    useEffect(() => {
        let timer: any;
        if (!isLoading && !currentlyTypingId && inputPrompt.trim() === '') {
            timer = setTimeout(() => {
                setIsLazyMode(true);
            }, 60000); // 1 minute of idle without typing triggers cozy dog nap
        } else {
            setIsLazyMode(false);
        }
        return () => clearTimeout(timer);
    }, [isLoading, currentlyTypingId, inputPrompt]);

    // Calculate dynamic keeper state
    const currentKeeperState: KeeperState = (() => {
        if (isLoading || currentlyTypingId) return 'thinking';
        if (successCelebration) return 'success';
        if (inputPrompt.trim().length > 0) return 'listening';
        if (isLazyMode) return 'lazy';
        return 'idle';
    })();

    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetNotice, setResetNotice] = useState<string | null>(null);

    // Space-saving: Common Editorial Scenarios Collapsible state
    const [showScenarios, setShowScenarios] = useState<boolean>(() => {
        try {
            return localStorage.getItem('keeper_scenarios_expanded') === 'true';
        } catch (e) {
            return false;
        }
    });

    // Chat messages - starts empty by default so user sees the clean centered Keeper welcome hero profile
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            // Clean up legacy storage versions
            localStorage.removeItem('prod_toolkit_keeper_messages_v1');
            localStorage.removeItem('prod_toolkit_keeper_messages_v2');
            localStorage.removeItem('prod_toolkit_keeper_messages_v3');
            localStorage.removeItem('prod_toolkit_keeper_messages_v4');
            localStorage.removeItem('prod_toolkit_keeper_messages_v6');
            localStorage.removeItem('prod_toolkit_keeper_messages_v8');


            const today = getTodayDateKey();
            const lastActiveDate = localStorage.getItem(LAST_DATE_KEY);

            // If it's a new day or first session, start fresh for the day
            if (lastActiveDate !== today) {
                localStorage.setItem(LAST_DATE_KEY, today);
                localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
                return [];
            }

            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((m: Message) => ({
                        ...m,
                        content: typeof m.content === 'string'
                            ? sanitizeOutput(m.content)
                            : m.content
                    }));
                }
            }
        } catch (e) {}
        try {
            localStorage.setItem(LAST_DATE_KEY, getTodayDateKey());
            localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        } catch (e) {}
        return [];
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingControllerRef = useRef<TypingSimulatorController | null>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                handleSendMessage(`Here is the manuscript file content (${file.name}):\n\n${content}`);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Cleanup typing animation if component unmounts
    useEffect(() => {
        return () => {
            typingControllerRef.current?.stop();
        };
    }, []);

    // Daily reset watcher: Checks if date changed while tab was open or focused
    useEffect(() => {
        const checkDailyRollover = () => {
            try {
                const today = getTodayDateKey();
                const lastDate = localStorage.getItem(LAST_DATE_KEY);
                if (lastDate && lastDate !== today) {
                    localStorage.setItem(LAST_DATE_KEY, today);
                    typingControllerRef.current?.stop();
                    setCurrentlyTypingId(null);
                    setMessages([]);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
                }
            } catch (e) {}
        };

        window.addEventListener('focus', checkDailyRollover);
        document.addEventListener('visibilitychange', checkDailyRollover);
        const intervalId = setInterval(checkDailyRollover, 60000); // Check every minute

        return () => {
            window.removeEventListener('focus', checkDailyRollover);
            document.removeEventListener('visibilitychange', checkDailyRollover);
            clearInterval(intervalId);
        };
    }, []);

    // Auto-scroll helpers (contained strictly inside messagesContainerRef to prevent covering bottom controls)
    const scrollToBottom = (smooth = true) => {
        if (messagesContainerRef.current) {
            if (smooth) {
                messagesContainerRef.current.scrollTo({
                    top: messagesContainerRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
        }
    };

    const scrollToTop = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = 0;
        }
    };

    useEffect(() => {
        if (isOpen) {
            setHasUnread(prev => (prev ? false : prev));
            if (messages.length === 0) {
                // When opening an empty or fresh conversation, ensure scroll starts at the top to see Keeper's face
                scrollToTop();
                const timer = setTimeout(() => {
                    scrollToTop();
                    textareaRef.current?.focus({ preventScroll: true });
                }, 80);
                return () => clearTimeout(timer);
            } else {
                scrollToBottom(false);
                const timer = setTimeout(() => {
                    textareaRef.current?.focus({ preventScroll: true });
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && messages.length > 0) {
            scrollToBottom(true);
        }
    }, [isOpen, messages.length]);

    // Persist messages to local storage (only when not actively typing keystrokes)
    useEffect(() => {
        if (!currentlyTypingId) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
            } catch (e) {}
        }
    }, [messages, currentlyTypingId]);

    // Persist scenarios expanded state
    useEffect(() => {
        try {
            localStorage.setItem('keeper_scenarios_expanded', JSON.stringify(showScenarios));
        } catch (e) {}
    }, [showScenarios]);

    const executeResetChat = () => {
        typingControllerRef.current?.stop();
        setCurrentlyTypingId(null);
        setMessages([]);
        try {
            localStorage.setItem(LAST_DATE_KEY, getTodayDateKey());
            localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        } catch (e) {}
        setShowResetConfirm(false);
        setInputPrompt('');
        setResetNotice('Chat refreshed! Keeper is ready for your next manuscript task. 🐾');
        setTimeout(() => setResetNotice(null), 3000);
        setTimeout(() => {
            scrollToTop();
            textareaRef.current?.focus({ preventScroll: true });
        }, 100);
    };

    const handleSkipTyping = () => {
        if (typingControllerRef.current) {
            typingControllerRef.current.skip();
            setSuccessCelebration(true);
            setTimeout(() => setSuccessCelebration(false), 2600);
        }
    };

    /** Builds the KeeperUserContext payload shared between free-text chat and FAQ-topic selection. */
    const buildUserContextPayload = (): KeeperUserContext => ({
        email: user?.email,
        displayName: profile?.display_name || user?.email?.split('@')[0],
        isAdmin,
        isSubscribed: profile?.is_subscribed,
        subscriptionTier: profile?.subscription_tier,
        subscriptionEnd: profile?.subscription_end ? new Date(profile.subscription_end).toLocaleDateString() : undefined,
        unlockedTools: profile?.unlocked_tools,
        freeTools
    });

    const handleSendMessage = async (textToSend?: string) => {
        const text = (textToSend || inputPrompt).trim();
        if (!text || isLoading) return;

        // If Keeper is currently typing out a previous message, skip to end before sending new message
        if (currentlyTypingId) {
            handleSkipTyping();
        }

        const userMessage: Message = {
            id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            role: 'user',
            content: text,
            timestamp: Date.now()
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);


        // Subscription Enforcement: Keeper only responds to users with active subscriptions or admin privileges
        if (!hasActiveSubscription) {
            const subscriptionLockReply = `### 🐾 **Subscription Required to Chat with Keeper**

Woof! Keeper's editorial AI assistant, automated Journal Manager (JM) query drafting, and XML manuscript diagnostics are reserved exclusively for members with an **Active Subscription**.

---

#### 🔒 **What is included with a Subscription:**
* **📝 Standardized JM Queries:** One-click drafting for authorship changes, email corrections, figure replacements, and uncited reference queries.
* **🏷️ Full XML & DTD Diagnostic Support:** Deep-dive assistance with \`<sb:reference>\`, \`<ce:cross-ref>\`, and CRediT taxonomy.
* **🧭 Workflow Automation & Tool Routing:** Immediate guidance and XML transforms across all 18+ editorial modules.

${user ? '👉 **[Go to Account Settings & Subscriptions](#/settings)** to activate or renew your subscription.' : '👉 **[Log In / Register](#/login)** to access your subscribed account.'}`;

            const assistantMessageId = `ast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            const initialAssistantMessage: Message = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                modelUsed: 'keeper-subscription-lock'
            };

            setIsLoading(false);
            setMessages(prev => [...prev, initialAssistantMessage]);
            setCurrentlyTypingId(assistantMessageId);
            if (!isOpen) {
                setHasUnread(true);
            }
            scrollToBottom(true);

            typingControllerRef.current = startTypingSimulation({
                fullText: subscriptionLockReply,
                onUpdate: (displayedText) => {
                    setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: displayedText } : m));
                    if (messagesContainerRef.current) {
                        const container = messagesContainerRef.current;
                        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
                        if (isNearBottom) {
                            container.scrollTop = container.scrollHeight;
                        }
                    }
                },
                onComplete: () => {
                    setCurrentlyTypingId(null);
                    typingControllerRef.current = null;
                }
            });
            return;
        }

        setIsLoading(true);

        try {
            const dogGreeting = getTimeOfDayDogGreeting();
            const timeContext = `User's local time of day: ${dogGreeting.timeLabel} (${new Date().toLocaleTimeString()}).`;

            const userAuthContext = user ? `
User Account & Subscription Context:
- User Email: ${user.email || 'Unknown'}
- Display Name: ${profile?.display_name || user.email?.split('@')[0] || 'User'}
- System Role: ${isAdmin ? 'Admin (Full Master Privileges & Unrestricted Access)' : (profile?.role || 'Standard User')}
- Is Admin: ${isAdmin ? 'Yes' : 'No'}
- Subscription Status: ${isAdmin ? 'Active (Admin Master Tier)' : (profile?.is_subscribed ? 'Active' : 'Inactive / Expired')}
- Subscription Tier: ${profile?.subscription_tier || (isAdmin ? 'master_admin' : 'none')}
- Subscription Expiry: ${profile?.subscription_end ? new Date(profile?.subscription_end).toLocaleDateString() : (isAdmin ? 'Unlimited / Perpetual' : 'Not set')}
- Unlocked Tools: ${profile?.unlocked_tools && profile.unlocked_tools.length > 0 ? profile.unlocked_tools.join(', ') : 'None'}
- Active Free Trial Tools: ${freeTools && freeTools.length > 0 ? freeTools.join(', ') : 'None'}
` : `
User Account & Subscription Context:
- Authentication: Guest / Unauthenticated
- Subscription Status: Inactive (Guest)
- System Role: Guest (Not Admin)
- Is Admin: No
`;

            // Context description
            const contextInfo = `${isExperimental
                ? `CRITICAL DIRECTIVE: The user is currently WORKING WITH AN EXPERIMENTAL VERSION in Production Toolkit Pro ("${currentToolInfo?.name || currentTool || 'Experimental Protocol'}").
⚠️ MANDATORY INSTRUCTION: Because this tool is an EXPERIMENTAL VERSION, it is NOT YET FULLY ESTABLISHED.
In your response:
1. You MUST prominently warn the user with an explicit warning at the start of your message:
   "⚠️ **Notice: Experimental Version in Use** — You are currently using an experimental version of this tool (${currentToolInfo?.name || currentTool}), which is not yet fully established. Please inspect and verify all generated XML outputs, renumbered tags, or cross-references carefully before applying them to production manuscripts."
2. Explain clearly what caution to take.
3. ${currentToolInfo?.stableAlternative ? `Inform them that the established production version is available at [${currentToolInfo.stableAlternative.name}](#${currentToolInfo.stableAlternative.route}) for verified stability.` : 'Remind them to verify outputs against standard DTD v5.6 / JATS XML guidelines.'}
${timeContext}`
                : currentTool
                    ? `The user is currently using the "${currentToolInfo?.name || currentTool}" module in Production Toolkit Pro. ${timeContext}`
                    : `The user is inside the isolated Keeper sandbox. Work only with content provided in this conversation. Do not open, operate, read, or modify any other tool or its workspace. ${timeContext}`}

${userAuthContext}`;

            const userContextPayload: KeeperUserContext = buildUserContextPayload();

            const payloadMessages = newMessages
                .filter(m => !m.id.startsWith('init-'))
                .slice(-10) // Keep last 10 messages for context
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));

            const generateResponsePromise = (async () => {
                try {
                    const sessionData = await supabase.auth.getSession();
                    const token = sessionData?.data?.session?.access_token || session?.access_token;

                    const response = await fetch('/api/ai/chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify({
                            messages: payloadMessages.length > 0 ? payloadMessages : [{ role: 'user', content: text }],
                            context: contextInfo
                        })
                    });

                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        if (response.status === 401 || response.status === 403 || errData.code === 'SUBSCRIPTION_REQUIRED') {
                            return {
                                reply: `### 🐾 **Subscription Required to Chat with Keeper**\n\nWoof! Keeper's editorial AI assistant is available exclusively to active subscribers.\n\n👉 **[Go to Account Settings & Subscriptions](#/settings)** to verify or activate your subscription plan.`,
                                modelUsed: 'keeper-subscription-lock'
                            };
                        }
                        throw new Error(errData.error || `Request failed with status ${response.status}`);
                    }

                    const data = await response.json();
                    return {
                        reply: data.reply || 'No response generated.',
                        modelUsed: data.modelUsed,
                        offline: Boolean(data.offline),
                        faqTopics: data.faqTopics,
                        note: data.note
                    };
                } catch (err: any) {
                    console.warn("AI Chat server fallback to Keeper smart offline engine:", err?.message || err);
                    const offlineReply = generateOfflineKeeperResponse(text, userContextPayload);
                    return {
                        reply: offlineReply,
                        modelUsed: 'offline-keeper',
                        offline: true,
                        faqTopics: OFFLINE_FAQ_TOPICS.map(({ id, label }) => ({ id, label })),
                        note: KEEPER_CONTACT_ADMIN_NOTICE
                    };
                }
            })();

            const responseData = await generateResponsePromise;

            if (responseData.offline) {
                setIsOfflineFaqMode(true);
                setOfflineFaqTopics(responseData.faqTopics || OFFLINE_FAQ_TOPICS.map(({ id, label }) => ({ id, label })));
                setOfflineNotice(responseData.note || KEEPER_CONTACT_ADMIN_NOTICE);
            } else {
                setIsOfflineFaqMode(false);
            }

            const rawContent = responseData.reply;
            const sanitizedContent = sanitizeOutput(rawContent);

            const assistantMessageId = `ast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

            const initialAssistantMessage: Message = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                modelUsed: responseData.modelUsed
            };

            // Switch from "sniffing out" spinner to active typing simulation
            setIsLoading(false);
            setMessages(prev => [...prev, initialAssistantMessage]);
            setCurrentlyTypingId(assistantMessageId);
            if (!isOpen) {
                setHasUnread(true);
            }

            // Scroll container gently to reveal new response without affecting outer page
            scrollToBottom(true);

            // Start swift, human-like typing simulation with realistic cadence
            typingControllerRef.current = startTypingSimulation({
                fullText: sanitizedContent,
                onUpdate: (displayedText) => {
                    setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: displayedText } : m));
                    // Smart scrolling: Only auto-scroll down if user was already at or near the bottom
                    if (messagesContainerRef.current) {
                        const container = messagesContainerRef.current;
                        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
                        if (isNearBottom) {
                            container.scrollTop = container.scrollHeight;
                        }
                    }
                },
                onComplete: () => {
                    setCurrentlyTypingId(null);
                    typingControllerRef.current = null;
                    setSuccessCelebration(true);
                    setTimeout(() => setSuccessCelebration(false), 2600);
                }
            });

        } catch (err: any) {
            console.error("Critical error in AI chat message handling:", err);
            setIsLoading(false);
        }
    };

    /**
     * Deterministic counterpart to handleSendMessage, used only while isOfflineFaqMode
     * is active. Sends `{ topicId }` instead of free text — the selection IS the intent,
     * so there's no keyword classification involved and this can't misfire the way
     * free-text routing can.
     */
    const handleSelectFaqTopic = async (topic: { id: string; label: string }) => {
        if (isLoading) return;
        if (currentlyTypingId) {
            handleSkipTyping();
        }

        const userMessage: Message = {
            id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            role: 'user',
            content: topic.label,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMessage]);

        // Same gate as handleSendMessage: the FAQ is a deterministic subset of the
        // same paid chat feature, not a free side door. A subscription that expires
        // mid-session (while the topic buttons are still on screen) must still hit
        // this wall, not just rely on the server rejecting the request.
        if (!hasActiveSubscription) {
            const subscriptionLockReply = `### 🐾 **Subscription Required to Chat with Keeper**\n\nWoof! Keeper's editorial AI assistant, automated Journal Manager (JM) query drafting, and XML manuscript diagnostics — including this FAQ topic list — are reserved exclusively for members with an **Active Subscription**.\n\n${user ? '👉 **[Go to Account Settings & Subscriptions](#/settings)** to activate or renew your subscription.' : '👉 **[Log In / Register](#/login)** to access your subscribed account.'}`;

            const assistantMessageId = `ast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            setMessages(prev => [...prev, {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                modelUsed: 'keeper-subscription-lock'
            }]);
            setCurrentlyTypingId(assistantMessageId);
            if (!isOpen) {
                setHasUnread(true);
            }
            scrollToBottom(true);

            typingControllerRef.current = startTypingSimulation({
                fullText: subscriptionLockReply,
                onUpdate: (displayedText) => {
                    setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: displayedText } : m));
                },
                onComplete: () => {
                    setCurrentlyTypingId(null);
                    typingControllerRef.current = null;
                }
            });
            return;
        }

        setIsLoading(true);

        let replyText = '';
        let modelUsed = 'offline-keeper-faq';
        let nextTopics = OFFLINE_FAQ_TOPICS.map(({ id, label }) => ({ id, label }));
        let notice = KEEPER_CONTACT_ADMIN_NOTICE;

        try {
            const sessionData = await supabase.auth.getSession();
            const token = sessionData?.data?.session?.access_token || session?.access_token;


            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ topicId: topic.id })
            });

            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            const data = await response.json();
            replyText = data.reply || '';
            modelUsed = data.modelUsed || modelUsed;
            nextTopics = data.faqTopics || nextTopics;
            notice = data.note || notice;
        } catch (netErr) {
            // Even a network failure resolves the topic locally instead of leaving
            // the user stuck — the topic list itself never depends on connectivity.
            console.warn("FAQ topic request failed, resolving locally:", netErr);
            replyText = getOfflineFaqResponse(topic.id, buildUserContextPayload());
        }

        setIsOfflineFaqMode(true);
        setOfflineFaqTopics(nextTopics);
        setOfflineNotice(notice);

        const sanitizedContent = sanitizeOutput(replyText);
        const assistantMessageId = `ast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        setIsLoading(false);
        setMessages(prev => [...prev, {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            modelUsed
        }]);
        setCurrentlyTypingId(assistantMessageId);
        if (!isOpen) {
            setHasUnread(true);
        }
        scrollToBottom(true);

        typingControllerRef.current = startTypingSimulation({
            fullText: sanitizedContent,
            onUpdate: (displayedText) => {
                setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: displayedText } : m));
                if (messagesContainerRef.current) {
                    const container = messagesContainerRef.current;
                    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
                    if (isNearBottom) {
                        container.scrollTop = container.scrollHeight;
                    }
                }
            },
            onComplete: () => {
                setCurrentlyTypingId(null);
                typingControllerRef.current = null;
            }
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape' && currentlyTypingId) {
            e.preventDefault();
            handleSkipTyping();
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (currentlyTypingId) {
                handleSkipTyping();
            }
            handleSendMessage();
        }
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const currentDogGreeting = getTimeOfDayDogGreeting();

    // Most recent assistant reply's model info — replaces the old hardcoded "Gemini AI"
    // label, which never reflected what actually answered (Gemini, OpenAI, or offline).
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const lastModelBadge = getModelBadgeInfo(lastAssistantMessage?.modelUsed);

    return (
        <section aria-label="Keeper sandbox" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div><h3 className="font-semibold text-slate-900">Workspace</h3><p className="text-xs text-slate-500 mt-1">Prepare your input, run a task, and review the result.</p></div>
                <button type="button" onClick={() => setShowResetConfirm(true)} className="text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-2 hover:bg-white">Reset workspace</button>
            </div>
            {showResetConfirm && <div role="alertdialog" aria-label="Reset Keeper workspace" className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex flex-wrap items-center gap-3"><p className="text-sm flex-1">Clear the sandbox input and previous results?</p><button onClick={() => setShowResetConfirm(false)} className="text-sm px-3 py-2">Cancel</button><button onClick={executeResetChat} className="text-sm bg-slate-900 text-white px-3 py-2 rounded-lg">Clear workspace</button></div>}
            <div className="grid xl:grid-cols-2 gap-5">
                <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-200 flex items-center justify-between"><label htmlFor="keeper-task-input" className="font-semibold text-sm text-slate-900">Task input</label><button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="text-sm text-indigo-700 disabled:opacity-50">Import file</button></div>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xml,.html,.txt" className="hidden" />
                    <textarea id="keeper-task-input" ref={textareaRef} value={inputPrompt} onChange={e => setInputPrompt(e.target.value)} placeholder="Describe your task and paste your editorial notes or XML here." disabled={isLoading} className="w-full min-h-[420px] flex-1 p-5 resize-y outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400 text-sm leading-relaxed font-mono text-slate-800" />
                    <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{inputPrompt.length.toLocaleString()} characters</span><button type="button" onClick={() => handleSendMessage()} disabled={!inputPrompt.trim() || isLoading || Boolean(currentlyTypingId)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm disabled:opacity-40 hover:bg-indigo-700">{isLoading ? 'Working…' : currentlyTypingId ? 'Preparing result…' : 'Run task'}</button></div>
                </section>
                <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2"><h3 className="font-semibold text-sm text-slate-900">Result</h3><div className="flex items-center gap-3">{currentlyTypingId && <button onClick={handleSkipTyping} className="text-sm text-indigo-700">Show full result</button>}{lastAssistantMessage && <button onClick={() => copyToClipboard(lastAssistantMessage.content, lastAssistantMessage.id)} className="text-sm text-indigo-700">{copiedId === lastAssistantMessage.id ? 'Copied' : 'Copy result'}</button>}</div></div>
                    <div ref={messagesContainerRef} aria-live="polite" aria-busy={isLoading || Boolean(currentlyTypingId)} className="min-h-[420px] max-h-[650px] flex-1 overflow-y-auto p-5">
                        {lastAssistantMessage ? <div className="prose prose-sm max-w-none text-slate-800 break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a: ({children}) => <span>{children}</span>}}>{lastAssistantMessage.content}</ReactMarkdown></div> : <div className="h-full min-h-[350px] flex flex-col justify-center items-center text-center text-slate-400"><FileText size={32} className="mb-4" /><p className="text-sm font-medium">Your result will appear here</p><p className="text-xs mt-2 max-w-xs">Run a task using content supplied in this sandbox.</p></div>}
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">{lastAssistantMessage ? lastModelBadge.label : 'Ready for input'} · Results stay in Keeper</div>
                </section>
            </div>
            {messages.some(message => message.role === 'assistant') && <details className="border border-slate-200 rounded-xl bg-white p-4"><summary className="text-sm font-semibold text-slate-700 cursor-pointer">Previous results</summary><div className="space-y-4 mt-4">{messages.filter(message => message.role === 'assistant').map(message => <div key={message.id} className="border-t border-slate-100 pt-4"><p className="text-xs text-slate-400 mb-2">{new Date(message.timestamp).toLocaleString()}</p><pre className="text-sm whitespace-pre-wrap break-words font-sans text-slate-700">{message.content}</pre></div>)}</div></details>}
        </section>
    );
};

export default KeeperSandbox;