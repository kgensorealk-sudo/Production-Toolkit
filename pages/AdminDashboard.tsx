import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, ToolId, DefaultAvatar } from '../types';
import { useAuth, withRetry } from '../contexts/AuthContext';
import { useNavigate } from 'react-router';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import ConfirmationModal from '../components/ConfirmationModal';
import RichTextEditor from '../components/RichTextEditor';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { History, Info, X, Radio, Signal, Terminal, Eye, Send, Save, Trash2, Layout as LayoutIcon, Play, Square, AlertTriangle, CheckCircle2, AlertCircle, ShieldCheck, Database, Zap, ExternalLink, Search, Filter, Copy, ChevronDown, ChevronUp, RefreshCw, Sparkles, Plus, Edit3, Sliders, Layers, Maximize2, Minimize2, MoreVertical, Calendar, CalendarPlus, Clock } from 'lucide-react';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'warning' | 'info' | 'success' | 'error';
    category: 'system_alerts' | 'security_updates' | 'maintenance_windows';
    is_active: boolean;
    is_mandatory: boolean;
    created_at: string;
}

interface AccessKeyRecord {
    id: string;
    key: string;
    tool: string;
    is_used: boolean;
    used_at?: string;
    user_id?: string;
    device_id?: string;
    created_at: string;
}

interface UsageLog {
    id: string;
    tool_id: string;
    user_id: string;
    timestamp: string;
}

interface FeedbackRecord {
    id: string;
    user_id: string;
    tool_id: string;
    type: 'bug' | 'feature';
    content: string;
    created_at: string;
    profiles?: {
        email: string;
    };
}

type IntelligenceRange = '24h' | '7d' | '30d';

const DURATION_OPTIONS = [
    { label: '1 Min (Testing)', value: 'trial_1m', type: 'trial' },
    { label: '3 Days', value: 'trial_3d', type: 'trial' },
    { label: '7 Days', value: 'trial_7d', type: 'trial' },
    { label: '15 Days', value: 'trial_15d', type: 'trial' },
    { label: '20 Days', value: 'trial_20d', type: 'trial' },
    { label: '1 Month', value: 'sub_1mo', type: 'sub' },
    { label: '3 Months', value: 'sub_3mo', type: 'sub' },
    { label: '6 Months', value: 'sub_6mo', type: 'sub' },
    { label: '1 Year', value: 'sub_1y', type: 'sub' },
];

const PROMO_DURATIONS = [
    { label: '24 Hours', value: 1 },
    { label: '7 Days', value: 7 },
    { label: '14 Days', value: 14 },
    { label: '30 Days', value: 30 }
];

const ONLINE_THRESHOLD_MS = 240000; // 4 minutes

const getDurationMs = (val: string) => {
    switch (val) {
        case 'trial_1m': return 60 * 1000;
        case 'trial_3d': return 3 * 24 * 60 * 60 * 1000;
        case 'trial_7d': return 7 * 24 * 60 * 60 * 1000;
        case 'trial_15d': return 15 * 24 * 60 * 60 * 1000;
        case 'trial_20d': return 20 * 24 * 60 * 60 * 1000;
        case 'sub_1mo': return 30 * 24 * 60 * 60 * 1000;
        case 'sub_3mo': return 90 * 24 * 60 * 60 * 1000;
        case 'sub_6mo': return 180 * 24 * 60 * 60 * 1000;
        case 'sub_1y': return 365 * 24 * 60 * 60 * 1000;
        default: return 365 * 24 * 60 * 60 * 1000;
    }
};

const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < ONLINE_THRESHOLD_MS) {
        return (
            <span className="text-emerald-500 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 text-[9px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> 
                Online
            </span>
        );
    }
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'users' | 'keys' | 'announcements' | 'config' | 'intelligence' | 'feedback' | 'avatars'>('users');
    const [isLoading, setIsLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const { freeToolsData, refreshFreeTools, refreshProfile } = useAuth();

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [search, setSearch] = useState('');
    const [selectedDurations, setSelectedDurations] = useState<Record<string, string>>({});

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newType, setNewType] = useState<'info' | 'warning' | 'success' | 'error'>('info');
    const [newCategory, setNewCategory] = useState<'system_alerts' | 'security_updates' | 'maintenance_windows'>('system_alerts');
    const [newMandatory, setNewMandatory] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [isWideTransmitter, setIsWideTransmitter] = useState(false);
    const [announcementSearch, setAnnouncementSearch] = useState('');
    const [announcementFilter, setAnnouncementFilter] = useState<'all' | 'active' | 'inactive' | 'mandatory' | 'info' | 'warning' | 'success' | 'error'>('all');
    const [expandedAnnouncementIds, setExpandedAnnouncementIds] = useState<string[]>([]);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    const [extendModalUser, setExtendModalUser] = useState<UserProfile | null>(null);
    const [extendTermKey, setExtendTermKey] = useState<string>('sub_1mo');
    const [customDateValue, setCustomDateValue] = useState<string>('');

    const [defaultAvatars, setDefaultAvatars] = useState<DefaultAvatar[]>([]);
    const [newAvatarName, setNewAvatarName] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);

    const [accessKeys, setAccessKeys] = useState<AccessKeyRecord[]>([]);
    const [keyTool, setKeyTool] = useState<string>('universal');
    const [keyQty, setKeyQty] = useState<number>(1);

    const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
    const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
    const [intelRange, setIntelRange] = useState<IntelligenceRange>('7d');
    const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
    
    const [promoDuration, setPromoDuration] = useState<number>(7);
    const lastSyncTimeRef = useRef<number>(Date.now());

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean; title: string; message: string; confirmLabel?: string; type: 'primary' | 'danger'; onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'primary', onConfirm: () => {} });

    const getToolName = (tid: string) => {
        switch (tid) {
            case ToolId.XML_RENUMBER: return "XML Normalizer";
            case ToolId.CREDIT_GENERATOR: return "CRediT Tagging";
            case ToolId.UNCITED_CLEANER: return "Uncited Ref Cleaner";
            case ToolId.OTHER_REF_SCANNER: return "Other-Ref Scanner";
            case ToolId.REFERENCE_GEN: return "Reference Updater";
            case ToolId.REF_DUPE_CHECK: return "Duplicate Ref Remover";
            case ToolId.HIGHLIGHTS_GEN: return "Article Highlights Gen";
            case ToolId.QUICK_DIFF: return "Quick Text Diff";
            case ToolId.TAG_CLEANER: return "XML Tag Cleaner";
            case ToolId.TABLE_FIXER: return "XML Table Fixer";
            case ToolId.TABLE_BEAUTIFIER: return "Table XML Beautifier";
            case ToolId.VIEW_SYNC: return "View Synchronizer";
            case ToolId.REF_EXTRACTOR: return "Bib Extractor";
            case ToolId.GRANT_TAGGER: return "Grant XML Tagger";
            case ToolId.ID_AUDITOR: return "ID Prefix Auditor";
            case ToolId.COMMENT_REPLACER: return "Comment Replacer";
            case ToolId.CITATION_LINKER: return "Citation Linker Pro";
            case ToolId.CITATION_LINKER_EXP: return "Citation Linker Pro MAX";
            case ToolId.FORMULA_EDITOR_EXP: return "Formula Studio Pro (Experimental)";
            case 'universal': return "Universal Access";
            default: return tid;
        }
    };

    const fetchUsers = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('profiles').select('*').order('last_seen', { ascending: false, nullsFirst: false });
                if (error) throw error;
                return data;
            });
            if (data) {
                setUsers(data);
                setSelectedDurations(prev => {
                    const next = { ...prev };
                    let changed = false;
                    data.forEach(u => {
                        if (!next[u.id]) {
                            next[u.id] = 'sub_1y';
                            changed = true;
                        }
                    });
                    return changed ? next : prev;
                });
            }
        } catch (error: any) {
            if (!isSilent) setToast({ msg: `Personnel fetch failed: ${error.message}`, type: 'error' });
        } finally { 
            if (!isSilent) setIsLoading(false); 
        }
    }, []);

    const fetchAccessKeys = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('access_keys').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            });
            setAccessKeys(data || []);
        } catch (error: any) {
            if (!isSilent) setToast({ msg: `Key database fetch failed: ${error.message}`, type: 'error' });
        } finally { 
            if (!isSilent) setIsLoading(false); 
        }
    }, []);

    const fetchIntelligence = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('usage_logs').select('*, profiles(email, is_subscribed, subscription_end)').order('timestamp', { ascending: false });
                if (error) throw error;
                return data;
            });
            setUsageLogs(data || []);
        } catch (error: any) {
            console.warn("Usage logs sync pending.");
        } finally { 
            if (!isSilent) setIsLoading(false); 
        }
    }, []);

    const fetchAnnouncements = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            });
            setAnnouncements(data || []);
        } catch (error: any) { 
            if (!isSilent) setToast({ msg: 'Broadcast fetch failed', type: 'error' }); 
        } finally { 
            if (!isSilent) setIsLoading(false); 
        }
    }, []);

    const fetchDefaultAvatars = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            // Ensure storage bucket exists
            try {
                await withRetry(async () => {
                    const { data: buckets } = await supabase.storage.listBuckets();
                    const exists = buckets?.some(b => b.name === 'avatars');
                    if (!exists) {
                        await supabase.storage.createBucket('avatars', {
                            public: true,
                            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
                            fileSizeLimit: 2097152 // 2MB
                        });
                    }
                }, 2);
            } catch (storageErr) {
                console.warn("Storage bucket auto-provisioning failed:", storageErr);
            }

            const data = await withRetry(async () => {
                const { data, error } = await supabase.from('default_avatars').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            });
            setDefaultAvatars(data || []);
        } catch (error: any) {
            if (!isSilent) setToast({ msg: 'Avatar fetch failed', type: 'error' });
        } finally {
            if (!isSilent) setIsLoading(false);
        }
    }, []);

    const fetchFeedbacks = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const data = await withRetry(async () => {
                const { data, error } = await supabase
                    .from('feedback')
                    .select('*, profiles(email)')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            });
            setFeedbacks(data || []);
        } catch (error: any) {
            if (!isSilent) setToast({ msg: 'Feedback fetch failed', type: 'error' });
        } finally {
            if (!isSilent) setIsLoading(false);
        }
    }, []);

    const refreshActiveTab = useCallback(async (isSilent = true) => {
        if (Date.now() - lastSyncTimeRef.current < 3000) return;
        lastSyncTimeRef.current = Date.now();

        try {
            if (activeTab === 'users') await fetchUsers(isSilent);
            else if (activeTab === 'announcements') await fetchAnnouncements(isSilent);
            else if (activeTab === 'feedback') await fetchFeedbacks(isSilent);
            else if (activeTab === 'avatars') await fetchDefaultAvatars(isSilent);
            else if (activeTab === 'keys') { await Promise.all([fetchUsers(true), fetchAccessKeys(isSilent)]); }
            else if (activeTab === 'config') { await Promise.all([fetchIntelligence(true), refreshFreeTools()]); }
            else if (activeTab === 'intelligence') await Promise.all([fetchUsers(true), fetchAccessKeys(true), fetchIntelligence(isSilent)]);
        } catch (e) {
            console.error("Silent sync failed:", e);
        }
    }, [activeTab, fetchUsers, fetchAnnouncements, fetchAccessKeys, refreshFreeTools, fetchIntelligence, fetchFeedbacks]);

    const refreshActiveTabRef = useRef(refreshActiveTab);
    useEffect(() => {
        refreshActiveTabRef.current = refreshActiveTab;
    }, [refreshActiveTab]);

    useEffect(() => {
        const handleWake = () => {
            if (document.visibilityState === 'visible') {
                refreshActiveTabRef.current?.(true);
            }
        };
        window.addEventListener('visibilitychange', handleWake);
        window.addEventListener('focus', handleWake);
        return () => {
            window.removeEventListener('visibilitychange', handleWake);
            window.removeEventListener('focus', handleWake);
        };
    }, []);

    useEffect(() => {
        refreshActiveTab(false);
    }, [activeTab]); 

    // Safety Timeout for Loading State
    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        if (isLoading) {
            timeout = setTimeout(() => {
                console.warn("Operation timed out. Forcing loading state to false.");
                setIsLoading(prev => prev ? false : prev);
                setToast({ msg: "System response delayed. Please try again.", type: 'warn' });
            }, 30000); // 30s safety cutoff
        }
        return () => clearTimeout(timeout);
    }, [isLoading]);

    const systemHardReset = async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                refreshProfile(),
                refreshFreeTools(),
                fetchUsers(true),
                fetchAccessKeys(true),
                fetchIntelligence(true),
                fetchAnnouncements(true)
            ]);
            setToast({ msg: "System Integrity Synchronized.", type: "success" });
        } catch (e: any) {
            setToast({ msg: `Synchronization Protocol Failed: ${e.message}`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const purgeTelemetry = () => {
        setConfirmConfig({
            isOpen: true,
            title: 'Wipe Intelligence Node',
            message: 'This will permanently delete all production usage logs. This action cannot be reversed. Proceed with system reset?',
            confirmLabel: 'Purge Database',
            type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await withRetry(async () => {
                        const { error } = await supabase.from('usage_logs').delete().neq('tool_id', 'SYSTEM_RESERVED_VAL');
                        if (error) throw error;
                    });
                    setUsageLogs([]);
                    setToast({ msg: "Telemetry databases purged successfully.", type: "success" });
                } catch (err: any) {
                    setToast({ msg: `Purge protocol rejected: ${err.message}`, type: "error" });
                } finally {
                    setIsLoading(false);
                }
            }
        });
    };

    const exportRawTelemetry = () => {
        if (usageLogs.length === 0) return;
        const headers = ['Timestamp', 'Operator_ID', 'Protocol_ID', 'Status_Role'];
        const userMap = new Map<string, UserProfile>(users.map(u => [u.id, u]));
        
        const rows = usageLogs.map(log => {
            const user = userMap.get(log.user_id);
            return [
                log.timestamp,
                user?.email || `DELETED_USER_${log.user_id.substring(0,8)}`,
                log.tool_id,
                user?.is_subscribed ? 'PREMIUM' : 'STANDARD'
            ];
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `production_telemetry_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        setToast({ msg: "Telemetry dump successful.", type: "success" });
    };

    const handleRevokeKey = async (keyRecord: AccessKeyRecord) => {
        setIsLoading(true);
        try {
            await withRetry(async () => {
                const { error } = await supabase.from('access_keys').update({ is_used: false, user_id: null, device_id: null, used_at: null }).eq('id', keyRecord.id);
                if (error) throw error;
            });
            setAccessKeys(prev => prev.map(k => k.id === keyRecord.id ? { ...k, is_used: false, user_id: undefined, device_id: undefined, used_at: undefined } : k));
            setToast({ msg: 'Key access reset.', type: 'success' });
        } catch (err: any) {
            setToast({ msg: 'Revocation blocked', type: 'error' });
        } finally { setIsLoading(false); }
    };

    const handleDeleteKey = (keyId: string) => {
        setConfirmConfig({
            isOpen: true, title: 'Delete Access Key', message: 'Purge this license?', confirmLabel: 'Delete', type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await withRetry(async () => {
                        const { error } = await supabase.from('access_keys').delete().eq('id', keyId);
                        if (error) throw error;
                    });
                    setAccessKeys(prev => prev.filter(k => k.id !== keyId));
                    setToast({ msg: 'Key purged', type: 'success' });
                } catch (err: any) { setToast({ msg: 'Deletion failed', type: 'error' }); } finally { setIsLoading(false); }
            }
        });
    };

    const toggleSubscription = async (user: UserProfile) => {
        const newVal = !user.is_subscribed;
        const selectedKey = selectedDurations[user.id] || 'sub_1y';
        const durationOption = DURATION_OPTIONS.find(o => o.value === selectedKey);
        const updates: any = { is_subscribed: newVal };
        
        if (newVal) {
            const end = new Date(Date.now() + getDurationMs(selectedKey)).toISOString();
            updates.subscription_end = end;
            if (durationOption?.type === 'trial') {
                updates.trial_start = new Date().toISOString();
                updates.trial_end = end;
            } else {
                updates.trial_start = null; updates.trial_end = null;
            }
        } else {
            updates.subscription_end = null; updates.trial_start = null; updates.trial_end = null;
        }

        if (newVal) {
            const formattedEnd = updates.subscription_end ? new Date(updates.subscription_end).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Lifetime / Active';
            const notice = {
                id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                title: "Subscription Access Authorized",
                email: user.email,
                newExpiry: formattedEnd,
                extensionLabel: durationOption?.label ? `Authorized (${durationOption.label})` : 'Authorized',
                extendedAt: new Date().toISOString(),
                isRead: false
            };
            const currentPrefs = (user.notification_preferences as any) || {};
            updates.notification_preferences = {
                ...currentPrefs,
                pending_extension_notice: notice
            };
        }

        setIsLoading(true);
        try {
            await withRetry(async () => {
                const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
                if (error) throw error;
            });
            setUsers(users.map(u => u.id === user.id ? { ...u, ...updates } : u));
            window.dispatchEvent(new CustomEvent('app:subscription-extended', { detail: { notice: updates.notification_preferences?.pending_extension_notice } }));
            setToast({ msg: newVal ? `Authorized (${durationOption?.label})` : 'Access Terminated', type: 'success' });
        } catch (err: any) { setToast({ msg: 'Operation failed', type: 'error' }); } finally { setIsLoading(false); }
    };

    const extendUserExpiry = async (user: UserProfile, termKeyOrCustomIso?: string) => {
        setIsLoading(true);
        try {
            let newEndIso: string;
            let extensionLabel: string;

            const currentEndMs = user.subscription_end ? new Date(user.subscription_end).getTime() : 0;
            const nowMs = Date.now();
            const baseMs = currentEndMs > nowMs ? currentEndMs : nowMs;

            if (termKeyOrCustomIso && termKeyOrCustomIso.startsWith('custom:')) {
                const targetDateStr = termKeyOrCustomIso.replace('custom:', '');
                const targetObj = new Date(`${targetDateStr}T23:59:59.999Z`);
                newEndIso = targetObj.toISOString();
                extensionLabel = `Set to ${targetObj.toLocaleDateString()}`;
            } else {
                const selectedKey = termKeyOrCustomIso || selectedDurations[user.id] || 'sub_1y';
                const durationOption = DURATION_OPTIONS.find(o => o.value === selectedKey);
                const extensionMs = getDurationMs(selectedKey);
                newEndIso = new Date(baseMs + extensionMs).toISOString();
                extensionLabel = `+${durationOption?.label || 'Extended'}`;
            }

            const formattedDate = new Date(newEndIso).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const notice = {
                id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                title: "Subscription Access Extended",
                email: user.email,
                newExpiry: formattedDate,
                extensionLabel: extensionLabel,
                extendedAt: new Date().toISOString(),
                isRead: false
            };

            const currentPrefs = (user.notification_preferences as any) || {};
            const updates: any = {
                is_subscribed: true,
                subscription_end: newEndIso,
                trial_start: null,
                trial_end: null,
                notification_preferences: {
                    ...currentPrefs,
                    pending_extension_notice: notice
                }
            };

            await withRetry(async () => {
                const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
                if (error) throw error;
            });

            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...updates } : u));
            window.dispatchEvent(new CustomEvent('app:subscription-extended', { detail: { notice } }));

            setToast({ 
                msg: `Expiry extended for ${user.email} (${extensionLabel}) -> New Expiry: ${formattedDate}`, 
                type: 'success' 
            });
            setExtendModalUser(null);
        } catch (err: any) { 
            setToast({ msg: `Extend operation failed: ${err.message}`, type: 'error' }); 
        } finally { 
            setIsLoading(false); 
        }
    };

    const toggleFreeTool = async (tid: string) => {
        setIsLoading(true);
        try {
            const nextData = await withRetry(async () => {
                const { data: latest, error: fetchError } = await supabase.from('system_settings').select('free_tools_data').eq('id', 'global').maybeSingle();
                if (fetchError) throw fetchError;
                
                const next = { ...latest?.free_tools_data || {} };
                if (next[tid]) delete next[tid];
                else {
                    const expiry = new Date(); 
                    expiry.setDate(expiry.getDate() + promoDuration);
                    next[tid] = expiry.toISOString();
                }

                const { error: updateError } = await supabase.from('system_settings').upsert({ id: 'global', free_tools_data: next, updated_at: new Date().toISOString() });
                if (updateError) throw updateError;
                return next;
            });
            
            await refreshFreeTools();
            setToast({ msg: `System protocol synchronized (${promoDuration}d Promo)`, type: 'success' });
        } catch (err: any) {
            setToast({ msg: 'Protocol update rejected', type: 'error' });
        } finally { setIsLoading(false); }
    };

    const masterUnlock = async () => {
        setConfirmConfig({
            isOpen: true,
            title: 'Master Protocol Unlock',
            message: 'This will unlock ALL production tools for the next 24 hours. Proceed with emergency node deployment?',
            confirmLabel: 'Initialize Unlock',
            type: 'primary',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await withRetry(async () => {
                        const expiry = new Date(); 
                        expiry.setDate(expiry.getDate() + 1);
                        const nextData: Record<string, string> = {};
                        Object.values(ToolId).forEach(tid => { if (tid !== 'dashboard' && tid !== 'docs') nextData[tid] = expiry.toISOString(); });
                        
                        const { error } = await supabase.from('system_settings').upsert({ id: 'global', free_tools_data: nextData, updated_at: new Date().toISOString() });
                        if (error) throw error;
                    });
                    await refreshFreeTools();
                    setToast({ msg: 'Master protocol deployed: All nodes unlocked.', type: 'success' });
                } catch (err: any) { setToast({ msg: 'Unlock sequence failed', type: 'error' }); } finally { setIsLoading(false); }
            }
        });
    };

    const masterRevoke = async () => {
        setConfirmConfig({
            isOpen: true,
            title: 'Master Protocol Revocation',
            message: 'This will instantly lock ALL free-tier tools. Persistent keys will still function. Proceed?',
            confirmLabel: 'Revoke All Access',
            type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await withRetry(async () => {
                        const { error } = await supabase.from('system_settings').upsert({ id: 'global', free_tools_data: {}, updated_at: new Date().toISOString() });
                        if (error) throw error;
                    });
                    await refreshFreeTools();
                    setToast({ msg: 'Protocol strictly enforced: All free access revoked.', type: 'warn' });
                } catch (err: any) { setToast({ msg: 'Revocation failed', type: 'error' }); } finally { setIsLoading(false); }
            }
        });
    };

    const generateKeys = async () => {
        setIsLoading(true);
        try {
            const newKeys: any[] = [];
            for (let i = 0; i < keyQty; i++) {
                const random = Math.random().toString(36).substring(2, 10).toUpperCase();
                newKeys.push({ key: `${random.slice(0,4)}-${random.slice(4)}`, tool: keyTool, is_used: false });
            }
            await withRetry(async () => {
                const { data, error } = await supabase.from('access_keys').insert(newKeys).select();
                if (error) throw error;
                if (data) setAccessKeys(prev => [...data, ...prev]);
            });
            setToast({ msg: `Provisioned ${keyQty} keys`, type: 'success' });
        } catch (err: any) { setToast({ msg: 'Generation failed', type: 'error' }); } finally { setIsLoading(false); }
    };

    const saveAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (editingId) {
                const fullPayload: any = { 
                    title: newTitle, 
                    content: newContent, 
                    type: newType, 
                    category: newCategory,
                    is_mandatory: newMandatory,
                    updated_at: new Date().toISOString()
                };

                await withRetry(async () => {
                    let { error } = await supabase.from('announcements').update(fullPayload).eq('id', editingId);
                    
                    if (error) {
                        console.warn("Full payload update failed, trying without category/is_mandatory:", error);
                        const { category, is_mandatory, ...tier2Payload } = fullPayload;
                        let { error: err2 } = await supabase.from('announcements').update(tier2Payload).eq('id', editingId);
                        error = err2;
                        
                        if (error) {
                            console.warn("Tier 2 update failed, trying basic payload:", error);
                            const { updated_at, ...tier3Payload } = tier2Payload;
                            let { error: err3 } = await supabase.from('announcements').update(tier3Payload).eq('id', editingId);
                            error = err3;
                        }
                    }
                    
                    if (error) throw error;
                    setAnnouncements(prev => prev.map(a => a.id === editingId ? { ...a, ...fullPayload } : a));
                });
                setToast({ msg: 'Broadcast updated & synced', type: 'success' });
            } else {
                const fullPayload: any = { 
                    title: newTitle, 
                    content: newContent, 
                    type: newType, 
                    category: newCategory,
                    is_mandatory: newMandatory,
                    is_active: false
                };

                await withRetry(async () => {
                    let { data, error } = await supabase.from('announcements').insert([fullPayload]).select();
                    
                    if (error) {
                        console.warn("Full payload insert failed, trying fallback payload without category/is_mandatory:", error);
                        const { category, is_mandatory, ...tier2Payload } = fullPayload;
                        let { data: d2, error: err2 } = await supabase.from('announcements').insert([tier2Payload]).select();
                        data = d2;
                        error = err2;
                        
                        if (error) {
                            console.warn("Tier 2 insert failed, trying minimal payload:", error);
                            const tier3Payload = { title: newTitle, content: newContent, type: newType, is_active: false };
                            let { data: d3, error: err3 } = await supabase.from('announcements').insert([tier3Payload]).select();
                            data = d3;
                            error = err3;

                            if (error) {
                                const { error: err4 } = await supabase.from('announcements').insert([tier3Payload]);
                                error = err4;
                                if (!error) {
                                    data = [{ id: crypto.randomUUID(), ...tier3Payload, created_at: new Date().toISOString() }];
                                }
                            }
                        }
                    }
                    
                    if (error) throw error;
                    if (data && data.length > 0) {
                        setAnnouncements(prev => [data[0] as Announcement, ...prev]);
                    }
                });
                setToast({ msg: 'Broadcast created successfully', type: 'success' });
            }

            // Sync with all tabs and header
            window.dispatchEvent(new CustomEvent('app:announcement-sync'));

            setNewTitle(''); setNewContent(''); setNewType('info'); setNewCategory('system_alerts'); setNewMandatory(false); setEditingId(null);
        } catch (err: any) { 
            console.error("SAVE_BROADCAST_FAILED:", err);
            const errorMsg = err.message || err.details || err.hint || (typeof err === 'string' ? err : 'Database error');
            setToast({ 
                msg: `Save Failed: ${errorMsg}`, 
                type: 'error' 
            }); 
        } finally { 
            setIsLoading(false); 
        }
    };

    const editAnnouncement = (a: Announcement) => { 
        setEditingId(a.id); 
        setNewTitle(a.title); 
        setNewContent(a.content); 
        setNewType(a.type); 
        setNewCategory(a.category || 'system_alerts');
        setNewMandatory(a.is_mandatory || false);
    };

    const testAnnouncement = (a: Announcement) => {
        window.dispatchEvent(new CustomEvent('app:show-announcement-detail', { detail: a }));
        setToast({ msg: 'Displaying test broadcast modal', type: 'success' });
    };

    const activateAnnouncement = async (id: string) => {
        setIsLoading(true);
        try {
            const target = announcements.find(a => a.id === id);
            if (!target) return;
            const nextStatus = !target.is_active;
            const now = new Date().toISOString();

            await withRetry(async () => {
                if (nextStatus) {
                    await supabase.from('announcements').update({ is_active: false }).neq('id', id);
                }
                let { error } = await supabase.from('announcements').update({ 
                    is_active: nextStatus,
                    updated_at: now
                }).eq('id', id);

                if (error) {
                    const { error: err2 } = await supabase.from('announcements').update({ 
                        is_active: nextStatus
                    }).eq('id', id);
                    error = err2;
                }

                if (error) throw error;
            });

            setAnnouncements(prev => prev.map(a => (
                a.id === id 
                    ? { ...a, is_active: nextStatus, updated_at: now } 
                    : (nextStatus ? { ...a, is_active: false } : a)
            )));

            window.dispatchEvent(new CustomEvent('app:announcement-sync'));
            if (nextStatus) {
                window.dispatchEvent(new CustomEvent('app:show-announcement'));
            }

            setToast({ msg: nextStatus ? 'Broadcast Live & Synced' : 'Broadcast Halted', type: 'success' });
        } catch (err: any) { 
            setToast({ msg: `State update failed: ${err.message || 'Error'}`, type: 'error' }); 
        } finally { 
            setIsLoading(false); 
        }
    };

    const deleteAnnouncement = async (id: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Broadcast',
            message: 'Permanently remove this announcement from the system?',
            confirmLabel: 'Delete',
            type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await withRetry(async () => {
                        const { error } = await supabase.from('announcements').delete().eq('id', id);
                        if (error) throw error;
                    });
                    setAnnouncements(prev => prev.filter(a => a.id !== id));
                    setToast({ msg: 'Broadcast purged', type: 'success' });
                } catch (err: any) { 
                    setToast({ msg: 'Deletion failed', type: 'error' }); 
                } finally { 
                    setIsLoading(false); 
                }
            }
        });
    };

    const toggleExpandAnnouncement = (id: string) => {
        setExpandedAnnouncementIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const cloneAnnouncement = (a: Announcement) => {
        setEditingId(null);
        setNewTitle(`${a.title} (Draft Copy)`);
        setNewContent(a.content);
        setNewType(a.type || 'info');
        setNewCategory(a.category || 'system_alerts');
        setNewMandatory(a.is_mandatory || false);
        setToast({ msg: 'Broadcast cloned into Signal Transmitter panel', type: 'success' });
    };

    const announcementStats = useMemo(() => {
        const total = announcements.length;
        const active = announcements.filter(a => a.is_active).length;
        const mandatory = announcements.filter(a => a.is_mandatory).length;
        const critical = announcements.filter(a => a.type === 'error' || a.type === 'warning').length;
        return { total, active, mandatory, critical };
    }, [announcements]);

    const filteredAnnouncements = useMemo(() => {
        return announcements.filter(a => {
            const query = announcementSearch.toLowerCase().trim();
            const matchesSearch = !query || 
                a.title.toLowerCase().includes(query) || 
                a.content.toLowerCase().includes(query) ||
                a.id.toLowerCase().includes(query) ||
                (a.category && a.category.toLowerCase().includes(query));

            if (!matchesSearch) return false;

            if (announcementFilter === 'active') return a.is_active;
            if (announcementFilter === 'inactive') return !a.is_active;
            if (announcementFilter === 'mandatory') return a.is_mandatory;
            if (announcementFilter === 'info') return a.type === 'info';
            if (announcementFilter === 'warning') return a.type === 'warning';
            if (announcementFilter === 'success') return a.type === 'success';
            if (announcementFilter === 'error') return a.type === 'error';

            return true;
        });
    }, [announcements, announcementSearch, announcementFilter]);

    const handleAvatarUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!avatarFile || !newAvatarName) {
            setToast({ msg: 'Please provide both a name and a file', type: 'warn' });
            return;
        }

        setIsLoading(true);
        try {
            const fileExt = avatarFile.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `default-avatars/${fileName}`;

            await withRetry(async () => {
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, avatarFile);
                if (uploadError) throw uploadError;
            });

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            await withRetry(async () => {
                const { data, error: dbError } = await supabase
                    .from('default_avatars')
                    .insert([{ name: newAvatarName, url: publicUrl }])
                    .select();
                if (dbError) throw dbError;
                if (data) setDefaultAvatars(prev => [data[0], ...prev]);
            });

            setNewAvatarName('');
            setAvatarFile(null);
            setToast({ msg: 'Avatar uploaded successfully', type: 'success' });
        } catch (err: any) {
            setToast({ msg: `Upload failed: ${err.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const deleteAvatar = async (avatar: DefaultAvatar) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Avatar',
            message: `Permanently remove ${avatar.name}?`,
            confirmLabel: 'Delete',
            type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await withRetry(async () => {
                        const { error } = await supabase.from('default_avatars').delete().eq('id', avatar.id);
                        if (error) throw error;
                    });
                    setDefaultAvatars(prev => prev.filter(a => a.id !== avatar.id));
                    setToast({ msg: 'Avatar removed', type: 'success' });
                } catch (err: any) {
                    setToast({ msg: 'Deletion failed', type: 'error' });
                } finally {
                    setIsLoading(false);
                }
            }
        });
    };

    const handleDeleteFeedback = (id: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Feedback',
            message: 'Are you sure you want to delete this feedback entry?',
            confirmLabel: 'Delete',
            type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    await withRetry(async () => {
                        const { error } = await supabase.from('feedback').delete().eq('id', id);
                        if (error) throw error;
                    });
                    setFeedbacks(prev => prev.filter(f => f.id !== id));
                    setToast({ msg: 'Feedback deleted', type: 'success' });
                } catch (err: any) {
                    setToast({ msg: 'Failed to delete feedback', type: 'error' });
                } finally {
                    setIsLoading(false);
                }
            }
        });
    };

    const activeNodesCount = users.filter(u => {
        if (!u.last_seen) return false;
        return (Date.now() - new Date(u.last_seen).getTime()) < ONLINE_THRESHOLD_MS;
    }).length;

    const focusedUserData = useMemo(() => {
        if (!focusedUserId) return null;
        const user = users.find(u => u.id === focusedUserId);
        const logs = usageLogs.filter(l => l.user_id === focusedUserId);
        const toolStats: Record<string, number> = {};
        logs.forEach(l => {
            toolStats[l.tool_id] = (toolStats[l.tool_id] || 0) + 1;
        });
        return { user, logs, toolStats };
    }, [focusedUserId, users, usageLogs]);

    const intelligenceMetrics = useMemo(() => {
        if (usageLogs.length === 0) return { globalRanking: [], userAffinities: [], rareTools: [], filteredTotal: 0, growth: 0, segments: { premium: 0, standard: 0, segmentCounts: { premium: {}, standard: {} } }, hourlyIntensity: new Array(24).fill(0), recentActivity: [], toolUsage24h: {}, anomalies: [] };

        const now = new Date().getTime();
        const userMap = new Map<string, UserProfile>(users.map(u => [u.id, u]));

        const getRangeMs = (r: IntelligenceRange) => {
            switch(r) {
                case '24h': return 24 * 60 * 60 * 1000;
                case '7d': return 7 * 24 * 60 * 60 * 1000;
                case '30d': return 30 * 24 * 60 * 60 * 1000;
                default: return 30 * 24 * 60 * 60 * 1000;
            }
        };

        const rangeMs = getRangeMs(intelRange);
        
        const filteredLogs = usageLogs.filter(log => {
            const logTime = new Date(log.timestamp).getTime();
            return (now - logTime) <= rangeMs;
        });

        const toolUsage24h: Record<string, number> = {};
        usageLogs.forEach(log => {
            if ((now - new Date(log.timestamp).getTime()) <= (24 * 60 * 60 * 1000)) {
                toolUsage24h[log.tool_id] = (toolUsage24h[log.tool_id] || 0) + 1;
            }
        });

        const hourlyIntensity = new Array(24).fill(0);
        filteredLogs.forEach(log => {
            const hour = new Date(log.timestamp).getHours();
            hourlyIntensity[hour]++;
        });

        let growth = 0;
        const prevWindowLogs = usageLogs.filter(log => {
            const logTime = new Date(log.timestamp).getTime();
            const diff = now - logTime;
            return diff > rangeMs && diff <= (rangeMs * 2);
        });
        if (prevWindowLogs.length > 0) {
            growth = Math.round(((filteredLogs.length - prevWindowLogs.length) / prevWindowLogs.length) * 100);
        } else {
            growth = filteredLogs.length > 0 ? 100 : 0;
        }

        const toolCounts: Record<string, number> = {};
        const userToolCounts: Record<string, Record<string, number>> = {};
        const userLastAction: Record<string, { tool: string, time: string }> = {};
        
        let premiumUsage = 0;
        let standardUsage = 0;
        const segmentCounts: Record<string, Record<string, number>> = { premium: {}, standard: {} };

        filteredLogs.forEach(log => {
            const user = userMap.get(log.user_id);
            const isPremium = !!user?.is_subscribed;
            if (isPremium) {
                premiumUsage++;
                segmentCounts.premium[log.tool_id] = (segmentCounts.premium[log.tool_id] || 0) + 1;
            } else {
                standardUsage++;
                segmentCounts.standard[log.tool_id] = (segmentCounts.standard[log.tool_id] || 0) + 1;
            }
            toolCounts[log.tool_id] = (toolCounts[log.tool_id] || 0) + 1;
            if (!userToolCounts[log.user_id]) userToolCounts[log.user_id] = {};
            userToolCounts[log.user_id][log.tool_id] = (userToolCounts[log.user_id][log.tool_id] || 0) + 1;
            if (!userLastAction[log.user_id]) userLastAction[log.user_id] = { tool: log.tool_id, time: log.timestamp };
        });

        const allAvailableTools = Object.values(ToolId).filter(id => id !== 'dashboard' && id !== 'docs');
        const globalRanking = allAvailableTools.map(id => ({ id, name: getToolName(id), count: toolCounts[id] || 0 })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        const rareTools = globalRanking.filter(r => r.count < (intelRange === '30d' ? 5 : 2)).reverse();

        const userAffinities = users.map(user => {
            const counts = userToolCounts[user.id] || {};
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            return {
                id: user.id,
                email: user.email,
                avatar_url: user.avatar_url,
                topTool: sorted.length > 0 ? getToolName(sorted[0][0]) : 'None',
                totalActions: Object.values(counts).reduce((a, b) => a + b, 0),
                breakdown: sorted.map(([tid, count]) => ({ name: getToolName(tid), count })),
                lastAction: userLastAction[user.id]
            };
        }).filter(ua => ua.totalActions > 0).sort((a, b) => b.totalActions - a.totalActions);

        const recentActivity = usageLogs.slice(0, 10).map(log => {
            const user = userMap.get(log.user_id);
            return {
                id: log.id,
                timestamp: log.timestamp,
                toolName: getToolName(log.tool_id),
                user: user?.email || `Anonymous_${log.user_id.slice(0,4)}`,
                userId: log.user_id,
                avatar_url: user?.avatar_url
            };
        });

        const anomalies = filteredLogs.filter(log => {
            const user = userMap.get(log.user_id);
            if (!user) return false;
            const isPremium = !!user.is_subscribed;
            const isFree = !!freeToolsData[log.tool_id];
            const hasKey = accessKeys.some(k => k.user_id === log.user_id && (k.tool === log.tool_id || k.tool === 'universal') && k.is_used);
            return !isPremium && !isFree && !hasKey;
        }).map(log => {
            const user = userMap.get(log.user_id);
            return {
                id: log.id,
                timestamp: log.timestamp,
                toolName: getToolName(log.tool_id),
                user: user?.email || `Unknown_${log.user_id.slice(0,4)}`,
                userId: log.user_id,
                avatar_url: user?.avatar_url
            };
        });

        return { globalRanking, userAffinities, rareTools, filteredTotal: filteredLogs.length, growth, segments: { premium: premiumUsage, standard: standardUsage, segmentCounts }, hourlyIntensity, recentActivity, toolUsage24h, anomalies };
    }, [usageLogs, users, intelRange, freeToolsData, accessKeys]);

    const focusedUser = useMemo(() => {
        if (!focusedUserId) return null;
        return intelligenceMetrics.userAffinities.find(u => u.id === focusedUserId);
    }, [focusedUserId, intelligenceMetrics.userAffinities]);

    const getCountdown = (expiry: string) => {
        const diff = new Date(expiry).getTime() - Date.now();
        if (diff <= 0) {
            const absDiff = Math.abs(diff);
            const d = Math.floor(absDiff / (1000 * 60 * 60 * 24));
            const h = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
            if (d > 0) return `${d}d ${h}h ${m}m ago`;
            if (h > 0) return `${h}h ${m}m ago`;
            if (m > 0) return `${m}m ago`;
            return 'Just now';
        }
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (d > 0) {
            return `${d}d ${h}h ${m}m remaining`;
        }
        if (h > 0) {
            return `${h}h ${m}m remaining`;
        }
        return `${m}m remaining`;
    };

    return (
        <div className="max-w-full mx-auto px-2 py-12 sm:px-4 lg:px-6">
            <ConfirmationModal isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} confirmLabel={confirmConfig.confirmLabel} type={confirmConfig.type} onConfirm={() => { confirmConfig.onConfirm(); setConfirmConfig(prev => ({ ...prev, isOpen: false })); }} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl uppercase tracking-widest leading-none">Admin Console</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Central Authorization & Intelligence Node</p>
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={systemHardReset}
                        className="bg-white border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] shadow-sm hover:bg-slate-50 transition-all flex items-center gap-3"
                    >
                        <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Integrity Sync
                    </button>
                    <div className="bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-6 border border-slate-200 shadow-sm">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">System Integrity</span>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Operational</span>
                            </div>
                        </div>
                        <div className="w-px h-6 bg-slate-200"></div>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Active Nodes</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-black text-slate-900 font-mono leading-none">{activeNodesCount}</span>
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl mb-6 w-full max-w-5xl overflow-x-auto">
                <button onClick={() => setActiveTab('users')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Personnel</button>
                <button onClick={() => setActiveTab('keys')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'keys' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Key Matrix</button>
                <button onClick={() => setActiveTab('intelligence')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'intelligence' ? 'bg-white text-purple-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Intelligence</button>
                <button onClick={() => setActiveTab('feedback')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'feedback' ? 'bg-white text-amber-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Feedback</button>
                <button onClick={() => setActiveTab('avatars')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'avatars' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Avatars</button>
                <button onClick={() => setActiveTab('config')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'config' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Protocols</button>
                <button onClick={() => setActiveTab('announcements')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'announcements' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Broadcasts</button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[600px] relative">
                {isLoading && <LoadingOverlay message="Synchronizing..." color="slate" />}
                
                {activeTab === 'users' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="relative flex-grow max-w-md group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <svg className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Search by Identity (Email)..." 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 placeholder-slate-400 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none shadow-sm"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter:</span>
                                <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                                    <button 
                                        onClick={() => setSearch('')} 
                                        className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${!search ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        All
                                    </button>
                                    <button 
                                        onClick={() => setSearch('Authorized')} 
                                        className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${search === 'Authorized' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        Authorized
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                                    <tr>
                                        <th className="px-6 py-4 text-left">Identity</th>
                                        <th className="px-6 py-4 text-left">Role</th>
                                        <th className="px-6 py-4 text-left">Status</th>
                                        <th className="px-6 py-4 text-left">Expiry</th>
                                        <th className="px-6 py-4 text-center">Activity</th>
                                        <th className="px-6 py-4 text-left">Control</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100 font-medium">
                                    {users.filter(u => {
                                        const matchesSearch = u.email.toLowerCase().includes(search.toLowerCase());
                                        if (search === 'Authorized') return u.is_subscribed;
                                        return matchesSearch;
                                    }).map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4"><div className="flex flex-col"><span className="text-sm font-bold text-slate-900">{u.email}</span><span className="text-[10px] font-mono text-slate-400 uppercase">{u.id.slice(0, 13)}...</span></div></td>
                                            <td className="px-6 py-4 text-xs font-black uppercase text-slate-400 tracking-tighter">{u.role}</td>
                                            <td className="px-6 py-4"><span className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest border ${u.is_subscribed ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{u.is_subscribed ? 'Authorized' : 'Dormant'}</span></td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                        <span className="text-xs font-bold text-slate-800 font-mono">
                                                            {u.subscription_end 
                                                                ? new Date(u.subscription_end).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) 
                                                                : 'No Expiry Set'}
                                                        </span>
                                                    </div>
                                                    {u.subscription_end && (
                                                        new Date(u.subscription_end) < new Date() ? (
                                                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                                                Expired ({getCountdown(u.subscription_end)})
                                                            </span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold text-indigo-600 font-mono flex items-center gap-1">
                                                                <Clock className="w-2.5 h-2.5 text-indigo-400" />
                                                                {getCountdown(u.subscription_end)}
                                                            </span>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center"><div className="flex flex-col items-center"><span className="text-[11px] font-bold text-slate-600">{formatLastSeen(u.last_seen)}</span></div></td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <select 
                                                        value={selectedDurations[u.id] || 'sub_1y'} 
                                                        onChange={(e) => setSelectedDurations(prev => ({...prev, [u.id]: e.target.value}))} 
                                                        className="text-[10px] font-black uppercase py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                                    >
                                                        <optgroup label="Access Term">
                                                            {DURATION_OPTIONS.map(o => (
                                                                <option key={o.value} value={o.value}>{o.label}</option>
                                                            ))}
                                                        </optgroup>
                                                    </select>

                                                    <button 
                                                        onClick={() => extendUserExpiry(u, selectedDurations[u.id] || 'sub_1y')} 
                                                        className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white border border-indigo-200 uppercase transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
                                                        title="Extend expiry date by selected term"
                                                    >
                                                        <CalendarPlus className="w-3.5 h-3.5" />
                                                        <span>Extend Expiry</span>
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            setExtendModalUser(u);
                                                            setExtendTermKey('sub_1mo');
                                                            const defaultDate = u.subscription_end && new Date(u.subscription_end) > new Date()
                                                                ? new Date(new Date(u.subscription_end).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                                                                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                                                            setCustomDateValue(defaultDate);
                                                        }}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200"
                                                        title="Open Custom Date Picker & Presets"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </button>

                                                    <button 
                                                        onClick={() => toggleSubscription(u)} 
                                                        className={`text-[10px] font-black px-3.5 py-1.5 rounded-lg border uppercase transition-all shadow-xs ${
                                                            u.is_subscribed 
                                                                ? 'text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-600 hover:text-white' 
                                                                : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-600 hover:text-white'
                                                        }`}
                                                    >
                                                        {u.is_subscribed ? 'Terminate' : 'Authorize'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'keys' && (
                    <div className="p-10 flex flex-col h-full animate-fade-in">
                        <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 mb-10 shadow-inner">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-3">
                                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                                Cryptographic Key Provisioning
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Module Node</label>
                                    <select value={keyTool} onChange={e => setKeyTool(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all appearance-none">
                                        <option value="universal">UNIVERSAL_ACCESS (Master)</option>
                                        {Object.values(ToolId)
                                            .filter(tid => 
                                                tid === ToolId.XML_RENUMBER || 
                                                tid === ToolId.CREDIT_GENERATOR || 
                                                tid === ToolId.TABLE_BEAUTIFIER ||
                                                tid === ToolId.CITATION_LINKER
                                            )
                                            .map(tid => (
                                                <option key={tid} value={tid}>{getToolName(tid).toUpperCase()}</option>
                                            ))
                                        }
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Provision Quantity</label>
                                    <input type="number" min="1" max="50" value={keyQty} onChange={e => setKeyQty(parseInt(e.target.value) || 1)} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all" />
                                </div>
                                <div className="flex flex-col justify-end">
                                    <button onClick={generateKeys} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 uppercase text-[10px] tracking-widest">Initialize Key Sequence</button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[9px]">
                                    <tr>
                                        <th className="px-6 py-4 text-left">Secret Key</th>
                                        <th className="px-6 py-4 text-left">Assigned Module</th>
                                        <th className="px-6 py-4 text-left">Protocol Status</th>
                                        <th className="px-6 py-4 text-left">Bound Identity</th>
                                        <th className="px-6 py-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {accessKeys.map(k => {
                                        const boundUser = users.find(u => u.id === k.user_id);
                                        return (
                                            <tr key={k.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-mono text-xs font-black text-indigo-600">{k.key}</td>
                                                <td className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">{getToolName(k.tool)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter border ${k.is_used ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                                        {k.is_used ? 'Bound_Active' : 'Unused_Available'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {k.is_used ? (
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-slate-800">{boundUser?.email || 'Unknown User'}</span>
                                                            <span className="text-[8px] font-mono text-slate-400 uppercase">HWID: {k.device_id?.slice(0, 12)}...</span>
                                                        </div>
                                                    ) : <span className="text-slate-300 font-bold text-[10px] italic">No Binding</span>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-center gap-3">
                                                        {k.is_used && (
                                                            <button onClick={() => handleRevokeKey(k)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-100" title="Unbind Key">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleDeleteKey(k.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100" title="Purge Key">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'config' && (
                    <div className="p-10 space-y-12 animate-fade-in flex flex-col pb-32">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-emerald-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 border-4 border-emerald-100">
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">System Access Controller</h3>
                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Protocol Management</span>
                                            <button 
                                                disabled={true}
                                                className="w-6 h-3 rounded-full bg-slate-300 relative cursor-not-allowed"
                                                title="Protocol fixed: Manual override restricted"
                                            >
                                                <div className="absolute left-0.5 top-0.5 w-2 h-2 bg-white rounded-full shadow-sm" />
                                            </button>
                                        </div>
                                        <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                                        <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100">
                                            <span className="text-[10px] font-bold text-indigo-600 uppercase">Live Database Sync</span>
                                            <button 
                                                disabled={true}
                                                className="w-6 h-3 rounded-full bg-emerald-500 relative cursor-not-allowed opacity-80"
                                                title="Protocol restriction active: Sync is forced for administrators"
                                            >
                                                <div className="absolute right-0.5 top-0.5 w-2 h-2 bg-white rounded-full shadow-sm" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {actionError && (
                                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-shake">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm font-bold text-red-600 uppercase tracking-tight">{actionError}</span>
                                </div>
                            )}

                            {actionSuccess && (
                                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 animate-fade-in">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm font-bold text-emerald-600 uppercase tracking-tight">{actionSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Temporary Protocol Offset (Days)</label>
                                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                                    {PROMO_DURATIONS.map(d => (
                                        <button key={d.value} onClick={() => setPromoDuration(d.value)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${promoDuration === d.value ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{d.label}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16">
                            {Object.values(ToolId).filter(tid => tid !== 'dashboard' && tid !== 'docs').map(tid => {
                                const isFree = !!freeToolsData[tid];
                                const toolName = getToolName(tid);
                                return (
                                    <div key={tid} className={`p-6 border-2 rounded-[2rem] transition-all flex flex-col ${isFree ? 'border-emerald-500 bg-emerald-50 shadow-lg' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex flex-col">
                                                <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isFree ? 'text-emerald-600' : 'text-slate-400'}`}>{isFree ? 'System_Unlocked' : 'Strict_Lock'}</span>
                                                <h4 className="text-sm font-black text-slate-800 uppercase leading-none">{toolName}</h4>
                                            </div>
                                            <button onClick={() => toggleFreeTool(tid)} className={`w-12 h-6 rounded-full transition-all relative p-1 ${isFree ? 'bg-emerald-500 shadow-inner shadow-emerald-700/20' : 'bg-slate-200'}`}>
                                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isFree ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                            </button>
                                        </div>
                                        {isFree && (
                                            <div className="mt-auto pt-4 border-t border-emerald-100 flex items-center justify-between">
                                                <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Protocol Reset:</span>
                                                <span className="text-[10px] font-mono font-black text-emerald-800">{getCountdown(freeToolsData[tid])}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-10 bg-slate-900 rounded-[3rem] shadow-2xl relative overflow-hidden border border-white/5">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-rose-900/40">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-black text-white uppercase tracking-tight">Master Integrity Overrides</h4>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Global node authorization & restriction protocols</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <button onClick={masterUnlock} className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all text-left group">
                                        <span className="text-indigo-400 font-black text-[11px] uppercase tracking-[0.3em] mb-3 group-hover:text-indigo-300 transition-colors">Emergency Deployment</span>
                                        <h5 className="text-lg font-black text-white uppercase mb-4 leading-none">Global Master Unlock</h5>
                                        <p className="text-xs text-slate-500 leading-relaxed font-medium group-hover:text-slate-400">Temporarily authorizes all nodes for 24 hours. Used for system testing or mass-release periods.</p>
                                    </button>
                                    <button onClick={masterRevoke} className="flex flex-col items-start p-8 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-rose-600/20 hover:border-rose-500/50 transition-all text-left group">
                                        <span className="text-rose-400 font-black text-[11px] uppercase tracking-[0.3em] mb-3 group-hover:text-rose-300 transition-colors">Restrictive Protocol</span>
                                        <h5 className="text-lg font-black text-white uppercase mb-4 leading-none">Global Master Revoke</h5>
                                        <p className="text-xs text-slate-500 leading-relaxed font-medium group-hover:text-slate-400">Instantly terminates all active node promotions. Persistent keys will still function. Proceed?</p>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'intelligence' && (
                    <div className="p-4 lg:p-6 space-y-4 animate-fade-in flex flex-col pb-24 max-w-[1600px] mx-auto relative">
                        {/* Technical Grid Background Overlay */}
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-[0.15] pointer-events-none -z-10"></div>
                        
                        {/* Header Section - More Compact */}
                        <div className="flex flex-col lg:flex-row items-stretch gap-4">
                            <div className="flex-grow flex items-center justify-between gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(99,102,241,0.03)_25%,transparent_25%,transparent_50%,rgba(99,102,241,0.03)_50%,rgba(99,102,241,0.03)_75%,transparent_75%,transparent)] bg-[length:4px_4px] pointer-events-none opacity-20"></div>
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Intelligence Node</h2>
                                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[11px] font-black rounded border border-emerald-500/20 uppercase tracking-widest animate-pulse">Active</span>
                                        </div>
                                        <p className="text-xs font-mono text-slate-500 uppercase tracking-[0.2em] mt-1">ID: INTEL_CORE_01 // {intelligenceMetrics.filteredTotal} LOGS</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-2 relative z-10">
                                    <button onClick={() => refreshActiveTab(false)} className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-indigo-400 transition-all hover:bg-white/10" title="Refresh Live Data">
                                        <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    </button>
                                    <button onClick={exportRawTelemetry} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        Export
                                    </button>
                                </div>
                            </div>

                            <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-300 shadow-inner shrink-0">
                                {(['24h', '7d', '30d'] as const).map(range => (
                                    <button 
                                        key={range}
                                        onClick={() => setIntelRange(range)}
                                        className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-[0.15em] transition-all ${intelRange === range ? 'bg-indigo-600 text-white shadow-lg scale-[1.02]' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                                    >
                                        {range === '24h' ? 'Daily' : range === '7d' ? 'Weekly' : 'Monthly'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Metrics Grid - Higher Density */}
                        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col relative overflow-hidden group hover:border-indigo-200 transition-colors">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Premium Pulse</div>
                                    <span title="Total module actions performed by authorized (subscribed) personnel" className="cursor-help">
                                        <Info size={12} className="text-slate-300" />
                                    </span>
                                </div>
                                <div className="text-3xl font-black text-slate-900 font-mono leading-none">{intelligenceMetrics.segments.premium}</div>
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-2">Subscribed Interactions</p>
                                <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{ width: `${(intelligenceMetrics.segments.premium / (intelligenceMetrics.filteredTotal || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col relative overflow-hidden group hover:border-emerald-200 transition-colors">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Standard Pulse</div>
                                    <span title="Total module actions performed by standard (non-subscribed) personnel" className="cursor-help">
                                        <Info size={12} className="text-slate-300" />
                                    </span>
                                </div>
                                <div className="text-3xl font-black text-slate-900 font-mono leading-none">{intelligenceMetrics.segments.standard}</div>
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-2">Standard Interactions</p>
                                <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${(intelligenceMetrics.segments.standard / (intelligenceMetrics.filteredTotal || 1)) * 100}%` }}></div>
                                </div>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col relative overflow-hidden group hover:border-purple-200 transition-colors">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Velocity Growth</div>
                                    <span title="Percentage change in total usage volume compared to the previous equivalent time window" className="cursor-help">
                                        <Info size={12} className="text-slate-300" />
                                    </span>
                                </div>
                                <div className={`text-3xl font-black font-mono leading-none ${intelligenceMetrics.growth >= 0 ? 'text-purple-600' : 'text-rose-600'}`}>
                                    {intelligenceMetrics.growth >= 0 ? '+' : ''}{intelligenceMetrics.growth}%
                                </div>
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-2">Usage Delta (vs Prev)</p>
                                <div className="mt-4 flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${intelligenceMetrics.growth >= 0 ? 'bg-purple-500' : 'bg-rose-500'}`}></div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trend Analysis</span>
                                </div>
                            </div>
                            <div className="p-5 bg-slate-950 rounded-2xl shadow-xl flex flex-col relative overflow-hidden border border-slate-800">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent"></div>
                                <div className="flex items-center gap-1.5 mb-2 relative z-10">
                                    <div className="text-xs font-black text-indigo-400/60 uppercase tracking-[0.3em]">Persistence</div>
                                    <span title="Percentage of total registered personnel who have been active within this time range" className="cursor-help">
                                        <Info size={12} className="text-indigo-400/30" />
                                    </span>
                                </div>
                                <div className="text-3xl font-black text-white font-mono relative z-10 leading-none">
                                    {users.length > 0 ? Math.round((intelligenceMetrics.userAffinities.length / users.length) * 100) : 0}%
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-2 relative z-10">Active Personnel Ratio</p>
                                <div className="mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest relative z-10 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                                    Operator Retention
                                </div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
                            <section className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 border border-amber-100">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Temporal Heatmap</h3>
                                            <span title="Visualizes module usage intensity across a 24-hour cycle. Darker colors indicate higher frequency of actions during that hour." className="cursor-help">
                                                <Info size={12} className="text-slate-300" />
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">24H Protocol Cycle</span>
                                        <span className="text-[9px] text-slate-400 uppercase tracking-tighter">Intensity Distribution</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 flex-grow">
                                    {intelligenceMetrics.hourlyIntensity.map((val, hour) => {
                                        const maxIntensity = Math.max(...intelligenceMetrics.hourlyIntensity, 1);
                                        const opacity = (val / maxIntensity) * 0.9 + 0.1;
                                        return (
                                            <div key={hour} className="group relative flex flex-col">
                                                <div 
                                                    className="flex-grow rounded-sm transition-all duration-500 hover:ring-2 hover:ring-indigo-300"
                                                    style={{ backgroundColor: `rgba(99, 102, 241, ${opacity})`, boxShadow: val > (maxIntensity * 0.8) ? '0 0 8px rgba(99, 102, 241, 0.2)' : 'none' }}
                                                ></div>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950 text-white text-[9px] font-black p-1.5 rounded shadow-xl whitespace-nowrap z-20 border border-white/10">
                                                    {hour}:00 // {val} HITS
                                                </div>
                                                <span className="text-[8px] font-bold text-slate-400 mt-0.5 text-center uppercase">{hour}h</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="bg-slate-950 p-5 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-800">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 rounded-bl-full"></div>
                                <div className="flex items-center gap-2 mb-4 relative z-10">
                                    <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center text-indigo-400 border border-white/5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-sm font-black text-white uppercase tracking-tight">Live Feed</h3>
                                        <span title="Real-time stream of the most recent module access events across the entire platform." className="cursor-help">
                                            <Info size={12} className="text-slate-500" />
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-black text-indigo-400/40 uppercase tracking-widest ml-auto">Real-time Stream</span>
                                </div>
                                <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1 relative z-10">
                                    {intelligenceMetrics.recentActivity.length > 0 ? intelligenceMetrics.recentActivity.map((act, actIdx) => (
                                        <div key={`act-${act.id || ''}-${actIdx}`} onClick={() => setFocusedUserId(act.userId)} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors cursor-pointer group/item">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex-shrink-0 flex items-center justify-center text-[10px] font-black text-indigo-400 border border-indigo-500/20 overflow-hidden">
                                                {act.avatar_url ? (
                                                    <img src={act.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    act.user[0].toUpperCase()
                                                )}
                                            </div>
                                            <div className="flex-grow min-w-0">
                                                <p className="text-[11px] font-black text-indigo-300 uppercase tracking-tighter truncate">{act.toolName}</p>
                                                <p className="text-[10px] text-slate-500 font-mono truncate group-hover/item:text-slate-300 transition-colors">{act.user}</p>
                                            </div>
                                            <span className="text-[9px] font-black text-slate-600 uppercase whitespace-nowrap">{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    )) : (
                                        <div className="py-8 text-center opacity-20"><p className="text-[11px] font-black uppercase text-white">Signal Silent</p></div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                            <section className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-7 h-7 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600 border border-purple-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Module Saturation Leaderboard</h3>
                                        <span title="Ranking of modules by total utilization. The progress bar shows the ratio of Premium (Indigo) vs Standard (Emerald) usage for each module." className="cursor-help">
                                            <Info size={10} className="text-slate-300" />
                                        </span>
                                    </div>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-auto">Utilization Ranking</span>
                                </div>
                                <div className="space-y-4 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                                    {intelligenceMetrics.globalRanking.length > 0 ? intelligenceMetrics.globalRanking.map((tool, tIdx) => {
                                        const premCount = intelligenceMetrics.segments.segmentCounts.premium[tool.id] || 0;
                                        const stdCount = intelligenceMetrics.segments.segmentCounts.standard[tool.id] || 0;
                                        const premPercent = tool.count > 0 ? (premCount / tool.count) * 100 : 0;
                                        return (
                                            <div key={`rank-${tool.id}-${tIdx}`} className="relative group p-2 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                                <div className="flex justify-between items-end mb-1">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-widest">{tool.name}</span>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[8px] font-black text-indigo-500 uppercase">PREM: {premCount}</span>
                                                            <span className="text-[8px] font-black text-emerald-500 uppercase">STD: {stdCount}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-mono font-black text-indigo-600">{tool.count}</span>
                                                </div>
                                                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                                    <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${premPercent}%` }}></div>
                                                    <div className="h-full bg-emerald-400 transition-all duration-1000" style={{ width: `${100 - premPercent}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="py-8 text-center opacity-30 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                                            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400">No Saturation Data</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-7 h-7 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600 border border-rose-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Cold Node Analysis</h3>
                                        <span title="Identifies modules with critically low engagement levels during the selected time period. These nodes may require optimization or promotional focus." className="cursor-help">
                                            <Info size={10} className="text-slate-300" />
                                        </span>
                                    </div>
                                    <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest ml-auto">Low Engagement</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {intelligenceMetrics.rareTools.length > 0 ? (
                                        intelligenceMetrics.rareTools.slice(0, 4).map((tool, rtIdx) => (
                                            <div key={`rare-${tool.id}-${rtIdx}`} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center text-center hover:border-rose-200 transition-colors">
                                                <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Low Velocity</span>
                                                <h4 className="text-[11px] font-bold text-slate-800 uppercase mb-2 truncate w-full">{tool.name}</h4>
                                                <span className="text-[10px] font-mono font-black text-slate-400">{tool.count} HITS</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="col-span-full py-8 flex flex-col items-center justify-center bg-emerald-50/30 rounded-xl border-2 border-dashed border-emerald-100 opacity-60">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Saturation Optimal</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            <section className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600 border border-rose-100">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Security Anomalies</h3>
                                            <span title="Logs module access attempts that do not meet authorization criteria (e.g., non-premium users accessing premium-only modules without a valid key)." className="cursor-help">
                                                <Info size={12} className="text-slate-300" />
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest ml-auto">Access Violations</span>
                                    </div>
                                    {intelligenceMetrics.anomalies && intelligenceMetrics.anomalies.length > 0 && (
                                        <span className="px-2.5 py-1 bg-rose-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest animate-pulse">
                                            {intelligenceMetrics.anomalies.length} BREACHES
                                        </span>
                                    )}
                                </div>
                                <div className="overflow-hidden">
                                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {intelligenceMetrics.anomalies && intelligenceMetrics.anomalies.length > 0 ? (
                                            <table className="min-w-full divide-y divide-slate-100">
                                                <thead className="bg-slate-50 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Operator</th>
                                                        <th className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Module</th>
                                                        <th className="px-4 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {intelligenceMetrics.anomalies.map((anomaly, idx) => (
                                                        <tr key={`anomaly-${anomaly.id || idx}`} className="hover:bg-rose-50/30 transition-colors group">
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex-shrink-0 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-200 overflow-hidden">
                                                                        {anomaly.avatar_url ? (
                                                                            <img src={anomaly.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                        ) : (
                                                                            anomaly.user[0].toUpperCase()
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-xs font-bold text-slate-900 group-hover:text-rose-700 truncate max-w-[120px]">{anomaly.user}</span>
                                                                        <span className="text-[9px] font-mono text-slate-400 uppercase">{anomaly.userId.slice(0, 8)}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black rounded uppercase border border-slate-200">
                                                                    {anomaly.toolName}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className="text-[11px] font-mono font-bold text-slate-400">
                                                                    {new Date(anomaly.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="py-12 flex flex-col items-center justify-center text-center">
                                                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-3 border border-emerald-100">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                                </div>
                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Perimeter Secure</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            <section className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex flex-col">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 border border-indigo-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Personnel Engagement Audit</h3>
                                        <span title="Detailed breakdown of individual operator activity. Shows their primary protocol (most used module) and total platform interactions." className="cursor-help">
                                            <Info size={12} className="text-slate-300" />
                                        </span>
                                    </div>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-auto">Operator Activity Logs</span>
                                </div>
                                <div className="overflow-hidden flex-grow">
                                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                        <table className="min-w-full divide-y divide-slate-100">
                                                <thead className="bg-slate-50 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">Operator</th>
                                                        <th className="px-4 py-3 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Primary Protocol</th>
                                                        <th className="px-4 py-3 text-center text-[11px] font-black text-slate-400 uppercase tracking-widest">Index</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {intelligenceMetrics.userAffinities.length > 0 ? intelligenceMetrics.userAffinities.map((ua, uaIdx) => (
                                                        <tr key={`ua-${ua.id}-${uaIdx}`} onClick={() => setFocusedUserId(ua.id)} className={`cursor-pointer transition-all ${focusedUserId === ua.id ? 'bg-indigo-600' : 'hover:bg-slate-50'}`}>
                                                            <td className={`px-4 py-3 text-xs font-bold ${focusedUserId === ua.id ? 'text-white' : 'text-slate-900'}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-black border ${focusedUserId === ua.id ? 'bg-white/20 border-white/30 text-white' : 'bg-indigo-50 border-indigo-100 text-indigo-600'} overflow-hidden`}>
                                                                        {ua.avatar_url ? (
                                                                            <img src={ua.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                        ) : (
                                                                            ua.email[0].toUpperCase()
                                                                        )}
                                                                    </div>
                                                                    <span className="truncate max-w-[100px]">{ua.email.split('@')[0]}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap"><span className={`px-2 py-0.5 text-[10px] font-black rounded uppercase border whitespace-nowrap ${focusedUserId === ua.id ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-indigo-100 text-indigo-600'}`}>{ua.topTool}</span></td>
                                                            <td className={`px-4 py-3 text-center text-[11px] font-mono font-bold ${focusedUserId === ua.id ? 'text-indigo-200' : 'text-slate-500'}`}>{ua.totalActions}</td>
                                                        </tr>
                                                    )) : (
                                                        <tr><td colSpan={3} className="px-4 py-8 text-center opacity-30 text-xs font-black uppercase tracking-widest text-slate-400">No Active Sessions</td></tr>
                                                    )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="pb-20">
                            {focusedUserData ? (
                                <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-slate-900/40 animate-slide-up ring-4 ring-slate-800 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6">
                                        <button onClick={() => setFocusedUserId(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-slate-500 hover:text-white border border-white/10">
                                            <X size={20} />
                                        </button>
                                    </div>
                                    <div className="flex flex-col md:flex-row gap-12 items-start relative z-10">
                                        <div className="flex-shrink-0">
                                            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-4xl font-black text-white shadow-lg border border-white/20 overflow-hidden">
                                                {focusedUserData.user?.avatar_url ? (
                                                    <img src={focusedUserData.user.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    focusedUserData.user?.email[0].toUpperCase()
                                                )}
                                            </div>
                                            <div className="mt-6 flex flex-col items-center">
                                                <span className={`px-4 py-1.5 text-[10px] font-black rounded-full uppercase tracking-widest border ${focusedUserData.user?.is_subscribed ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                                                    {focusedUserData.user?.is_subscribed ? 'Authorized' : 'Dormant'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-grow">
                                            <div className="flex flex-col md:flex-row md:items-end gap-6 mb-10">
                                                <div>
                                                    <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-2">{focusedUserData.user?.email}</h3>
                                                    <p className="text-xs font-mono text-indigo-400 uppercase tracking-[0.2em]">Operator ID: {focusedUserData.user?.id}</p>
                                                </div>
                                                <div className="md:ml-auto flex items-center gap-10">
                                                    <div className="text-center">
                                                        <div className="text-2xl font-black text-white font-mono">{focusedUserData.logs.length}</div>
                                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Actions</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-2xl font-black text-white font-mono">{Object.keys(focusedUserData.toolStats).length}</div>
                                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tools Used</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-2xl font-black text-white font-mono">{formatLastSeen(focusedUserData.user?.last_seen)}</div>
                                                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Active</div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 border-b border-white/5 pb-2">Module Utilization DNA</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                                {Object.entries(focusedUserData.toolStats).sort(([,a], [,b]) => b - a).map(([tid, count]) => (
                                                    <div key={tid} className="group">
                                                        <div className="flex justify-between text-[11px] font-bold mb-2">
                                                            <span className="text-slate-400 group-hover:text-white transition-colors uppercase tracking-wider">{getToolName(tid)}</span>
                                                            <span className="text-indigo-400 font-mono">{count}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000" style={{ width: `${(count / focusedUserData.logs.length) * 100}%` }}></div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center p-20 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 opacity-60">
                                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-300 mb-6 shadow-sm border border-slate-100">
                                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    </div>
                                    <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Telemetry Disengaged</p>
                                    <p className="text-[11px] text-slate-400 mt-3 font-medium px-8 leading-relaxed italic text-center">Select an operator from the Audit table or Live Feed to inspect their module usage DNA.</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="pt-20 pb-32 border-t border-slate-100">
                            <div className="bg-rose-50/30 rounded-[2.5rem] border-2 border-dashed border-rose-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 shadow-sm">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="text-base font-black text-rose-900 uppercase tracking-tight">Intelligence Danger Zone</h4>
                                        <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mt-1">Purge all production telemetry from the database</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={purgeTelemetry}
                                    className="px-10 py-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-rose-200 transition-all active:scale-95"
                                >
                                    Reset Intelligence Database
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'announcements' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 h-full min-h-[700px] bg-slate-50/50">
                        {/* Signal Transmitter Panel */}
                        <div className={`${isWideTransmitter ? 'lg:col-span-12 border-b border-slate-200' : 'lg:col-span-7'} p-8 lg:p-10 bg-white border-r border-slate-200 flex flex-col shadow-inner transition-all duration-300`}>
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                                            <Signal className="animate-pulse" size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                                Signal Transmitter
                                            </h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em]">Deploy Global Protocol</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => setIsWideTransmitter(!isWideTransmitter)}
                                        className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                            isWideTransmitter 
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                                                : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 border-slate-200'
                                        }`}
                                        title={isWideTransmitter ? "Switch to Split Columns View" : "Expand Signal Transmitter to Wide Layout"}
                                    >
                                        {isWideTransmitter ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                        {isWideTransmitter ? "Split View" : "Expand Width"}
                                    </button>

                                    {editingId ? (
                                        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5">
                                            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                                            <span className="text-[10px] font-mono font-black text-indigo-700 uppercase">Edit: ID_{editingId.slice(0, 6)}</span>
                                            <button 
                                                onClick={() => { setEditingId(null); setNewTitle(''); setNewContent(''); setNewType('info'); setNewCategory('system_alerts'); setNewMandatory(false); }} 
                                                className="w-6 h-6 rounded-lg bg-indigo-200 hover:bg-rose-500 hover:text-white text-indigo-800 flex items-center justify-center transition-all ml-1"
                                                title="Cancel Editing"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Transmitter Ready
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Quick Preset Templates Bar */}
                            <div className="mb-6 bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                                <div className="flex items-center justify-between mb-2.5 px-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Sparkles size={12} className="text-indigo-500" />
                                        Broadcast Quick Presets
                                    </span>
                                    {newTitle || newContent ? (
                                        <button 
                                            type="button" 
                                            onClick={() => { setNewTitle(''); setNewContent(''); setNewType('info'); setNewCategory('system_alerts'); setNewMandatory(false); setEditingId(null); }} 
                                            className="text-[9px] font-bold text-rose-500 hover:underline uppercase"
                                        >
                                            Reset Form
                                        </button>
                                    ) : null}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewTitle("SYSTEM_MAINTENANCE_NOTICE");
                                            setNewType("warning");
                                            setNewCategory("maintenance_windows");
                                            setNewContent("### 🛠️ Scheduled System Maintenance\n\nPlease be advised that database indexing will take place during the off-peak window.\n\n* **Expected Duration:** 15 Minutes\n* **Impact:** Minimal read latency\n\n> 💡 All active sessions remain secure.");
                                        }}
                                        className="text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all flex items-center gap-2 group"
                                    >
                                        <span className="text-sm">🛠️</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight group-hover:text-amber-900">Maintenance</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Downtime Alert</span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewTitle("NEW_FEATURE_DEPLOYED");
                                            setNewType("success");
                                            setNewCategory("system_alerts");
                                            setNewContent("### 🚀 Platform Upgrade Released\n\nWe have deployed major performance improvements to our XML processing pipeline!\n\n1. **Faster Parsing:** Up to 3x speed boost\n2. **Rich Text Telemetry:** Enhanced Markdown & table rendering\n3. **Live Syncing:** Instant broadcast delivery across connected sessions");
                                        }}
                                        className="text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all flex items-center gap-2 group"
                                    >
                                        <span className="text-sm">🚀</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight group-hover:text-emerald-900">Feature Release</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Protocol Update</span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewTitle("SECURITY_ADVISORY_KEY_ROTATION");
                                            setNewType("error");
                                            setNewCategory("security_updates");
                                            setNewMandatory(true);
                                            setNewContent("### 🚨 Mandatory Security Protocol Update\n\nAll operator accounts must verify credentials and rotate legacy API keys.\n\n* **Priority:** CRITICAL\n* **Mandatory Action:** Confirm receipt of this transmission to proceed.\n\n> ⚠️ Deprecated keys will be revoked at cycle end.");
                                        }}
                                        className="text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 transition-all flex items-center gap-2 group"
                                    >
                                        <span className="text-sm">🚨</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight group-hover:text-rose-900">Security Command</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Mandatory Read</span>
                                        </div>
                                    </button>
                                     <button
                                        type="button"
                                        onClick={() => {
                                            setNewTitle("SUBSCRIPTION_EXTENSION_NOTICE");
                                            setNewType("success");
                                            setNewCategory("system_alerts");
                                            setNewContent("### 🎉 Subscription Access Extended!\n\nYour subscription access has been successfully extended!\n\n* **Status:** AUTHORIZED / ACTIVE\n* **Feature Access:** Full Access to All Production & Experimental Tools\n\nThank you for choosing Production Toolkit Pro!");
                                        }}
                                        className="text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all flex items-center gap-2 group"
                                    >
                                        <span className="text-sm">🎉</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight group-hover:text-indigo-900">Subscription Extended</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Access Pulse</span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewTitle("SYSTEM_PULSE_HEALTH_OK");
                                            setNewType("info");
                                            setNewCategory("system_alerts");
                                            setNewContent("### ℹ️ Operations Telemetry Normal\n\nAll infrastructure nodes are operating at optimal latency and throughput parameters. No action required.");
                                        }}
                                        className="text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all flex items-center gap-2 group"
                                    >
                                        <span className="text-sm">📢</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight group-hover:text-indigo-900">General Notice</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">Info Pulse</span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                            
                            <form onSubmit={saveAnnouncement} className="space-y-6 flex-grow flex flex-col group/transmitter">
                                <div className="grid grid-cols-1 gap-5">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between px-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-1.5">
                                                <Terminal size={12} className="text-indigo-600" />
                                                Subject Frequency (Title)
                                            </label>
                                            <span className="text-[9px] font-mono font-bold text-slate-400">{newTitle.length}/100</span>
                                        </div>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                required 
                                                maxLength={100}
                                                placeholder="e.g. SYSTEM_MAINTENANCE_SCHEDULE"
                                                value={newTitle} 
                                                onChange={e => setNewTitle(e.target.value)} 
                                                className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder-slate-300 font-mono pr-10" 
                                            />
                                            {newTitle && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => setNewTitle('')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Severity Level</label>
                                            <select 
                                                value={newType} 
                                                onChange={e => setNewType(e.target.value as any)} 
                                                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3.5 text-xs font-black uppercase text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all appearance-none tracking-wider cursor-pointer"
                                            >
                                                <option value="info">🔵 INFO_PULSE</option>
                                                <option value="warning">🟠 ALERT_THRESHOLD</option>
                                                <option value="success">🟢 STABLE_RES</option>
                                                <option value="error">🔴 CRITICAL_EX</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Category</label>
                                            <select 
                                                value={newCategory} 
                                                onChange={e => setNewCategory(e.target.value as any)} 
                                                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3.5 text-xs font-black uppercase text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all appearance-none tracking-wider cursor-pointer"
                                            >
                                                <option value="system_alerts">SYSTEM_OPS</option>
                                                <option value="security_updates">SECURITY_CMD</option>
                                                <option value="maintenance_windows">DOWNTIME_LOG</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Mandatory Protocol Card Switch */}
                                    <div className={`flex items-center justify-between border-2 rounded-2xl px-5 py-3.5 transition-all ${
                                        newMandatory ? 'bg-indigo-50/70 border-indigo-300 shadow-sm' : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-black text-slate-900 uppercase tracking-wider">Mandatory Reading Protocol</span>
                                                {newMandatory && (
                                                    <span className="px-2 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase rounded-md tracking-wider">FORCED</span>
                                                )}
                                            </div>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Forces acknowledgment from operators before modal dismiss</span>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => setNewMandatory(!newMandatory)}
                                            className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative ${newMandatory ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                        >
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300 ${newMandatory ? 'translate-x-6' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="space-y-2 flex-grow flex flex-col min-h-[280px]">
                                    <div className="flex justify-between items-center px-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Rich Broadcast Payload</label>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${newContent.length > 500 ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
                                            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">{newContent.length} Bytes</span>
                                        </div>
                                    </div>
                                    
                                    <RichTextEditor 
                                        value={newContent} 
                                        onChange={setNewContent} 
                                        placeholder="Type markdown, insert lists, tables, callouts, links, or pick a preset template..."
                                        minHeight="300px"
                                    />
                                </div>
                                
                                <div className="flex gap-3 pt-2">
                                    <button 
                                        type="submit" 
                                        disabled={isLoading}
                                        className={`flex-1 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.25em] shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 group ${
                                            editingId 
                                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20' 
                                                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20'
                                        }`}
                                    >
                                        <Send size={15} className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                                        {editingId ? 'Hot-Swap Signal' : 'Deploy Protocol'}
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={() => testAnnouncement({
                                            id: editingId || 'TEST_DRAFT',
                                            title: newTitle || 'PREVIEW_BROADCAST_TITLE',
                                            content: newContent || 'This is a sample test preview of the broadcast modal.',
                                            type: newType,
                                            category: newCategory,
                                            is_active: true,
                                            is_mandatory: newMandatory,
                                            created_at: new Date().toISOString()
                                        })}
                                        className="px-5 py-4 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2"
                                        title="Preview how users will see this modal popup"
                                    >
                                        <Eye size={15} />
                                        Test Modal
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Active Frequency Logs Panel */}
                        <div className={`${isWideTransmitter ? 'lg:col-span-12' : 'lg:col-span-5'} p-8 lg:p-10 overflow-y-auto custom-scrollbar bg-slate-50/40 flex flex-col transition-all duration-300`}>
                            {/* Summary Metrics Bar */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between text-slate-400 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider">Total Logs</span>
                                        <Signal size={14} className="text-slate-400" />
                                    </div>
                                    <span className="text-2xl font-black text-slate-900">{announcementStats.total}</span>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between text-emerald-600 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Live Signals</span>
                                        <Radio size={14} className="text-emerald-500 animate-pulse" />
                                    </div>
                                    <span className="text-2xl font-black text-emerald-600">{announcementStats.active}</span>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between text-indigo-600 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mandatory</span>
                                        <ShieldCheck size={14} className="text-indigo-500" />
                                    </div>
                                    <span className="text-2xl font-black text-indigo-600">{announcementStats.mandatory}</span>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between text-amber-600 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Critical / Alert</span>
                                        <AlertTriangle size={14} className="text-amber-500" />
                                    </div>
                                    <span className="text-2xl font-black text-amber-600">{announcementStats.critical}</span>
                                </div>
                            </div>

                            {/* Panel Controls: Title + Search & Filters */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                                        <Radio size={18} />
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em]">Active Frequency Logs</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Live Telemetry & Protocol Broadcast Archive</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl text-emerald-700">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-mono font-black uppercase">Node_01: Online</span>
                                        <button 
                                            type="button" 
                                            onClick={() => fetchAnnouncements(false)}
                                            className="text-emerald-700 hover:text-emerald-900 ml-1 p-0.5 hover:rotate-180 transition-all duration-300"
                                            title="Refresh logs telemetry"
                                        >
                                            <RefreshCw size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Search and Category Filters */}
                            <div className="flex flex-col md:flex-row gap-4 mb-8">
                                <div className="relative flex-grow">
                                    <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Search logs by title, content, or ID..."
                                        value={announcementSearch}
                                        onChange={e => setAnnouncementSearch(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-10 py-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-sm"
                                    />
                                    {announcementSearch && (
                                        <button 
                                            onClick={() => setAnnouncementSearch('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto custom-scrollbar">
                                    <button 
                                        onClick={() => setAnnouncementFilter('all')} 
                                        className={`px-3.5 py-2 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${
                                            announcementFilter === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                    >
                                        All ({announcementStats.total})
                                    </button>
                                    <button 
                                        onClick={() => setAnnouncementFilter('active')} 
                                        className={`px-3.5 py-2 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                            announcementFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-600'
                                        }`}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        Live ({announcementStats.active})
                                    </button>
                                    <button 
                                        onClick={() => setAnnouncementFilter('inactive')} 
                                        className={`px-3.5 py-2 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${
                                            announcementFilter === 'inactive' ? 'bg-slate-200 text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                    >
                                        Standby
                                    </button>
                                    <button 
                                        onClick={() => setAnnouncementFilter('mandatory')} 
                                        className={`px-3.5 py-2 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${
                                            announcementFilter === 'mandatory' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'
                                        }`}
                                    >
                                        Mandatory ({announcementStats.mandatory})
                                    </button>
                                    <button 
                                        onClick={() => setAnnouncementFilter('error')} 
                                        className={`px-3.5 py-2 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${
                                            announcementFilter === 'error' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-rose-600'
                                        }`}
                                    >
                                        Critical
                                    </button>
                                </div>
                            </div>

                            {/* Signal Cards Grid */}
                            <div className={`grid gap-6 flex-grow ${isWideTransmitter ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 xl:grid-cols-2'}`}>
                                {filteredAnnouncements.map(a => {
                                    const typeConfig = {
                                        info: { color: 'border-indigo-200 text-indigo-700 bg-indigo-50/70', icon: <Info size={12} /> },
                                        warning: { color: 'border-amber-200 text-amber-700 bg-amber-50/70', icon: <AlertTriangle size={12} /> },
                                        success: { color: 'border-emerald-200 text-emerald-700 bg-emerald-50/70', icon: <CheckCircle2 size={12} /> },
                                        error: { color: 'border-rose-200 text-rose-700 bg-rose-50/70', icon: <AlertCircle size={12} /> }
                                    };

                                    const isExpanded = expandedAnnouncementIds.includes(a.id);
                                    
                                    return (
                                        <motion.div 
                                            layout
                                            key={a.id} 
                                            className={`group relative flex flex-col p-6 bg-white border-2 rounded-[2.5rem] transition-all duration-300 ${
                                                a.is_active 
                                                    ? 'border-indigo-500 ring-4 ring-indigo-500/10 shadow-xl' 
                                                    : 'border-slate-200 hover:border-slate-300 shadow-sm opacity-90 hover:opacity-100'
                                            }`}
                                        >
                                            {/* Card Top Badges & Actions Row */}
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
                                                <div className="flex flex-col gap-2 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {a.is_active ? (
                                                            <div className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-50 border border-emerald-300 text-emerald-700 flex items-center gap-1.5 shadow-xs">
                                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                                                LIVE SIGNAL
                                                            </div>
                                                        ) : (
                                                            <div className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 border border-slate-200 text-slate-500">
                                                                STANDBY
                                                            </div>
                                                        )}

                                                        <div className={`px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${typeConfig[a.type].color}`}>
                                                            {typeConfig[a.type].icon}
                                                            {a.type}_PKT
                                                        </div>

                                                        {a.is_mandatory && (
                                                            <div className="px-2 py-1 rounded-xl text-[8px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs animate-pulse">
                                                                MANDATORY
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold text-slate-500 bg-slate-100 border border-slate-200">
                                                            {a.category?.replace('_', ' ') || 'SYSTEM_OPS'}
                                                        </span>
                                                        <span className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-tight">
                                                            ID_{a.id.slice(0, 8)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Vertical Ellipsis Action Menu Dropdown */}
                                                <div className="relative shrink-0 self-start sm:self-auto">
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenMenuId(openMenuId === a.id ? null : a.id);
                                                        }} 
                                                        className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
                                                            openMenuId === a.id 
                                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                                                                : 'bg-slate-50 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border-slate-200'
                                                        }`}
                                                        title="Broadcast Options"
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>

                                                    <AnimatePresence>
                                                        {openMenuId === a.id && (
                                                            <>
                                                                {/* Backdrop overlay */}
                                                                <div 
                                                                    className="fixed inset-0 z-20" 
                                                                    onClick={() => setOpenMenuId(null)} 
                                                                />
                                                                
                                                                {/* Dropdown Menu */}
                                                                <motion.div 
                                                                    initial={{ opacity: 0, scale: 0.95, y: -6 }}
                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                    exit={{ opacity: 0, scale: 0.95, y: -6 }}
                                                                    transition={{ duration: 0.12 }}
                                                                    className="absolute right-0 top-10 z-30 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 flex flex-col gap-0.5"
                                                                >
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => { setOpenMenuId(null); testAnnouncement(a); }}
                                                                        className="w-full px-3 py-2 rounded-xl text-left text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2.5 transition-all text-xs font-bold"
                                                                    >
                                                                        <Eye size={14} className="text-indigo-500 shrink-0" />
                                                                        <span>Preview Modal</span>
                                                                    </button>

                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => { setOpenMenuId(null); editAnnouncement(a); }}
                                                                        className="w-full px-3 py-2 rounded-xl text-left text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2.5 transition-all text-xs font-bold"
                                                                    >
                                                                        <Edit3 size={14} className="text-indigo-500 shrink-0" />
                                                                        <span>Edit Broadcast</span>
                                                                    </button>

                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => { setOpenMenuId(null); cloneAnnouncement(a); }}
                                                                        className="w-full px-3 py-2 rounded-xl text-left text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2.5 transition-all text-xs font-bold"
                                                                    >
                                                                        <Copy size={14} className="text-indigo-500 shrink-0" />
                                                                        <span>Clone to Draft</span>
                                                                    </button>

                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => { setOpenMenuId(null); activateAnnouncement(a.id); }}
                                                                        className="w-full px-3 py-2 rounded-xl text-left text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2.5 transition-all text-xs font-bold"
                                                                    >
                                                                        <Radio size={14} className={a.is_active ? 'text-amber-500 shrink-0' : 'text-emerald-500 shrink-0'} />
                                                                        <span>{a.is_active ? 'Set Standby' : 'Set Live Signal'}</span>
                                                                    </button>

                                                                    <div className="h-px bg-slate-100 my-1" />

                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => { setOpenMenuId(null); deleteAnnouncement(a.id); }}
                                                                        className="w-full px-3 py-2 rounded-xl text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-all text-xs font-bold"
                                                                    >
                                                                        <Trash2 size={14} className="text-rose-500 shrink-0" />
                                                                        <span>Delete Log</span>
                                                                    </button>
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>

                                            {/* Log Card Title */}
                                            <h4 className="text-lg font-black text-slate-900 mb-3 uppercase tracking-tight leading-snug whitespace-pre-wrap break-words">
                                                {a.title}
                                            </h4>
                                            
                                            {/* Rendered Payload Area with Expand/Collapse */}
                                            <div className="relative mb-6 flex-grow">
                                                <div className={`text-xs text-slate-600 font-medium leading-relaxed border-l-4 border-indigo-400/50 pl-4 bg-slate-50/80 p-3 rounded-r-2xl prose prose-slate prose-xs max-w-none transition-all ${
                                                    isExpanded ? 'max-h-[500px] overflow-y-auto custom-scrollbar' : 'max-h-24 overflow-hidden line-clamp-3'
                                                }`}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.content}</ReactMarkdown>
                                                </div>
                                                
                                                <button 
                                                    onClick={() => toggleExpandAnnouncement(a.id)}
                                                    className="mt-2 text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-800 flex items-center gap-1 tracking-wider"
                                                >
                                                    {isExpanded ? (
                                                        <>Collapse <ChevronUp size={12} /></>
                                                    ) : (
                                                        <>Show Full Payload <ChevronDown size={12} /></>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Card Footer: Timestamps + Activation Toggle */}
                                            <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-5">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Deployed</span>
                                                    <span className="text-[10px] font-mono font-bold text-slate-600 uppercase">
                                                        {new Date(a.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }).replace(',', '')} 
                                                        <span className="mx-1 opacity-40">|</span>
                                                        {new Date(a.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>

                                                <button 
                                                    onClick={() => activateAnnouncement(a.id)}
                                                    className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all border flex items-center gap-2 active:scale-95 shadow-md ${
                                                        a.is_active 
                                                            ? 'bg-rose-600 border-rose-600 text-white shadow-rose-500/20 hover:bg-rose-700' 
                                                            : 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-500/20 hover:bg-indigo-700'
                                                    }`}
                                                >
                                                    {a.is_active ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                                                    {a.is_active ? 'Shut Down' : 'Initialize'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                                
                                {filteredAnnouncements.length === 0 && (
                                    <div className="col-span-full py-28 text-center bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center p-8">
                                        <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 mb-4">
                                            <Signal size={32} />
                                        </div>
                                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-[0.3em]">No Broadcast Logs Found</h4>
                                        <p className="text-xs text-slate-400 mt-1 max-w-md">
                                            {announcementSearch 
                                                ? `No telemetry logs match search query "${announcementSearch}".` 
                                                : `No telemetry logs registered under filter "${announcementFilter}".`}
                                        </p>
                                        {announcementSearch ? (
                                            <button 
                                                onClick={() => setAnnouncementSearch('')}
                                                className="mt-4 px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-md hover:bg-slate-800 transition-all"
                                            >
                                                Clear Search Query
                                            </button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'feedback' && (
                    <div className="p-10 animate-fade-in flex flex-col h-full">
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
                            <div className="flex flex-col">
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">User Feedback Matrix</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-1">Direct Operator Communications</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                                    <button 
                                        onClick={() => setSearch('')} 
                                        className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${!search || (search !== 'bug' && search !== 'feature') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}
                                    >
                                        All
                                    </button>
                                    <button 
                                        onClick={() => setSearch('bug')} 
                                        className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${search === 'bug' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-500 hover:bg-white/50'}`}
                                    >
                                        Bugs
                                    </button>
                                    <button 
                                        onClick={() => setSearch('feature')} 
                                        className={`px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${search === 'feature' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:bg-white/50'}`}
                                    >
                                        Features
                                    </button>
                                </div>
                                <div className="bg-amber-50 border border-amber-100 px-5 py-3 rounded-xl flex items-center gap-4">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                                    <span className="text-xs font-black text-amber-700 uppercase tracking-widest">{feedbacks.length} Reports Logged</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-20">
                            {feedbacks.length > 0 ? feedbacks.filter(f => {
                                if (search === 'bug') return f.type === 'bug';
                                if (search === 'feature') return f.type === 'feature';
                                return true;
                            }).map((f) => (
                                <div key={f.id} className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 hover:border-amber-200 transition-all shadow-sm flex flex-col group relative">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex flex-col gap-2">
                                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border w-max ${
                                                f.type === 'bug' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                            }`}>
                                                {f.type}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-tight">
                                                REF_{f.id.slice(0, 8)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(f.content);
                                                    setToast({ msg: 'Feedback content copied to clipboard', type: 'success' });
                                                }}
                                                className="p-2 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                                title="Copy Content"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002-2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteFeedback(f.id)}
                                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                                title="Delete Feedback"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-grow mb-8">
                                        <p className="text-sm font-medium text-slate-700 leading-relaxed italic">"{f.content}"</p>
                                    </div>

                                    <div className="mt-auto pt-6 border-t border-slate-50 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Operator:</span>
                                            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[150px]">{f.profiles?.email || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Context Node:</span>
                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">{f.tool_id ? getToolName(f.tool_id) : 'Global'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Timestamp:</span>
                                            <span className="text-[10px] font-mono font-bold text-slate-400">{new Date(f.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-full py-40 flex flex-col items-center justify-center grayscale opacity-30">
                                    <svg className="w-20 h-20 mb-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                                    <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Feedback Matrix Clear</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'avatars' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-x divide-slate-200 h-full min-h-[700px] bg-slate-50/50">
                        <div className="p-10 bg-white border-r border-slate-200 flex flex-col shadow-inner">
                            <div className="flex flex-col mb-10">
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Identity Provisioner</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-1">Upload Default Avatars</p>
                            </div>
                            
                            <form onSubmit={handleAvatarUpload} className="space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] ml-1">Identity Label</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="AVATAR_NAME_KEY"
                                        value={newAvatarName} 
                                        onChange={e => setNewAvatarName(e.target.value)} 
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-base font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder-slate-300 font-mono" 
                                    />
                                </div>
                                
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] ml-1">Visual Payload</label>
                                    <div className="relative group">
                                        <input 
                                            type="file" 
                                            required 
                                            accept="image/*"
                                            onChange={e => setAvatarFile(e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="avatar-upload"
                                        />
                                        <label 
                                            htmlFor="avatar-upload"
                                            className="w-full flex flex-col items-center justify-center gap-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] px-8 py-12 cursor-pointer transition-all group-hover:border-indigo-400 group-hover:bg-indigo-50/30"
                                        >
                                            <div className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:border-indigo-200 transition-all shadow-sm">
                                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-black text-slate-600 uppercase tracking-tight mb-1">
                                                    {avatarFile ? avatarFile.name : 'Select Image Protocol'}
                                                </p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PNG, JPG, WEBP (Max 2MB)</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                                
                                <button 
                                    type="submit" 
                                    disabled={isLoading}
                                    className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    Initialize Upload
                                </button>
                            </form>
                        </div>

                        <div className="lg:col-span-2 p-12 overflow-y-auto custom-scrollbar">
                            <div className="flex items-center justify-between mb-10">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-[0.4em]">Identity Presets</h3>
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Global Presets Active</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-8">
                                {defaultAvatars.map(avatar => (
                                    <div key={avatar.id} className="group relative flex flex-col p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] transition-all duration-500 hover:border-indigo-500 hover:ring-8 hover:ring-indigo-50 hover:shadow-2xl">
                                        <div className="aspect-square rounded-[2rem] overflow-hidden mb-6 bg-slate-50 border-2 border-slate-50 group-hover:border-indigo-100 transition-all">
                                            <img src={avatar.url} alt={avatar.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        </div>
                                        <div className="flex flex-col gap-1 text-center">
                                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight truncate px-2">{avatar.name}</h4>
                                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">ID: {avatar.id.slice(0, 8)}</span>
                                        </div>
                                        
                                        <button 
                                            onClick={() => deleteAvatar(avatar)}
                                            className="absolute -top-3 -right-3 w-10 h-10 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-600 active:scale-90"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ))}
                                
                                {defaultAvatars.length === 0 && (
                                    <div className="col-span-full py-32 flex flex-col items-center justify-center gap-6 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-200">
                                        <div className="w-20 h-20 rounded-full bg-white border-2 border-slate-100 flex items-center justify-center text-slate-200">
                                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </div>
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">No Identity Presets Provisioned</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {extendModalUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
                        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl text-indigo-300">
                                    <CalendarPlus className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black uppercase tracking-wider">Extend Personnel Expiry</h3>
                                    <p className="text-xs text-slate-400 font-medium">Identity Expiry Protocol Management</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setExtendModalUser(null)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                                <div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Target Personnel</span>
                                    <span className="text-sm font-black text-slate-900">{extendModalUser.email}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Current Expiry</span>
                                    <span className={`text-xs font-bold font-mono ${extendModalUser.subscription_end && new Date(extendModalUser.subscription_end) < new Date() ? 'text-rose-600' : 'text-slate-700'}`}>
                                        {extendModalUser.subscription_end ? new Date(extendModalUser.subscription_end).toLocaleDateString() : 'None / Expired'}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Preset Extension Terms</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {DURATION_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => {
                                                setExtendTermKey(opt.value);
                                                const baseMs = extendModalUser.subscription_end && new Date(extendModalUser.subscription_end) > new Date()
                                                    ? new Date(extendModalUser.subscription_end).getTime()
                                                    : Date.now();
                                                const projected = new Date(baseMs + getDurationMs(opt.value));
                                                setCustomDateValue(projected.toISOString().split('T')[0]);
                                            }}
                                            className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                                                extendTermKey === opt.value
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-slate-100">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Or Set Specific Expiry Date</label>
                                <input
                                    type="date"
                                    value={customDateValue}
                                    onChange={(e) => {
                                        setCustomDateValue(e.target.value);
                                        setExtendTermKey('custom');
                                    }}
                                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all font-mono"
                                />
                            </div>

                            {customDateValue && (
                                <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-center justify-between">
                                    <span className="text-xs font-bold text-indigo-900 uppercase">New Projected Expiry:</span>
                                    <span className="text-sm font-black text-indigo-600 font-mono">
                                        {new Date(`${customDateValue}T23:59:59.999Z`).toLocaleDateString(undefined, {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                        })}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                            <button
                                onClick={() => setExtendModalUser(null)}
                                className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (extendTermKey === 'custom' || customDateValue) {
                                        extendUserExpiry(extendModalUser, `custom:${customDateValue}`);
                                    } else {
                                        extendUserExpiry(extendModalUser, extendTermKey);
                                    }
                                }}
                                className="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 rounded-xl transition-all active:scale-95 flex items-center gap-2"
                            >
                                <CalendarPlus className="w-4 h-4" />
                                <span>Confirm Extension</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AdminDashboard;