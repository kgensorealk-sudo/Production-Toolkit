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
import { sanitizeOutput, KeeperUserContext, KEEPER_CONTACT_ADMIN_NOTICE } from '../utils/keeperEngine';
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
            tagline: 'Ready for your next task.'
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
 * Generates the fresh sandbox welcome message for Keeper.
 */
export const generateKeeperWelcomeMessage = (): Message => ({
    id: `init-welcome-${Date.now()}`, role: 'assistant', timestamp: Date.now(),
    content: 'Hello, I am Keeper. This is a fresh sandbox. Tell me what you want to do and provide any rules or examples I should follow.'
});

const ROUTE_TOOL_NAMES: Record<string, string> = {};
const SCENARIO_CATEGORIES: { category: string; items: { label: string; prompt: string }[] }[] = [];

const STORAGE_KEY = 'prod_toolkit_keeper_messages_factory_v1';
const LAST_DATE_KEY = 'prod_toolkit_keeper_factory_last_date';

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
    const [taskInstructions, setTaskInstructions] = useState('');
    useEffect(() => {
        if (promptRequest) setInputPrompt(promptRequest.text);
    }, [promptRequest]);
    const [isLoading, setIsLoading] = useState(false);
    const [currentlyTypingId, setCurrentlyTypingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [hasUnread, setHasUnread] = useState(false);
    const [successCelebration, setSuccessCelebration] = useState(false);
    const [isLazyMode, setIsLazyMode] = useState(false);

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
            return localStorage.getItem('keeper_factory_scenarios_expanded') === 'true';
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
            for (let version = 1; version <= 9; version++) localStorage.removeItem('prod_toolkit_keeper_messages_v' + version);
            localStorage.removeItem('prod_toolkit_keeper_last_date');
            localStorage.removeItem('keeper_scenarios_expanded');


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
                    return parsed.filter((m: Message) => !/offline-keeper/.test(m.modelUsed || '') && !/Lazy Offline Mode|editorial brain is fully loaded|office rug|off-grid or snoozing/i.test(m.content || '')).map((m: Message) => ({
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
                setInputPrompt(content);
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
            localStorage.setItem('keeper_factory_scenarios_expanded', JSON.stringify(showScenarios));
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
        setTaskInstructions('');
        setResetNotice('Sandbox cleared. Keeper is ready for your next task.');
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
        const source = (textToSend || inputPrompt).trim();
        const text = [taskInstructions.trim() ? 'Task instructions:\n' + taskInstructions.trim() : '', source ? 'Source material:\n' + source : ''].filter(Boolean).join('\n\n');
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
            const subscriptionLockReply = 'An active subscription is required to chat with Keeper.';

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
                                reply: 'An active subscription is required to chat with Keeper.',
                                modelUsed: 'keeper-subscription-lock'
                            };
                        }
                        throw new Error(errData.error || `Request failed with status ${response.status}`);
                    }

                    const data = await response.json();
                    return {
                        reply: data.offline ? KEEPER_CONTACT_ADMIN_NOTICE : data.reply || 'No response generated.',
                        modelUsed: data.modelUsed,
                        offline: Boolean(data.offline),
                        faqTopics: data.faqTopics,
                        note: data.note
                    };
                } catch (err: any) {
                    console.warn("Keeper live AI connection unavailable:", err?.message || err);
                    return { reply: KEEPER_CONTACT_ADMIN_NOTICE, modelUsed: 'keeper-connection-unavailable' };
                }
            })();

            const responseData = await generateResponsePromise;

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
    // label, which never reflected what actually answered (the connected AI provider).
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const lastModelBadge = getModelBadgeInfo(lastAssistantMessage?.modelUsed);

    return (
        <section aria-label="Keeper sandbox" className="space-y-5">
            {resetNotice && <p role="status" className="rounded-xl bg-indigo-50 text-indigo-700 px-4 py-3 text-sm">{resetNotice}</p>}
            {showResetConfirm && <div role="alertdialog" aria-label="Reset Keeper workspace" className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex flex-wrap items-center gap-3"><p className="text-sm flex-1">Clear instructions, source material, and previous results?</p><button onClick={() => setShowResetConfirm(false)} className="text-sm px-3 py-2">Cancel</button><button onClick={executeResetChat} disabled={isLoading} className="text-sm bg-slate-900 text-white px-3 py-2 rounded-lg disabled:opacity-40">Clear workspace</button></div>}
            <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 items-start">
                <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-widest font-bold text-indigo-500">01 / Prepare</p><h2 className="font-semibold text-slate-900 mt-1">Task workspace</h2></div><button onClick={() => setShowResetConfirm(true)} disabled={isLoading} className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-40 flex items-center gap-2"><RotateCcw size={14} /> Clear</button></div>
                    <div className="p-6">
                        <label htmlFor="keeper-instructions" className="text-sm font-semibold text-slate-800">What should Keeper do?</label>
                        <p className="text-xs text-slate-500 mt-1 mb-3">Include the rules, format, or examples you want him to follow.</p>
                        <textarea id="keeper-instructions" value={taskInstructions} onChange={e => setTaskInstructions(e.target.value)} disabled={isLoading} placeholder="Describe your task and expected output…" className="w-full min-h-[130px] p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed resize-y outline-none focus:ring-2 focus:ring-indigo-400" />
                        <div className="flex items-center justify-between mt-6 mb-3"><label htmlFor="keeper-task-input" className="text-sm font-semibold text-slate-800">Source material <span className="font-normal text-slate-400 ml-1">Optional</span></label><button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5 disabled:opacity-40"><Paperclip size={14} /> Import file</button></div>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xml,.html,.txt" className="hidden" />
                        <textarea id="keeper-task-input" ref={textareaRef} value={inputPrompt} onChange={e => setInputPrompt(e.target.value)} disabled={isLoading} placeholder="Paste text, XML, or an example here…" className="w-full min-h-[290px] p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed font-mono resize-y outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{(inputPrompt.length + taskInstructions.length).toLocaleString()} characters</span><button onClick={() => handleSendMessage()} disabled={(!inputPrompt.trim() && !taskInstructions.trim()) || isLoading || Boolean(currentlyTypingId)} className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-indigo-700 transition-colors">{isLoading ? 'Working…' : currentlyTypingId ? 'Preparing result…' : 'Run task'}<ArrowRight size={16} /></button></div>
                </section>
                <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest font-bold text-indigo-500">02 / Review</p><h2 className="font-semibold text-slate-900 mt-1">Result</h2></div><div className="flex items-center gap-3">{currentlyTypingId && <button onClick={handleSkipTyping} className="text-xs text-indigo-600">Show full result</button>}{lastAssistantMessage && <button onClick={() => copyToClipboard(lastAssistantMessage.content, lastAssistantMessage.id)} className="inline-flex items-center gap-2 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2"><Copy size={13} />{copiedId === lastAssistantMessage.id ? 'Copied' : 'Copy result'}</button>}</div></div>
                    <div ref={messagesContainerRef} aria-live="polite" aria-busy={isLoading || Boolean(currentlyTypingId)} className="min-h-[550px] max-h-[800px] overflow-y-auto p-6">
                        {lastAssistantMessage ? <div className="prose prose-sm max-w-none text-slate-800 break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a: ({children}) => <span>{children}</span>}}>{lastAssistantMessage.content}</ReactMarkdown></div> : <div className="min-h-[500px] flex flex-col justify-center items-center text-center"><div className="bg-indigo-50 text-indigo-400 rounded-2xl p-5 mb-5"><FileText size={30} strokeWidth={1.4} /></div><h3 className="font-semibold text-slate-700">A blank canvas</h3><p className="text-sm text-slate-400 mt-2 max-w-[260px] leading-relaxed">Your result will appear here. Start with a task and any material Keeper needs.</p></div>}
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between text-xs text-slate-400"><span>{lastAssistantMessage ? lastModelBadge.label : 'Ready when you are'}</span><span>Results stay in this sandbox</span></div>
                </section>
            </div>
            {messages.some(message => message.role === 'assistant') && <details className="border border-slate-200 rounded-xl bg-white p-5"><summary className="text-sm font-semibold text-slate-600 cursor-pointer">Session history</summary><div className="space-y-4 mt-4">{messages.map(message => <div key={message.id} className="border-t border-slate-100 pt-4"><p className="text-xs font-semibold text-slate-400 mb-2">{message.role === 'user' ? 'Your input' : 'Keeper result'} · {new Date(message.timestamp).toLocaleString()}</p><pre className="text-sm whitespace-pre-wrap break-words font-sans text-slate-700">{message.content}</pre></div>)}</div></details>}
        </section>
    );
};

export default KeeperSandbox;
