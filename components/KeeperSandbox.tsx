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
import KeeperEvidenceReport, { type KeeperEvidenceReportData } from './KeeperEvidenceReport';
import { readKeeperApiResponse } from '../utils/keeperApiResponse';
import { encodeKeeperRequest } from '../utils/keeperPayload';
import {keeperArtifactScope,keeperSameSources,keeperScopedMessages,keeperPastedXmlArtifact,type KeeperPastedArtifact} from '../utils/keeperConversationScope';

import {readKeeperTaskWorkspace,keeperSelectedTask,KeeperWorkspaceWriter,localTaskRecords} from '../utils/keeperLocalStore';
import KeeperLocalTasks from './KeeperLocalTasks';
import {keeperRestoredSources} from '../utils/keeperConversationScope';
import {validateKeeperLocalSources} from '../utils/keeperLocalLimits';
import {inspectKeeperLocally} from '../utils/keeperLocalInspection';
import {evidenceSummary,type KeeperEvidence} from '../utils/keeperEvidenceCore';

const keeperAvatar = '/keeper_avatar.jpg';

interface Message {
    artifactScope?: string;
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
    if (modelUsed === 'keeper-evidence-counts') return {label:'Verified inventory counts',isOffline:false};
    if (modelUsed === 'keeper-evidence-only') return {label:'Evidence report · AI interpretation unavailable',isOffline:false};
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
    const [sandboxArtifacts, setSandboxArtifacts] = useState<{id:string;name:string;kind:'xml'|'pdf';content:string}[]>([]);
    const [evidenceReport, setEvidenceReport] = useState<KeeperEvidenceReportData | null>(null);
    const [fileNotice, setFileNotice] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const importVersion = useRef(0);
    const responseVersion = useRef(0);
    const pastedArtifactRef = useRef<KeeperPastedArtifact|null>(null);
    const [activeScope,setActiveScope] = useState('[]');

    const localEvidence = useRef<KeeperEvidence|null>(null);
    const localEvidenceSources = useRef<typeof sandboxArtifacts|null>(null);
    const [inspectionStatus, setInspectionStatus] = useState<'idle'|'running'|'ready'|'error'>('idle');
    const [inspectionRetry, setInspectionRetry] = useState(0);
    useEffect(() => {
        localEvidence.current=null;localEvidenceSources.current=null;
        setEvidenceReport(null);
        if (!sandboxArtifacts.length) { setInspectionStatus('idle'); return; }
        const controller = new AbortController();
        let active = true;
        setInspectionStatus('running');
        const prepare = async () => {
            try {
                const evidence=await inspectKeeperLocally(sandboxArtifacts,controller.signal);
                if(active){localEvidence.current=evidence;localEvidenceSources.current=[...sandboxArtifacts];setEvidenceReport(evidenceSummary(evidence));setInspectionStatus('ready');setFileNotice('');}
            } catch (error) {
                if (active) { setInspectionStatus('error'); setFileNotice(error instanceof Error ? error.message : 'Background inspection failed.'); }
            }
        };
        void prepare();
        return () => { active=false; controller.abort(); };
    }, [sandboxArtifacts, inspectionRetry, session?.access_token]);
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
    const [messages,setMessages]=useState<Message[]>([]);
    const [restoredOwner,setRestoredOwner]=useState<string|null>(null);
    const [activeTask,setActiveTask]=useState('scratch');
    const [restoreError,setRestoreError]=useState('');
    const [saveError,setSaveError]=useState('');
    const [restoreRetry,setRestoreRetry]=useState(0);
    const [switchingTask,setSwitchingTask]=useState(false);
    const workspaceWriter=useRef<KeeperWorkspaceWriter|null>(null);
    const ownerGeneration=useRef(0);
    const applyWorkspace=(saved:any,artifacts:typeof sandboxArtifacts=[])=>{
        const restored=keeperRestoredSources(saved,artifacts);
        setSandboxArtifacts(restored.artifacts);setMessages(saved?.messages||[]);
        setInputPrompt(saved?.inputPrompt||'');setTaskInstructions(saved?.taskInstructions||'');
        setActiveScope(restored.activeScope);
        localEvidence.current=null;localEvidenceSources.current=null;pastedArtifactRef.current=null;
    };
    useEffect(()=>{
        let active=true;ownerGeneration.current++;
        responseVersion.current++;importVersion.current++;
        typingControllerRef.current?.stop();setCurrentlyTypingId(null);setIsLoading(false);setIsImporting(false);
        setRestoredOwner(null);setRestoreError('');setSaveError('');setSwitchingTask(false);
        workspaceWriter.current=null;applyWorkspace(null);setEvidenceReport(null);
        const account=user?.id;
        if(account)void (async()=>{
            const task=await keeperSelectedTask(account);
            const saved=await readKeeperTaskWorkspace(account,task);
            const sources=task!=='scratch'&&!saved?.artifacts?.length?(await localTaskRecords(account)).find(row=>row.id===task)?.artifacts||[]:[];
            if(!active)return;
            workspaceWriter.current=new KeeperWorkspaceWriter(account,task,saved?._revision||0);
            applyWorkspace(saved,sources);setActiveTask(task);setRestoredOwner(account);
        })().catch(error=>{if(active)setRestoreError(error instanceof Error?error.message:'Local storage could not be restored.');});
        return()=>{active=false;ownerGeneration.current++;responseVersion.current++;};
    },[user?.id,restoreRetry]);
    const workspaceSnapshot=()=>({version:2,artifacts:sandboxArtifacts,messages,inputPrompt,taskInstructions,activeScope});
    useEffect(()=>{
        const writer=workspaceWriter.current;
        if(!user?.id||restoredOwner!==user.id||currentlyTypingId||switchingTask||!writer||writer.task!==activeTask)return;
        void writer.save(workspaceSnapshot()).catch(error=>{if(workspaceWriter.current===writer)setSaveError(error instanceof Error?error.message:'Local save failed.');});
    },[user?.id,restoredOwner,sandboxArtifacts,messages,inputPrompt,taskInstructions,activeScope,currentlyTypingId,activeTask,switchingTask]);
    const selectLocalTask=async(task:string,artifacts:typeof sandboxArtifacts)=>{
        if(!user?.id||switchingTask||saveError)return false;
        const account=user.id,generation=ownerGeneration.current;
        setSwitchingTask(true);responseVersion.current++;importVersion.current++;
        typingControllerRef.current?.stop();setCurrentlyTypingId(null);setIsLoading(false);setIsImporting(false);
        try{
            await workspaceWriter.current?.save(workspaceSnapshot());
            const saved=await readKeeperTaskWorkspace(account,task);
            if(generation!==ownerGeneration.current)return;
            await keeperSelectedTask(account,task);
            if(generation!==ownerGeneration.current)return;
            workspaceWriter.current=new KeeperWorkspaceWriter(account,task,saved?._revision||0);
            applyWorkspace(saved,artifacts);setActiveTask(task);setEvidenceReport(null);setSaveError('');
            setFileNotice('Selected local ZIP task. Saved instructions and conversation restored.');return true;
        }catch(error){if(generation===ownerGeneration.current)setSaveError(error instanceof Error?error.message:'Task could not be restored.');}
        finally{if(generation===ownerGeneration.current)setSwitchingTask(false);}
    };
    const exportUnsavedWorkspace=()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(workspaceSnapshot())],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download='keeper-local-unsaved-workspace.json';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const typingControllerRef = useRef<TypingSimulatorController | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (!file || !user?.id || restoredOwner!==user.id) return;
        if (file.size > 4000000) { setFileNotice('Choose a file smaller than 4 MB.'); return; }
        const version=++importVersion.current;setIsImporting(true);setFileNotice('');
        try {
            const kind = /\.pdf$/i.test(file.name) ? 'pdf' : /\.xml$/i.test(file.name) ? 'xml' : null;
            if(!kind){setFileNotice('Local inspection currently accepts XML and PDF files only. ZIP tasks will be added separately.');return;}
            const bytes=new Uint8Array(await file.arrayBuffer());
            let content='';
            if(kind==='pdf'){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));content=btoa(binary);}
            else content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
            if(version!==importVersion.current)return;
            const nextArtifacts: typeof sandboxArtifacts=[...sandboxArtifacts.filter(a=>a.kind!==kind),{id:crypto.randomUUID(),name:file.name,kind,content}];
            validateKeeperLocalSources(nextArtifacts);
            setSandboxArtifacts(nextArtifacts);
            setActiveScope(keeperArtifactScope(nextArtifacts));
            typingControllerRef.current?.stop();setCurrentlyTypingId(null);
            setEvidenceReport(null);
        } catch (error) { if(version===importVersion.current)setFileNotice(error instanceof Error && error.message.includes('server limit') ? error.message : 'File could not be imported. Use UTF-8 XML or a PDF.'); }
        finally {if(version===importVersion.current)setIsImporting(false);}
    };

    // Cleanup typing animation if component unmounts
    useEffect(() => {
        return () => {
            responseVersion.current++;
            typingControllerRef.current?.stop();
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

    // Persist scenarios expanded state
    useEffect(() => {
        try {
            localStorage.setItem('keeper_factory_scenarios_expanded', JSON.stringify(showScenarios));
        } catch (e) {}
    }, [showScenarios]);

    const executeResetChat = () => {
        pastedArtifactRef.current=null;
        responseVersion.current++;setActiveScope(keeperArtifactScope(sandboxArtifacts));
        typingControllerRef.current?.stop();
        setCurrentlyTypingId(null);
        setMessages([]);
        setShowResetConfirm(false);
        setInputPrompt('');
        setTaskInstructions('');
        importVersion.current++;setIsImporting(false);setFileNotice('');
        setResetNotice('Conversation cleared. Attached task files and findings are retained.');
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
        const requestArtifacts = [...sandboxArtifacts];
        const pastedXml = /^\s*</.test(source);
        if(pastedXml){if(requestArtifacts.some(a=>a.kind==='xml')){setFileNotice('Remove the imported XML before submitting a different pasted XML.');return;}pastedArtifactRef.current=keeperPastedXmlArtifact(pastedArtifactRef.current,source);requestArtifacts.push(pastedArtifactRef.current);}
        const modelSource = pastedXml ? 'XML supplied as a sandbox artifact. Inspect it using the evidence tool.' : source;
        const text = [taskInstructions.trim() ? 'Task instructions:\n' + taskInstructions.trim() : '', modelSource ? 'Source material:\n' + modelSource : requestArtifacts.length ? 'Inspect the supplied sandbox files and report findings.' : ''].filter(Boolean).join('\n\n');
        if (!user?.id || restoredOwner!==user.id || !text || isLoading || isImporting || inspectionStatus === 'running' || inspectionStatus === 'error') return;
        const generation=++responseVersion.current;
        setIsLoading(true);
        let evidenceSnapshot:KeeperEvidence|undefined;
        if(requestArtifacts.length){
            try{
                validateKeeperLocalSources(requestArtifacts);
                if(pastedXml){setSandboxArtifacts(requestArtifacts);setInputPrompt('');}
                evidenceSnapshot=!localEvidence.current||!keeperSameSources(localEvidenceSources.current,requestArtifacts)?await inspectKeeperLocally(requestArtifacts):localEvidence.current;
                if(generation!==responseVersion.current)return;
                localEvidence.current=evidenceSnapshot;localEvidenceSources.current=[...requestArtifacts];
                setEvidenceReport(evidenceSummary(evidenceSnapshot));
            }catch(error){if(generation===responseVersion.current){setIsLoading(false);setFileNotice(error instanceof Error?error.message:'Local inspection failed.');}return;}
        }
        const scope=keeperArtifactScope(requestArtifacts);
        setActiveScope(scope);

        // If Keeper is currently typing out a previous message, skip to end before sending new message
        if (currentlyTypingId) {
            handleSkipTyping();
        }

        const userMessage: Message = {
            artifactScope:scope,
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
                artifactScope:scope,
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

            const payloadMessages = keeperScopedMessages(newMessages,scope)
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
                        body: encodeKeeperRequest({
                            messages: payloadMessages.length > 0 ? payloadMessages : [{ role: 'user', content: text }],
                            context: contextInfo,
                            evidenceSnapshot
                        })
                    });

                    const data = await readKeeperApiResponse(response);
                    if(generation!==responseVersion.current)return null;
                    if (!response.ok) {
                        const errData = data;
                        if(errData.evidence)setEvidenceReport(errData.evidence);
                        if(errData.code==='EVIDENCE_REVIEW_INCOMPLETE')return {reply:errData.error,modelUsed:'keeper-review-incomplete'};
                        if(response.status===400)return {reply:errData.error||'The sandbox input could not be accepted.',modelUsed:'keeper-input-error'};
                        if (response.status === 401 || response.status === 403 || errData.code === 'SUBSCRIPTION_REQUIRED') {
                            return {
                                reply: errData.error || (response.status===401?'Your sign-in session has expired. Please sign in again.':'An active subscription is required to chat with Keeper.'),
                                modelUsed: response.status===401?'keeper-auth-required':'keeper-subscription-lock'
                            };
                        }
                        throw new Error(errData.error || `Request failed with status ${response.status}`);
                    }

                    setEvidenceReport(data.evidence ? {...data.evidence,toolTrace:data.toolTrace} : null);
                    if(data.interpretationUnavailable)setFileNotice('Keeper AI is unavailable. The reply below is a tool report, not an AI interpretation.');
                    return {
                        reply: data.offline ? KEEPER_CONTACT_ADMIN_NOTICE : data.reply || 'No response generated.',
                        modelUsed: data.modelUsed,
                        offline: Boolean(data.offline),
                        faqTopics: data.faqTopics,
                        note: data.note
                    };
                } catch (err: any) {
                    if (err?.message?.includes('server limit')) return {reply:err.message,modelUsed:'keeper-input-error'};
                    console.warn("Keeper live AI connection unavailable:", err?.message || err);
                    return { reply: err?.message || KEEPER_CONTACT_ADMIN_NOTICE, modelUsed: 'keeper-connection-unavailable' };
                }
            })();

            const responseData = await generateResponsePromise;
            if(!responseData || generation!==responseVersion.current)return;

            const rawContent = responseData.reply;
            const sanitizedContent = sanitizeOutput(rawContent);

            const assistantMessageId = `ast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

            const initialAssistantMessage: Message = {
                artifactScope:scope,
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
    const lastAssistantMessage = [...keeperScopedMessages(messages,activeScope)].reverse().find(m => m.role === 'assistant');
    const lastModelBadge = getModelBadgeInfo(lastAssistantMessage?.modelUsed);

    // Never render the previous account's local state while the new account restores.
    if(restoreError)return <section aria-label="Keeper storage error" className="p-6 space-y-3"><p role="alert">{restoreError} Your saved workspace has not been overwritten.</p><button onClick={()=>setRestoreRetry(n=>n+1)}>Retry local storage</button></section>;
    if(switchingTask)return <section aria-label="Keeper sandbox" className="p-6">Saving and restoring local task…</section>;
    if(!user?.id || restoredOwner!==user.id)return <section aria-label="Keeper sandbox" className="p-6 text-sm text-slate-600">{user?.id?'Restoring your local Keeper workspace…':'Sign in to open your local Keeper workspace.'}</section>;

    return (
        <section aria-label="Keeper sandbox" className="space-y-5">
            {saveError&&<div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>{saveError}</p><button className="underline mr-4" onClick={exportUnsavedWorkspace}>Export unsaved workspace (contains manuscript data)</button><button className="underline" onClick={()=>setRestoreRetry(n=>n+1)}>Reload saved version</button></div>}
            <KeeperLocalTasks owner={user?.id} disabled={switchingTask} onSelect={(task,artifacts)=>void selectLocalTask(task,artifacts)} onBeforeRemove={async task=>task!==activeTask||Boolean(await selectLocalTask('scratch',[]))}/>
            <button className="text-sm text-indigo-700 underline" disabled={switchingTask||Boolean(saveError)} onClick={()=>void selectLocalTask('scratch',[])}>Open standalone workspace</button>

            {resetNotice && <p role="status" className="rounded-xl bg-indigo-50 text-indigo-700 px-4 py-3 text-sm">{resetNotice}</p>}
            {showResetConfirm && <div role="alertdialog" aria-label="Clear Keeper conversation" className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex flex-wrap items-center gap-3"><p className="text-sm flex-1">Clear instructions and conversation? Attached files and inspection findings will remain.</p><button onClick={() => setShowResetConfirm(false)} className="text-sm px-3 py-2">Cancel</button><button onClick={executeResetChat} disabled={isLoading} className="text-sm bg-slate-900 text-white px-3 py-2 rounded-lg disabled:opacity-40">Clear conversation</button></div>}
            <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 items-start">
                <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-widest font-bold text-indigo-500">01 / Prepare</p><h2 className="font-semibold text-slate-900 mt-1">Task workspace</h2></div><button onClick={() => setShowResetConfirm(true)} disabled={isLoading} className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-40 flex items-center gap-2"><RotateCcw size={14} /> Clear conversation</button></div>
                    <div className="p-6">
                        <label htmlFor="keeper-instructions" className="text-sm font-semibold text-slate-800">What should Keeper do?</label>
                        <p className="text-xs text-slate-500 mt-1 mb-3">Include the rules, format, or examples you want him to follow.</p>
                        <textarea id="keeper-instructions" value={taskInstructions} onChange={e => setTaskInstructions(e.target.value)} disabled={isLoading} placeholder="Describe your task and expected output…" className="w-full min-h-[130px] p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed resize-y outline-none focus:ring-2 focus:ring-indigo-400" />
                        <div className="flex items-center justify-between mt-6 mb-3"><label htmlFor="keeper-task-input" className="text-sm font-semibold text-slate-800">Source material <span className="font-normal text-slate-400 ml-1">Optional</span></label><button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading || isImporting} className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5 disabled:opacity-40"><Paperclip size={14} /> Import file</button></div>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xml,.pdf,.txt" className="hidden" />
                        {isImporting && <p role="status" className="text-xs text-slate-500 mb-3">Importing file...</p>}
                        {inspectionStatus !== 'idle' && <p role="status" className="text-xs text-indigo-700 mb-3">{inspectionStatus === 'running' ? 'Inspecting files in the background…' : inspectionStatus === 'ready' ? 'Inspection ready. Keeper can retrieve these findings.' : 'Inspection failed.'}{inspectionStatus === 'error' && <button className="ml-2 underline" onClick={()=>setInspectionRetry(n=>n+1)}>Retry inspection</button>}</p>}
                        {fileNotice && <p role="alert" className="text-xs text-amber-700 mb-3">{fileNotice}</p>}
                        {sandboxArtifacts.map(a=><div key={a.id} className="flex items-center justify-between text-xs bg-indigo-50 rounded-lg p-3 mb-2"><span>{a.name} - {a.kind.toUpperCase()}</span><button disabled={isLoading} onClick={()=>{importVersion.current++;setIsImporting(false);const remaining=sandboxArtifacts.filter(x=>x.id!==a.id);setSandboxArtifacts(remaining);setActiveScope(keeperArtifactScope(remaining));typingControllerRef.current?.stop();setCurrentlyTypingId(null);setEvidenceReport(null);}}>Remove</button></div>)}
                        <p className="text-xs text-slate-500 mb-3">Local workspace: import one XML and an optional edit-report PDF. Browser data deletion removes local copies. Processing pauses when the app closes. Files are inspected locally in this browser without server or AI transmission. Run task shows deterministic evidence; cloud interpretation is disabled for imported files.</p>
                        <textarea id="keeper-task-input" ref={textareaRef} value={inputPrompt} onChange={e => {setInputPrompt(e.target.value);if(/^\s*</.test(inputPrompt)||/^\s*</.test(e.target.value))setEvidenceReport(null);}} disabled={isLoading || isImporting} placeholder="Paste text, XML, or an example here…" className="w-full min-h-[290px] p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed font-mono resize-y outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{(inputPrompt.length + taskInstructions.length).toLocaleString()} characters</span><button onClick={() => handleSendMessage()} disabled={(!inputPrompt.trim() && !taskInstructions.trim() && !sandboxArtifacts.length) || isLoading || isImporting || inspectionStatus === 'running' || inspectionStatus === 'error' || Boolean(currentlyTypingId)} className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-indigo-700 transition-colors">{isLoading ? 'Working…' : currentlyTypingId ? 'Preparing result…' : 'Run task'}<ArrowRight size={16} /></button></div>
                </section>
                <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest font-bold text-indigo-500">02 / Review</p><h2 className="font-semibold text-slate-900 mt-1">Result</h2></div><div className="flex items-center gap-3">{currentlyTypingId && <button onClick={handleSkipTyping} className="text-xs text-indigo-600">Show full result</button>}{lastAssistantMessage && <button onClick={() => copyToClipboard(lastAssistantMessage.content, lastAssistantMessage.id)} className="inline-flex items-center gap-2 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2"><Copy size={13} />{copiedId === lastAssistantMessage.id ? 'Copied' : 'Copy result'}</button>}</div></div>
                    <div ref={messagesContainerRef} aria-live="polite" aria-busy={isLoading || Boolean(currentlyTypingId)} className="min-h-[550px] max-h-[800px] overflow-y-auto p-6">
                        {lastAssistantMessage ? <div className="prose prose-sm max-w-none text-slate-800 break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a: ({children}) => <span>{children}</span>, img: ({alt}) => <span>{alt || 'Image omitted in local report'}</span>}}>{lastAssistantMessage.content}</ReactMarkdown></div> : <div className="min-h-[500px] flex flex-col justify-center items-center text-center"><div className="bg-indigo-50 text-indigo-400 rounded-2xl p-5 mb-5"><FileText size={30} strokeWidth={1.4} /></div><h3 className="font-semibold text-slate-700">A blank canvas</h3><p className="text-sm text-slate-400 mt-2 max-w-[260px] leading-relaxed">Your result will appear here. Start with a task and any material Keeper needs.</p></div>}
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between text-xs text-slate-400"><span>{lastAssistantMessage ? lastModelBadge.label : 'Ready when you are'}</span><span>Results stay in this sandbox</span></div>
                </section>
            </div>
            {evidenceReport && <KeeperEvidenceReport report={evidenceReport} />}
            {messages.some(message => message.role === 'assistant') && <details className="border border-slate-200 rounded-xl bg-white p-5"><summary className="text-sm font-semibold text-slate-600 cursor-pointer">Session history</summary><div className="space-y-4 mt-4">{messages.map(message => <div key={message.id} className="border-t border-slate-100 pt-4"><p className="text-xs font-semibold text-slate-400 mb-2">{message.role === 'user' ? 'Your input' : 'Keeper result'} · {new Date(message.timestamp).toLocaleString()}</p><pre className="text-sm whitespace-pre-wrap break-words font-sans text-slate-700">{message.content}</pre></div>)}</div></details>}
        </section>
    );
};

export default KeeperSandbox;
