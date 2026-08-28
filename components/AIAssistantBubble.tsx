import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router';
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
    Pin
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ToolId } from '../types';
import { isExperimentalTool, getToolInfo } from '../utils/toolRegistry';

const keeperAvatar = '/keeper_avatar.jpg';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface AIAssistantBubbleProps {
    currentTool?: ToolId;
}

export interface DogGreetingInfo {
    period: 'morning' | 'afternoon' | 'evening' | 'night';
    timeLabel: string;
    greeting: string;
    action: string;
    tagline: string;
    bark: string;
}

/**
 * Returns a warm, dog-like greeting based on the user's current local time of day.
 */
export const getTimeOfDayDogGreeting = (date: Date = new Date()): DogGreetingInfo => {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) {
        return {
            period: 'morning',
            timeLabel: 'Morning',
            greeting: 'Good morning!',
            action: '*Perks up fluffy white ears with an energetic morning stretch and happy tail wag!*',
            tagline: 'Ready for the morning editorial watch!',
            bark: 'Woof! Good morning!'
        };
    } else if (hour >= 12 && hour < 17) {
        return {
            period: 'afternoon',
            timeLabel: 'Afternoon',
            greeting: 'Good afternoon!',
            action: '*Trots over happily with an enthusiastic tail wag and bright, cheerful eyes!*',
            tagline: 'Sniffing out citation mismatches and ready to fetch tools!',
            bark: 'Arf arf! Good afternoon!'
        };
    } else if (hour >= 17 && hour < 22) {
        return {
            period: 'evening',
            timeLabel: 'Evening',
            greeting: 'Good evening!',
            action: '*Gives a friendly bark and wags tail attentively, on evening patrol!*',
            tagline: 'Guarding your production manuscripts this evening!',
            bark: 'Woof! Good evening!'
        };
    } else {
        return {
            period: 'night',
            timeLabel: 'Late Night',
            greeting: 'Good evening! Burning the midnight oil?',
            action: '*Sits loyally beside your desk on faithful night-shift watch!*',
            tagline: 'Always by your side to help you polish your files!',
            bark: 'Arf! Working late?'
        };
    }
};

/**
 * Generates the dynamic welcome greeting message with time-of-day canine persona.
 */
export const generateKeeperWelcomeMessage = (): Message => {
    const { greeting, action, tagline } = getTimeOfDayDogGreeting();
    return {
        id: `init-${Date.now()}`,
        role: 'assistant',
        content: `👋 **Woof! ${greeting}** ${action} 🐾

I'm **Keeper**, your Japanese Spitz Editorial AI Companion & Mascot! ${tagline}

### 🐾 What I can fetch for you:
- 📝 **Master JM Query Generator**: Standardized \`TO THE JM:\` queries with proper protocol!
  - Try: \`Query to JM: Author requested name change from X to Y\`
  - Try: \`Query to JM: Figure 3 replaced with content changes\`
  - Try: \`Query to JM: Reference [14] is uncited in the text body\`
- 🧭 **Tool & Scenario Finder**: Tell me your production problem (*"Renumber references"*, *"Connect unlinked citations"*, *"Word to Journal XML"*) and I'll fetch the right tool and route.
- 📜 **DTD v5.6 & JATS XML**: Structuring \`<ce:bib-reference>\`, checking table syntax, and validating CRediT roles.

How can I lend a paw with your manuscripts right now?`,
        timestamp: Date.now()
    };
};

const SCENARIO_CATEGORIES = [
    {
        category: '📝 Master JM Queries',
        items: [
            { label: 'Generate JM Query', prompt: 'Help me create a JM Query' },
            { label: 'Author Name Change Query', prompt: 'Query to JM: Author requested to change the author name from Muhammed Afnas "Villayateri" to "Vilayatteri"' },
            { label: 'Figure Replacement Query', prompt: 'Query to JM: Author provided a replacement for Figure 3 with data changes but without detailed explanation' },
            { label: 'Uncited Reference Query', prompt: 'Query to JM: Reference [14] is uncited in the text body' }
        ]
    },
    {
        category: '🔢 Citations & References',
        items: [
            { label: 'Renumber references & citations', prompt: 'Which tool within this web app should I use when references or citations are out of order, and how does it work?' },
            { label: 'Fix broken cross-ref links', prompt: 'What tool should I use to connect unlinked citation text to bibliography entries with <ce:cross-ref> tags?' },
            { label: 'Remove uncited references', prompt: 'Which tool detects and cleans up bibliography references that are never cited in the body of the article?' },
            { label: 'Deduplicate bibliography', prompt: 'Which tool within this app detects duplicate bibliography entries and merges them?' }
        ]
    },
    {
        category: '🛠️ XML & Word Tools',
        items: [
            { label: 'Convert Word to Journal XML', prompt: 'Which tool converts formatted text from MS Word with bold, italics, superscripts, and subscripts into standard Journal CE XML?' },
            { label: 'Tag author CRediT roles', prompt: 'How do I use the CRediT Tagging tool to convert author contributions statements into NISO CRediT XML?' },
            { label: 'Experimental vs Established tools', prompt: 'Which tools in this app are Experimental Versions, why are they not yet fully established, and when should I use the standard established versions instead?' }
        ]
    }
];

const STORAGE_KEY = 'prod_toolkit_keeper_messages_v3';

export const AIAssistantBubble: React.FC<AIAssistantBubbleProps> = ({ currentTool }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isExpLocation = location.pathname === '/experimental' || location.pathname.toLowerCase().includes('exp');
    const isExpTool = isExperimentalTool(currentTool);
    const isExperimental = isExpTool || isExpLocation;
    const currentToolInfo = getToolInfo(currentTool);

    // Visibility & Open state
    const [isVisible, setIsVisible] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('prod_toolkit_keeper_visible');
            return saved !== null ? JSON.parse(saved) : true;
        } catch (e) {
            return true;
        }
    });

    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [inputPrompt, setInputPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [hasUnread, setHasUnread] = useState(false);

    // Draggable position state
    const [position, setPosition] = useState<{ x: number; y: number }>(() => {
        try {
            const saved = localStorage.getItem('prod_toolkit_keeper_pos');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
                    return parsed;
                }
            }
        } catch (e) {}
        return { x: 0, y: 0 };
    });

    const [isDragging, setIsDragging] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showCloseToast, setShowCloseToast] = useState(false);
    const [resetNotice, setResetNotice] = useState<string | null>(null);

    // Space-saving: Common Editorial Scenarios Collapsible state
    const [showScenarios, setShowScenarios] = useState<boolean>(() => {
        try {
            return localStorage.getItem('keeper_scenarios_expanded') === 'true';
        } catch (e) {
            return false;
        }
    });

    // Chat messages with dog-like time of day greeting
    const [messages, setMessages] = useState<Message[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((m: Message) => ({
                        ...m,
                        content: typeof m.content === 'string'
                            ? m.content
                                .replace(/Elsevier\s*DTD\s*v5\.6/gi, 'DTD v5.6')
                                .replace(/Elsevier\s*XML/gi, 'Journal CE XML')
                                .replace(/Elsevier\s*DTD/gi, 'Journal DTD')
                                .replace(/Elsevier\s*guidelines/gi, 'standard editorial guidelines')
                                .replace(/Elsevier\s*format/gi, 'standard journal format')
                                .replace(/Elsevier/gi, 'Journal Publishing')
                            : m.content
                    }));
                }
            }
        } catch (e) {}
        return [generateKeeperWelcomeMessage()];
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Dragging tracking refs
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number }>({
        mouseX: 0,
        mouseY: 0,
        posX: 0,
        posY: 0
    });
    const hasMovedRef = useRef(false);

    // Ensure greeting occurs at least once per day/session
    useEffect(() => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const lastGreetDate = localStorage.getItem('keeper_last_greet_date');
            if (lastGreetDate !== today) {
                localStorage.setItem('keeper_last_greet_date', today);
                // If the user's chat is just starting with a single initial message, ensure it matches today's time of day
                setMessages(prev => {
                    if (prev.length === 1 && prev[0].id.startsWith('init-')) {
                        return [generateKeeperWelcomeMessage()];
                    }
                    return prev;
                });
            }
        } catch (e) {}
    }, []);

    // Sync status with dedicated header icon in Layout.tsx
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('app:keeper-status', {
            detail: {
                isOpen: isVisible && isOpen,
                isVisible,
                hasUnread
            }
        }));
    }, [isOpen, isVisible, hasUnread]);

    // Listen for toggle/open triggers from header icon
    useEffect(() => {
        const handleToggle = () => {
            setIsVisible(true);
            setIsOpen(prev => !prev);
        };
        const handleOpen = () => {
            setIsVisible(true);
            setIsOpen(true);
        };
        window.addEventListener('app:toggle-keeper', handleToggle);
        window.addEventListener('app:open-keeper', handleOpen);
        return () => {
            window.removeEventListener('app:toggle-keeper', handleToggle);
            window.removeEventListener('app:open-keeper', handleOpen);
        };
    }, []);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            setHasUnread(false);
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 150);
        }
    }, [isOpen, messages]);

    // Persist messages to local storage
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        } catch (e) {}
    }, [messages]);

    // Persist position
    useEffect(() => {
        try {
            localStorage.setItem('prod_toolkit_keeper_pos', JSON.stringify(position));
        } catch (e) {}
    }, [position]);

    // Persist visibility
    useEffect(() => {
        try {
            localStorage.setItem('prod_toolkit_keeper_visible', JSON.stringify(isVisible));
        } catch (e) {}
    }, [isVisible]);

    // Persist scenarios expanded state
    useEffect(() => {
        try {
            localStorage.setItem('keeper_scenarios_expanded', JSON.stringify(showScenarios));
        } catch (e) {}
    }, [showScenarios]);

    // Drag handle handler
    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        // Don't initiate drag if clicking buttons, inputs or links
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('a')) {
            return;
        }

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        isDraggingRef.current = true;
        hasMovedRef.current = false;
        dragStartRef.current = {
            mouseX: clientX,
            mouseY: clientY,
            posX: position.x,
            posY: position.y
        };
        setIsDragging(true);

        const onMove = (moveEvent: MouseEvent | TouchEvent) => {
            if (!isDraggingRef.current) return;
            const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

            const deltaX = currentX - dragStartRef.current.mouseX;
            const deltaY = currentY - dragStartRef.current.mouseY;

            if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
                hasMovedRef.current = true;
            }

            let newX = dragStartRef.current.posX + deltaX;
            let newY = dragStartRef.current.posY + deltaY;

            // Clamping coordinates relative to bottom-right anchor
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;
            const width = isOpen ? (isExpanded ? Math.min(750, winWidth - 48) : Math.min(440, winWidth - 40)) : 170;
            const height = isOpen ? (isExpanded ? winHeight * 0.85 : Math.min(620, winHeight - 100)) : 48;

            const minX = -(winWidth - width - 24);
            const maxX = 12;
            const minY = -(winHeight - height - 24);
            const maxY = 12;

            newX = Math.max(minX, Math.min(maxX, newX));
            newY = Math.max(minY, Math.min(maxY, newY));

            setPosition({ x: newX, y: newY });
        };

        const onEnd = () => {
            isDraggingRef.current = false;
            setIsDragging(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove);
        window.addEventListener('touchend', onEnd);
    };

    const handleResetPosition = (e: React.MouseEvent) => {
        e.stopPropagation();
        setPosition({ x: 0, y: 0 });
        try {
            localStorage.removeItem('prod_toolkit_keeper_pos');
        } catch (err) {}
    };

    const handleCloseFloater = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setIsOpen(false);
        setIsVisible(false);
        setShowCloseToast(true);
        setTimeout(() => setShowCloseToast(false), 6000);
    };

    const executeResetChat = () => {
        const freshWelcome = generateKeeperWelcomeMessage();
        setMessages([freshWelcome]);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        setShowResetConfirm(false);
        setInputPrompt('');
        setResetNotice('Chat reset! Keeper greeted with fresh energy. 🐾');
        setTimeout(() => setResetNotice(null), 3500);
        setTimeout(() => {
            textareaRef.current?.focus();
        }, 100);
    };

    const handleSendMessage = async (textToSend?: string) => {
        const text = (textToSend || inputPrompt).trim();
        if (!text || isLoading) return;

        const userMessage: Message = {
            id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            role: 'user',
            content: text,
            timestamp: Date.now()
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInputPrompt('');
        setIsLoading(true);

        try {
            const dogGreeting = getTimeOfDayDogGreeting();
            const timeContext = `User's local time of day: ${dogGreeting.timeLabel} (${new Date().toLocaleTimeString()}). Dog persona: Japanese Spitz (${dogGreeting.bark}).`;

            // Context description
            const contextInfo = isExperimental
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
                    : `The user is on the main workspace of Production Toolkit Pro. ${timeContext}`;

            const payloadMessages = newMessages
                .filter(m => !m.id.startsWith('init-'))
                .slice(-10) // Keep last 10 messages for context
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));

            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: payloadMessages.length > 0 ? payloadMessages : [{ role: 'user', content: text }],
                    context: contextInfo
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Request failed with status ${response.status}`);
            }

            const data = await response.json();
            const rawContent = data.reply || 'No response generated.';
            const sanitizedContent = rawContent
                .replace(/Elsevier\s*DTD\s*v5\.6/gi, 'DTD v5.6')
                .replace(/Elsevier\s*XML/gi, 'Journal CE XML')
                .replace(/Elsevier\s*DTD/gi, 'Journal DTD')
                .replace(/Elsevier\s*guidelines/gi, 'standard editorial guidelines')
                .replace(/Elsevier\s*format/gi, 'standard journal format')
                .replace(/Elsevier\s*standards/gi, 'standard publishing schemas')
                .replace(/Elsevier/gi, 'Journal Publishing');

            const assistantMessage: Message = {
                id: `ast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                role: 'assistant',
                content: sanitizedContent,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, assistantMessage]);
            if (!isOpen) {
                setHasUnread(true);
            }
        } catch (err: any) {
            const errorMessage: Message = {
                id: `err-${Date.now()}`,
                role: 'assistant',
                content: `⚠️ **Error communicating with Keeper:**\n\n${err.message || 'Unable to connect to server.'}\n\n*Note: Make sure your GEMINI_API_KEY is configured in your project settings.*`,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const isPositionMoved = position.x !== 0 || position.y !== 0;
    const currentDogGreeting = getTimeOfDayDogGreeting();

    return (
        <>
            {/* Informative Toast when floater is closed */}
            <AnimatePresence>
                {showCloseToast && !isVisible && (
                    <motion.div 
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 15, scale: 0.95 }}
                        className="fixed bottom-6 right-6 z-50 pointer-events-auto max-w-sm p-3.5 rounded-2xl bg-slate-900/95 text-white shadow-2xl border border-indigo-500/40 backdrop-blur-md flex items-start gap-3"
                    >
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-indigo-300 shadow-xs bg-slate-800">
                            <img src={keeperAvatar} alt="Keeper Dog Mascot" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 text-xs">
                            <p className="font-bold text-indigo-200 flex items-center gap-1.5">
                                <span>Keeper Floater Closed</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300">Tip</span>
                            </p>
                            <p className="text-slate-300 mt-1 text-[11px] leading-relaxed">
                                Click the dedicated <strong>Keeper dog icon beside the bell</strong> in the top navigation bar to reopen anytime! 🐾
                            </p>
                        </div>
                        <button 
                            onClick={() => setShowCloseToast(false)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                            title="Dismiss notification"
                        >
                            <X size={14} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Draggable Floater Container */}
            <aside 
                aria-label="Keeper Floating Editorial Assistant" 
                style={{ 
                    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                    transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                }}
                className={`fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none ${!isVisible ? 'hidden' : ''}`}
            >
                {/* Expanded Chat Modal Window */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 20 }}
                            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                            className={`pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden mb-3 transition-all duration-300 ring-1 ring-slate-900/5 relative ${
                                isExpanded 
                                    ? 'w-[750px] max-w-[calc(100vw-3rem)] h-[85vh]' 
                                    : 'w-[440px] max-w-[calc(100vw-2.5rem)] h-[620px] max-h-[calc(100vh-7rem)]'
                            }`}
                        >
                            {/* Draggable Chat Header */}
                            <header 
                                onMouseDown={handleDragStart}
                                onTouchStart={handleDragStart}
                                className="px-3.5 py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-xs select-none border-b border-indigo-900/50 cursor-grab active:cursor-grabbing group/header"
                                title="Click and drag to move floater anywhere on screen"
                            >
                                <div className="flex items-center gap-2.5">
                                    {/* Drag grip icon */}
                                    <div className="text-slate-400 group-hover/header:text-indigo-300 transition-colors p-0.5" title="Drag to move">
                                        <GripHorizontal className="w-4 h-4" />
                                    </div>

                                    {/* Avatar */}
                                    <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-white/20 bg-indigo-900/50 shadow-inner shrink-0">
                                        <img 
                                            src={keeperAvatar} 
                                            alt="Keeper Japanese Spitz Dog Mascot" 
                                            referrerPolicy="no-referrer" 
                                            className="w-full h-full object-cover object-center" 
                                        />
                                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900" />
                                    </div>

                                    {/* Title and Time-of-day indicator */}
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1">
                                                <span>Keeper</span>
                                            </h3>
                                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/20 font-bold">
                                                Editorial AI
                                            </span>
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[9px] font-bold text-emerald-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                                Active
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-300/90 font-medium flex items-center gap-1">
                                            <span>🐾 {currentDogGreeting.timeLabel} Shift</span>
                                            <span className="text-slate-500">•</span>
                                            <span className="text-indigo-200/80">Japanese Spitz</span>
                                        </span>
                                    </div>
                                </div>

                                {/* Header Action Controls */}
                                <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                                    {/* Reset Position (Snap back to bottom-right) */}
                                    {isPositionMoved && (
                                        <button
                                            type="button"
                                            onClick={handleResetPosition}
                                            title="Snap back to bottom-right corner"
                                            className="p-1.5 rounded-lg text-indigo-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                                        >
                                            <Pin className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Snap Corner</span>
                                        </button>
                                    )}

                                    {/* Option to Reset Conversation */}
                                    <button
                                        type="button"
                                        onClick={() => setShowResetConfirm(true)}
                                        title="Reset Conversation (Clear chat history & start fresh)"
                                        className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 text-indigo-300" />
                                        <span className="hidden sm:inline">Reset</span>
                                    </button>

                                    {/* Expand / Restore Window Size */}
                                    <button
                                        type="button"
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        title={isExpanded ? 'Restore Normal Size' : 'Expand View'}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors hidden sm:block cursor-pointer"
                                    >
                                        {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                    </button>

                                    {/* Minimize to launcher bubble */}
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        title="Minimize to floating mascot"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>

                                    {/* Close floater completely */}
                                    <button
                                        type="button"
                                        onClick={handleCloseFloater}
                                        title="Close Floater (Reopen from dog icon beside bell in top bar)"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </header>

                            {/* Reset Conversation Confirmation Overlay Dialog */}
                            <AnimatePresence>
                                {showResetConfirm && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute inset-x-3 top-14 z-30 p-3.5 rounded-xl bg-slate-900/95 text-white shadow-2xl border border-indigo-500/30 backdrop-blur-md"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 shrink-0 mt-0.5">
                                                <RotateCcw className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 text-left">
                                                <h4 className="text-xs font-bold text-white">Reset Conversation with Keeper?</h4>
                                                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                                                    This will clear all messages and start fresh with a new time-of-day greeting (<strong>{currentDogGreeting.greeting}</strong>).
                                                </p>
                                                <div className="mt-3 flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowResetConfirm(false)}
                                                        className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={executeResetChat}
                                                        className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-colors cursor-pointer shadow-xs"
                                                    >
                                                        Yes, Reset Chat
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Reset confirmation brief notification banner */}
                            {resetNotice && (
                                <div className="bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold flex items-center justify-between shrink-0 shadow-xs">
                                    <span>{resetNotice}</span>
                                    <button onClick={() => setResetNotice(null)} className="text-emerald-200 hover:text-white">
                                        <X size={12} />
                                    </button>
                                </div>
                            )}

                            {/* Active Tool Sub-Bar & Experimental Warning Banner */}
                            {isExperimental ? (
                                <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-start gap-2.5 text-amber-950 shrink-0">
                                    <div className="p-1 rounded-md bg-amber-500/25 text-amber-800 shrink-0 mt-0.5 shadow-2xs">
                                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                                    </div>
                                    <div className="flex-1 text-xs">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-black text-amber-950 uppercase tracking-wider text-[11px]">
                                                Keeper Advisory: Experimental Version
                                            </span>
                                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-200/90 text-amber-900 font-extrabold uppercase tracking-widest border border-amber-300">
                                                Not Fully Established
                                            </span>
                                        </div>
                                        <p className="text-amber-900/90 mt-1 text-[11px] leading-relaxed">
                                            You are currently using an <strong>Experimental Version</strong> ({currentToolInfo?.name || currentTool || 'Experimental Protocol'}). These tools are in active testing and are not yet fully established. Please inspect and verify all generated XML markup, cross-references, or outputs carefully before production publishing.
                                        </p>
                                        {currentToolInfo?.stableAlternative && (
                                            <button
                                                onClick={() => navigate(currentToolInfo.stableAlternative!.route)}
                                                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-950 hover:text-indigo-900 underline underline-offset-2 cursor-pointer transition-colors"
                                            >
                                                <ArrowRight className="w-3 h-3 text-amber-800" />
                                                <span>Switch to established version ({currentToolInfo.stableAlternative.name}) &rarr;</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                currentTool && (
                                    <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-1.5 flex items-center justify-between text-[10px] font-medium text-slate-600">
                                        <span className="flex items-center gap-1.5">
                                            <Cpu className="w-3 h-3 text-indigo-600" />
                                            <span>Active Module Context:</span>
                                            <strong className="text-slate-800 font-bold">{currentToolInfo?.name || currentTool}</strong>
                                        </span>
                                        <span className="text-[9px] text-slate-400">Gemini AI</span>
                                    </div>
                                )
                            )}

                            {/* Messages Chat Stream */}
                            <div className="flex-grow overflow-y-auto p-4 custom-scrollbar space-y-4 bg-slate-50/50">
                                {messages.map((message) => {
                                    const isUser = message.role === 'user';
                                    return (
                                        <div
                                            key={message.id}
                                            className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                                        >
                                            <div
                                                className={`w-7 h-7 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-2xs text-xs font-bold ${
                                                    isUser
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'border border-indigo-200/50 bg-indigo-50'
                                                }`}
                                            >
                                                {isUser ? (
                                                    <User className="w-3.5 h-3.5" />
                                                ) : (
                                                    <img 
                                                        src={keeperAvatar} 
                                                        alt="Keeper" 
                                                        referrerPolicy="no-referrer" 
                                                        className="w-full h-full object-cover" 
                                                    />
                                                )}
                                            </div>

                                            <div
                                                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs ${
                                                    isUser
                                                        ? 'bg-indigo-600 text-white rounded-tr-xs'
                                                        : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-xs'
                                                }`}
                                            >
                                                {isUser ? (
                                                    <p className="whitespace-pre-wrap leading-relaxed font-normal">{message.content}</p>
                                                ) : (
                                                    <div className="prose prose-xs max-w-none text-slate-800 leading-relaxed">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={{
                                                                a({ href, children }: any) {
                                                                    if (href && (href.startsWith('#/') || href.startsWith('/'))) {
                                                                        const route = href.replace(/^#/, '');
                                                                        return (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();
                                                                                    navigate(route);
                                                                                }}
                                                                                className="inline-flex items-center gap-1.5 my-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-xs transition-all hover:scale-102 active:scale-95 cursor-pointer select-none"
                                                                                title={`Open ${route}`}
                                                                            >
                                                                                <Compass className="w-3 h-3 text-indigo-200" />
                                                                                <span>{children}</span>
                                                                                <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                                                                            </button>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <a 
                                                                            href={href} 
                                                                            target="_blank" 
                                                                            rel="noreferrer" 
                                                                            className="text-indigo-600 font-semibold underline hover:text-indigo-800" 
                                                                        >
                                                                            {children}
                                                                        </a>
                                                                    );
                                                                },
                                                                pre({ children }: any) {
                                                                    return (
                                                                        <pre className="bg-slate-900 text-slate-100 p-2.5 rounded-xl my-2 overflow-x-auto text-[11px] font-mono border border-slate-800">
                                                                            {children}
                                                                        </pre>
                                                                    );
                                                                },
                                                                code({ className, children, ...props }: any) {
                                                                    const codeContent = String(children).replace(/\n$/, '');
                                                                    const isJMQuery = codeContent.startsWith('TO THE JM:') || codeContent.includes('TO THE JM:');

                                                                    if (isJMQuery) {
                                                                        const isCopied = copiedId === message.id;
                                                                        return (
                                                                            <div className="relative my-2 rounded-xl overflow-hidden border-2 border-indigo-500/40 bg-slate-900 text-slate-100 shadow-md">
                                                                                <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 px-3 py-1.5 border-b border-indigo-800/40 flex items-center justify-between">
                                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                                                                                        <FileText className="w-3 h-3 text-indigo-400" />
                                                                                        <span>Standard TO THE JM Query</span>
                                                                                    </span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => copyToClipboard(codeContent, message.id)}
                                                                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                                                                            isCopied
                                                                                                ? 'bg-emerald-500 text-white'
                                                                                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                                                                                        }`}
                                                                                    >
                                                                                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                                                        <span>{isCopied ? 'Copied Query!' : 'Copy TO THE JM Query'}</span>
                                                                                    </button>
                                                                                </div>
                                                                                <pre className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto text-emerald-300 select-all whitespace-pre-wrap">
                                                                                    {codeContent}
                                                                                </pre>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <code className="bg-slate-100 text-indigo-700 px-1 py-0.5 rounded font-mono text-[11px] font-semibold" {...props}>
                                                                            {children}
                                                                        </code>
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            {message.content}
                                                        </ReactMarkdown>

                                                        {/* One-click copy for general messages containing queries */}
                                                        {message.content.includes('TO THE JM:') && (
                                                            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-end">
                                                                <button
                                                                    onClick={() => {
                                                                        const match = message.content.match(/TO THE JM:[\s\S]*?(?:File is on pending status until matter is resolved\. Thank you\.|$)/);
                                                                        const textToCopy = match ? match[0] : message.content;
                                                                        copyToClipboard(textToCopy, `query-${message.id}`);
                                                                    }}
                                                                    className="px-2 py-1 rounded bg-slate-100 hover:bg-indigo-50 text-indigo-700 hover:text-indigo-900 text-[10px] font-bold flex items-center gap-1 transition-all border border-slate-200 cursor-pointer"
                                                                >
                                                                    {copiedId === `query-${message.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-indigo-600" />}
                                                                    <span>{copiedId === `query-${message.id}` ? 'Copied JM Query!' : 'Copy Query to Clipboard'}</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {isLoading && (
                                    <div className="flex items-start gap-2.5">
                                        <div className="w-7 h-7 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-indigo-200 bg-indigo-50 shadow-2xs">
                                            <img 
                                                src={keeperAvatar} 
                                                alt="Keeper thinking" 
                                                referrerPolicy="no-referrer" 
                                                className="w-full h-full object-cover animate-pulse" 
                                            />
                                        </div>
                                        <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-xs px-4 py-3 shadow-2xs">
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                                                <span className="font-medium">Keeper is fetching the best tool & formulation...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Space-Saving Collapsible Editorial Scenarios Bar (Takes only ~26px when collapsed!) */}
                            <div className="border-t border-slate-200/70 bg-slate-50/90 shrink-0 transition-all">
                                <div className="px-3 py-1.5 flex items-center justify-between text-[11px]">
                                    <button
                                        type="button"
                                        onClick={() => setShowScenarios(!showScenarios)}
                                        className="flex items-center gap-1.5 font-bold text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
                                        title={showScenarios ? "Collapse editorial scenarios drawer" : "Expand common editorial scenarios"}
                                    >
                                        <Compass className="w-3.5 h-3.5 text-indigo-500" />
                                        <span>Common Editorial Scenarios</span>
                                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-600 font-bold">
                                            {SCENARIO_CATEGORIES.reduce((acc, cat) => acc + cat.items.length, 0)}
                                        </span>
                                        {showScenarios ? (
                                            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                        ) : (
                                            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowScenarios(!showScenarios)}
                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                                    >
                                        {showScenarios ? "Hide ▴" : "Browse Prompts ▾"}
                                    </button>
                                </div>

                                {/* Expanded Scenarios Drawer */}
                                {showScenarios && (
                                    <div className="px-3 pb-2.5 pt-1 border-t border-slate-200/50 max-h-44 overflow-y-auto custom-scrollbar space-y-2.5 bg-white/80">
                                        {isExperimental && (
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 block mb-1">
                                                    ⚠️ Active Experimental Protocol
                                                </span>
                                                <button
                                                    disabled={isLoading}
                                                    onClick={() => {
                                                        handleSendMessage(`What should I be cautious about when using this experimental version (${currentToolInfo?.name || currentTool || 'Experimental Protocol'})? Why is it not yet fully established, and how do I verify its output before production use?`);
                                                        setShowScenarios(false);
                                                    }}
                                                    className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
                                                >
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                                    <span>Risks & Output Validation for {currentToolInfo?.name || 'Experimental Tool'}</span>
                                                </button>
                                            </div>
                                        )}

                                        {SCENARIO_CATEGORIES.map((cat, cIdx) => (
                                            <div key={cIdx}>
                                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                                    {cat.category}
                                                </span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {cat.items.map((item, iIdx) => (
                                                        <button
                                                            key={iIdx}
                                                            disabled={isLoading}
                                                            onClick={() => {
                                                                handleSendMessage(item.prompt);
                                                                setShowScenarios(false);
                                                            }}
                                                            className="text-left text-[10.5px] px-2 py-1 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200/80 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                                        >
                                                            {item.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Input Footer */}
                            <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                                {/* Quick JM Query Preset Toolbar */}
                                <div className="mb-2 flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-[10px]">
                                    <span className="text-slate-400 font-extrabold uppercase tracking-wider shrink-0 flex items-center gap-1 text-[9px]">
                                        <FileText className="w-3 h-3 text-indigo-500" />
                                        <span>JM Query:</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInputPrompt('Query to JM: ');
                                            textareaRef.current?.focus();
                                        }}
                                        className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold shrink-0 transition-colors cursor-pointer border border-indigo-200/60 flex items-center gap-1"
                                        title="Insert 'Query to JM: ' prefix"
                                    >
                                        <span>+ Prefix "Query to JM:"</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInputPrompt('Query to JM: Author requested to change the author name from "" to ""');
                                            textareaRef.current?.focus();
                                        }}
                                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium shrink-0 transition-colors cursor-pointer"
                                        title="Author name change query template"
                                    >
                                        Author Name Change
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInputPrompt('Query to JM: The author provided a replacement for Figure  with content changes');
                                            textareaRef.current?.focus();
                                        }}
                                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium shrink-0 transition-colors cursor-pointer"
                                        title="Figure replacement query template"
                                    >
                                        Figure Replacement
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInputPrompt('Query to JM: Reference [] is uncited in the text body');
                                            textareaRef.current?.focus();
                                        }}
                                        className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium shrink-0 transition-colors cursor-pointer"
                                        title="Uncited item query template"
                                    >
                                        Uncited Item
                                    </button>
                                </div>

                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }}
                                    className="relative flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200/90 p-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-inner"
                                >
                                    <textarea
                                        ref={textareaRef}
                                        value={inputPrompt}
                                        onChange={(e) => setInputPrompt(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Type 'Query to JM: [paste note]', ask about tools, or paste XML..."
                                        rows={1}
                                        disabled={isLoading}
                                        className="flex-grow bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-hidden resize-none px-2.5 py-1.5 max-h-28 custom-scrollbar leading-relaxed font-sans"
                                    />

                                    <button
                                        type="submit"
                                        disabled={!inputPrompt.trim() || isLoading}
                                        className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white shadow-xs transition-all active:scale-95 shrink-0 flex items-center justify-center cursor-pointer"
                                        title="Send Message to Keeper (Enter)"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                </form>
                                <div className="mt-1.5 px-1 flex items-center justify-between text-[9px] text-slate-400">
                                    <span>Press <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-slate-600">Enter</kbd> to send</span>
                                    <span className="flex items-center gap-1 font-medium text-slate-500">
                                        <span>🐾 Keeper Editorial Companion</span>
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Launcher Bubble Trigger Button (Draggable & Closeable) */}
                <div 
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                    className="pointer-events-auto relative group flex items-center gap-1 cursor-grab active:cursor-grabbing select-none"
                    title="Click to open Keeper, or drag anywhere on screen"
                >
                    <button
                        type="button"
                        onClick={(e) => {
                            if (!hasMovedRef.current) {
                                setIsOpen(!isOpen);
                            }
                        }}
                        className={`relative flex items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-full bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-xl hover:shadow-2xl hover:shadow-indigo-500/30 border transition-all duration-200 cursor-pointer ${
                            isExperimental 
                                ? 'border-amber-400/90 ring-2 ring-amber-400/80 shadow-amber-500/25 hover:scale-105 active:scale-95' 
                                : 'border-indigo-400/40 hover:scale-105 active:scale-95'
                        }`}
                        aria-label="Toggle Keeper Editorial AI Assistant"
                    >
                        {/* Drag Handle Dots Indicator */}
                        <div className="text-slate-400 group-hover:text-indigo-200 transition-colors">
                            <GripHorizontal className="w-3 h-3" />
                        </div>

                        {/* Mascot Avatar Thumbnail */}
                        <div className={`relative w-8 h-8 rounded-full overflow-hidden border-2 shadow-md shrink-0 bg-indigo-900 ${
                            isExperimental ? 'border-amber-400' : 'border-indigo-300/60'
                        }`}>
                            <img 
                                src={keeperAvatar} 
                                alt="Keeper Japanese Spitz Dog Avatar" 
                                referrerPolicy="no-referrer" 
                                className="w-full h-full object-cover" 
                            />
                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                                isExperimental ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                            }`} />
                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                                isExperimental ? 'bg-amber-400' : 'bg-emerald-400'
                            }`} />
                        </div>

                        <div className="flex flex-col text-left">
                            <div className="flex items-center gap-1">
                                <span className="text-xs font-black tracking-wide uppercase leading-tight">
                                    Keeper
                                </span>
                                <Sparkles className="w-3 h-3 text-amber-300 inline" />
                            </div>
                            <span className="text-[9px] text-indigo-200/80 font-medium leading-none">
                                {isExperimental ? '⚠️ Exp Active' : `${currentDogGreeting.timeLabel} Shift`}
                            </span>
                        </div>

                        {/* Experimental Warning Pill */}
                        {isExperimental && (
                            <div className="absolute -top-2.5 -left-2 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-[8px] uppercase tracking-wider rounded-full shadow-md border border-amber-300 flex items-center gap-1 animate-pulse">
                                <AlertTriangle size={9} className="text-slate-950" />
                                <span>Exp Version</span>
                            </div>
                        )}

                        {hasUnread && !isOpen && (
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 absolute -top-1 -right-1 ring-2 ring-white animate-bounce" />
                        )}
                    </button>

                    {/* Quick Close Button for Launcher Bubble */}
                    <button
                        type="button"
                        onClick={handleCloseFloater}
                        title="Close Floater (Reopen from dog icon in top bar)"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 shadow-md cursor-pointer"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            </aside>
        </>
    );
};

export default AIAssistantBubble;
