import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, ToolId, SubscriptionTier } from '../types';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import ConfirmationModal from '../components/ConfirmationModal';
import ReleaseNotesModal from '../components/ReleaseNotesModal';
import { History } from 'lucide-react';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'warning' | 'info' | 'success' | 'error';
    is_active: boolean;
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

type IntelligenceRange = '24h' | '7d' | '30d' | 'all';

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

const TIER_OPTIONS = [
    { label: 'Scribe Node', value: SubscriptionTier.SCRIBE },
    { label: 'Artisan Node', value: SubscriptionTier.ARTISAN },
    { label: 'Visionary Node', value: SubscriptionTier.VISIONARY },
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
    const [activeTab, setActiveTab] = useState<'users' | 'keys' | 'announcements' | 'config' | 'intelligence'>('users');
    const [isLoading, setIsLoading] = useState(false);
    const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const { freeToolsData, refreshFreeTools, refreshProfile } = useAuth();

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [search, setSearch] = useState('');
    const [selectedDurations, setSelectedDurations] = useState<Record<string, string>>({});
    const [selectedTiers, setSelectedTiers] = useState<Record<string, SubscriptionTier>>({});

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newType, setNewType] = useState<'info' | 'warning' | 'success' | 'error'>('info');

    const [accessKeys, setAccessKeys] = useState<AccessKeyRecord[]>([]);
    const [keyTool, setKeyTool] = useState<string>('universal');
    const [keyQty, setKeyQty] = useState<number>(1);

    const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
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
            case ToolId.REF_PURGER: return "Reference List Purger";
            case ToolId.GRANT_TAGGER: return "Grant XML Tagger";
            case ToolId.ID_AUDITOR: return "ID Prefix Auditor";
            case ToolId.COMMENT_REPLACER: return "Comment Replacer";
            case ToolId.CITATION_LINKER: return "Citation Linker Pro";
            case 'universal': return "Universal Access";
            default: return tid;
        }
    };

    const fetchUsers = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        try {
            const { data, error } = await supabase.from('profiles').select('*').order('last_seen', { ascending: false, nullsFirst: false });
            if (error) throw error;
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
                setSelectedTiers(prev => {
                    const next = { ...prev };
                    let changed = false;
                    data.forEach(u => {
                        if (!next[u.id]) {
                            next[u.id] = u.subscription_tier || SubscriptionTier.SCRIBE;
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
            const { data, error } = await supabase.from('access_keys').select('*').order('created_at', { ascending: false });
            if (error) throw error;
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
            const { data, error } = await supabase.from('usage_logs').select('*').order('timestamp', { ascending: false });
            if (error) throw error;
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
            const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setAnnouncements(data || []);
        } catch (error: any) { 
            if (!isSilent) setToast({ msg: 'Broadcast fetch failed', type: 'error' }); 
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
            else if (activeTab === 'keys') { await Promise.all([fetchUsers(true), fetchAccessKeys(isSilent)]); }
            else if (activeTab === 'config') { await Promise.all([fetchIntelligence(true), refreshFreeTools()]); }
            else if (activeTab === 'intelligence') await fetchIntelligence(isSilent);
        } catch (e) {
            console.error("Silent sync failed:", e);
        }
    }, [activeTab, fetchUsers, fetchAnnouncements, fetchAccessKeys, refreshFreeTools, fetchIntelligence]);

    useEffect(() => {
        const handleWake = () => {
            if (document.visibilityState === 'visible') {
                refreshActiveTab(true);
            }
        };
        window.addEventListener('visibilitychange', handleWake);
        window.addEventListener('focus', handleWake);
        return () => {
            window.removeEventListener('visibilitychange', handleWake);
            window.removeEventListener('focus', handleWake);
        };
    }, [refreshActiveTab]);

    useEffect(() => {
        refreshActiveTab(false);
    }, [activeTab]); 

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
                    const { error } = await supabase.from('usage_logs').delete().neq('tool_id', 'SYSTEM_RESERVED_VAL');
                    if (error) throw error;
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
                user?.is_subscribed ? (user.subscription_tier || 'PREMIUM').toUpperCase() : 'STANDARD'
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
            const { error } = await supabase.from('access_keys').update({ is_used: false, user_id: null, device_id: null, used_at: null }).eq('id', keyRecord.id);
            if (error) throw error;
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
                    const { error } = await supabase.from('access_keys').delete().eq('id', keyId);
                    if (error) throw error;
                    setAccessKeys(prev => prev.filter(k => k.id !== keyId));
                    setToast({ msg: 'Key purged', type: 'success' });
                } catch (err: any) { setToast({ msg: 'Deletion failed', type: 'error' }); } finally { setIsLoading(false); }
            }
        });
    };

    const toggleSubscription = async (user: UserProfile) => {
        const newVal = !user.is_subscribed;
        const selectedKey = selectedDurations[user.id] || 'sub_1y';
        const selectedTier = selectedTiers[user.id] || SubscriptionTier.SCRIBE;
        const durationOption = DURATION_OPTIONS.find(o => o.value === selectedKey);
        const updates: any = { is_subscribed: newVal };
        
        if (newVal) {
            const end = new Date(Date.now() + getDurationMs(selectedKey)).toISOString();
            updates.subscription_end = end;
            updates.subscription_tier = selectedTier;
            if (durationOption?.type === 'trial') {
                updates.trial_start = new Date().toISOString();
                updates.trial_end = end;
            } else {
                updates.trial_start = null; updates.trial_end = null;
            }
        } else {
            updates.subscription_end = null; updates.trial_start = null; updates.trial_end = null;
            updates.subscription_tier = SubscriptionTier.NONE;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
            if (error) throw error;
            setUsers(users.map(u => u.id === user.id ? { ...u, ...updates } : u));
            setToast({ msg: newVal ? `Authorized (${durationOption?.label})` : 'Access Terminated', type: 'success' });
        } catch (err: any) { setToast({ msg: 'Operation failed', type: 'error' }); } finally { setIsLoading(false); }
    };

    const toggleFreeTool = async (tid: string) => {
        setIsLoading(true);
        try {
            const { data: latest } = await supabase.from('system_settings').select('free_tools_data').eq('id', 'global').maybeSingle();
            const nextData = { ...latest?.free_tools_data || {} };
            if (nextData[tid]) delete nextData[tid];
            else {
                const expiry = new Date(); 
                expiry.setDate(expiry.getDate() + promoDuration);
                nextData[tid] = expiry.toISOString();
            }
            const { error } = await supabase.from('system_settings').upsert({ id: 'global', free_tools_data: nextData, updated_at: new Date().toISOString() });
            if (error) throw error;
            await refreshFreeTools();
            setToast({ msg: `System protocol synchronized (${promoDuration}d Promo)`, type: 'success' });
        } catch (err) { setToast({ msg: 'Protocol update rejected', type: 'error' }); } finally { setIsLoading(false); }
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
                    const expiry = new Date(); 
                    expiry.setDate(expiry.getDate() + 1);
                    const nextData: Record<string, string> = {};
                    Object.values(ToolId).forEach(tid => { if (tid !== 'dashboard' && tid !== 'docs') nextData[tid] = expiry.toISOString(); });
                    
                    const { error } = await supabase.from('system_settings').upsert({ id: 'global', free_tools_data: nextData, updated_at: new Date().toISOString() });
                    if (error) throw error;
                    await refreshFreeTools();
                    setToast({ msg: 'Master protocol deployed: All nodes unlocked.', type: 'success' });
                } catch (err) { setToast({ msg: 'Unlock sequence failed', type: 'error' }); } finally { setIsLoading(false); }
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
                    const { error } = await supabase.from('system_settings').upsert({ id: 'global', free_tools_data: {}, updated_at: new Date().toISOString() });
                    if (error) throw error;
                    await refreshFreeTools();
                    setToast({ msg: 'Protocol strictly enforced: All free access revoked.', type: 'warn' });
                } catch (err) { setToast({ msg: 'Revocation failed', type: 'error' }); } finally { setIsLoading(false); }
            }
        });
    };

    const generateKeys = async () => {
        setIsLoading(true);
        try {
            const newKeys = [];
            for (let i = 0; i < keyQty; i++) {
                const random = Math.random().toString(36).substring(2, 10).toUpperCase();
                newKeys.push({ key: `${random.slice(0,4)}-${random.slice(4)}`, tool: keyTool, is_used: false });
            }
            const { data, error } = await supabase.from('access_keys').insert(newKeys).select();
            if (error) throw error;
            if (data) setAccessKeys(prev => [...data, ...prev]);
            setToast({ msg: `Provisioned ${keyQty} keys`, type: 'success' });
        } catch (err: any) { setToast({ msg: 'Generation failed', type: 'error' }); } finally { setIsLoading(false); }
    };

    const saveAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (editingId) {
                const { error } = await supabase.from('announcements').update({ title: newTitle, content: newContent, type: newType, updated_at: new Date().toISOString() }).eq('id', editingId);
                if (error) throw error;
                setAnnouncements(prev => prev.map(a => a.id === editingId ? { ...a, title: newTitle, content: newContent, type: newType } : a));
                setToast({ msg: 'Broadcast updated', type: 'success' });
            } else {
                const { data, error } = await supabase.from('announcements').insert([{ title: newTitle, content: newContent, type: newType, is_active: false }]).select();
                if (error) throw error;
                if (data) setAnnouncements(prev => [data[0], ...prev]);
                setToast({ msg: 'Broadcast created', type: 'success' });
            }
            setNewTitle(''); setNewContent(''); setNewType('info'); setEditingId(null);
        } catch (err: any) { setToast({ msg: 'Broadcast failed to save', type: 'error' }); } finally { setIsLoading(false); }
    };

    const editAnnouncement = (a: Announcement) => { setEditingId(a.id); setNewTitle(a.title); setNewContent(a.content); setNewType(a.type); };

    const activateAnnouncement = async (id: string) => {
        setIsLoading(true);
        try {
            const target = announcements.find(a => a.id === id);
            if (!target) return;
            const nextStatus = !target.is_active;
            if (nextStatus) await supabase.from('announcements').update({ is_active: false }).neq('id', id);
            const { error } = await supabase.from('announcements').update({ is_active: nextStatus }).eq('id', id);
            if (error) throw error;
            setAnnouncements(prev => prev.map(a => (a.id === id ? { ...a, is_active: nextStatus } : (nextStatus ? { ...a, is_active: false } : a))));
            setToast({ msg: nextStatus ? 'Broadcast Live' : 'Broadcast Halted', type: 'success' });
        } catch (err: any) { setToast({ msg: 'State update failed', type: 'error' }); } finally { setIsLoading(false); }
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
                    const { error } = await supabase.from('announcements').delete().eq('id', id);
                    if (error) throw error;
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

    const activeNodesCount = users.filter(u => {
        if (!u.last_seen) return false;
        return (Date.now() - new Date(u.last_seen).getTime()) < ONLINE_THRESHOLD_MS;
    }).length;

    const intelligenceMetrics = useMemo(() => {
        if (usageLogs.length === 0) return { globalRanking: [], userAffinities: [], rareTools: [], filteredTotal: 0, growth: 0, segments: { premium: 0, standard: 0, segmentCounts: {} }, hourlyIntensity: new Array(24).fill(0), recentActivity: [], toolUsage24h: {} };

        const now = new Date().getTime();
        const userMap = new Map<string, UserProfile>(users.map(u => [u.id, u]));

        const getRangeMs = (r: IntelligenceRange) => {
            switch(r) {
                case '24h': return 24 * 60 * 60 * 1000;
                case '7d': return 7 * 24 * 60 * 60 * 1000;
                case '30d': return 30 * 24 * 60 * 60 * 1000;
                default: return Infinity;
            }
        };

        const rangeMs = getRangeMs(intelRange);
        
        const filteredLogs = usageLogs.filter(log => {
            if (intelRange === 'all') return true;
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
        if (intelRange !== 'all') {
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
        const rareTools = globalRanking.filter(r => r.count < (intelRange === 'all' ? 10 : (intelRange === '30d' ? 5 : 2))).reverse();

        const userAffinities = users.map(user => {
            const counts = userToolCounts[user.id] || {};
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            return {
                id: user.id,
                email: user.email,
                topTool: sorted.length > 0 ? getToolName(sorted[0][0]) : 'None',
                totalActions: Object.values(counts).reduce((a, b) => a + b, 0),
                breakdown: sorted.map(([tid, count]) => ({ name: getToolName(tid), count })),
                lastAction: userLastAction[user.id]
            };
        }).filter(ua => ua.totalActions > 0).sort((a, b) => b.totalActions - a.totalActions);

        const recentActivity = usageLogs.slice(0, 10).map(log => ({
            id: log.id,
            timestamp: log.timestamp,
            toolName: getToolName(log.tool_id),
            user: userMap.get(log.user_id)?.email || `Anonymous_${log.user_id.slice(0,4)}`
        }));

        return { globalRanking, userAffinities, rareTools, filteredTotal: filteredLogs.length, growth, segments: { premium: premiumUsage, standard: standardUsage, segmentCounts }, hourlyIntensity, recentActivity, toolUsage24h };
    }, [usageLogs, users, intelRange]);

    const focusedUser = useMemo(() => {
        if (!focusedUserId) return null;
        return intelligenceMetrics.userAffinities.find(u => u.id === focusedUserId);
    }, [focusedUserId, intelligenceMetrics.userAffinities]);

    const getCountdown = (expiry: string) => {
        const diff = new Date(expiry).getTime() - Date.now();
        if (diff <= 0) return 'Expired';
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}h ${m}m remaining`;
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <ReleaseNotesModal isOpen={isReleaseNotesOpen} onClose={() => setIsReleaseNotesOpen(false)} />
            <ConfirmationModal isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} confirmLabel={confirmConfig.confirmLabel} type={confirmConfig.type} onConfirm={() => { confirmConfig.onConfirm(); setConfirmConfig(prev => ({ ...prev, isOpen: false })); }} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl uppercase tracking-widest leading-none">Admin Console</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Central Authorization & Intelligence Node</p>
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={() => setIsReleaseNotesOpen(true)}
                        className="bg-white border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] shadow-sm hover:bg-slate-50 transition-all flex items-center gap-3"
                    >
                        <History size={14} />
                        v1.6.0
                    </button>
                    <button 
                        onClick={systemHardReset}
                        className="bg-white border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] shadow-sm hover:bg-slate-50 transition-all flex items-center gap-3"
                    >
                        <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Integrity Sync
                    </button>
                    <div className="bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-4 border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${activeNodesCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                {activeNodesCount} Active Nodes
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl mb-6 w-full max-w-4xl overflow-x-auto">
                <button onClick={() => setActiveTab('users')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Personnel</button>
                <button onClick={() => setActiveTab('keys')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'keys' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Key Matrix</button>
                <button onClick={() => setActiveTab('intelligence')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'intelligence' ? 'bg-white text-purple-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Intelligence</button>
                <button onClick={() => setActiveTab('config')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'config' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Protocols</button>
                <button onClick={() => setActiveTab('announcements')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'announcements' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Broadcasts</button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[600px] relative">
                {isLoading && <LoadingOverlay message="Synchronizing..." color="slate" />}
                
                {activeTab === 'users' && (
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
                                {users.filter(u => u.email.includes(search)).map(u => (
                                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4"><div className="flex flex-col"><span className="text-sm font-bold text-slate-900">{u.email}</span><span className="text-[10px] font-mono text-slate-400 uppercase">{u.id.slice(0, 13)}...</span></div></td>
                                        <td className="px-6 py-4 text-xs font-black uppercase text-slate-400 tracking-tighter">{u.role}</td>
                                        <td className="px-6 py-4"><span className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest border ${u.is_subscribed ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{u.is_subscribed ? (u.subscription_tier || 'Authorized').toUpperCase() : 'Dormant'}</span></td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-slate-600">
                                                    {u.subscription_end ? new Date(u.subscription_end).toLocaleDateString() : 'N/A'}
                                                </span>
                                                {u.subscription_end && new Date(u.subscription_end) < new Date() && (
                                                    <span className="text-[8px] font-black text-rose-500 uppercase tracking-tighter">Terminated</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center"><div className="flex flex-col items-center"><span className="text-[11px] font-bold text-slate-600">{formatLastSeen(u.last_seen)}</span></div></td>
                                        <td className="px-6 py-4"><div className="flex items-center gap-3">{!u.is_subscribed && (<div className="flex flex-col gap-1"><select value={selectedTiers[u.id] || SubscriptionTier.SCRIBE} onChange={(e) => setSelectedTiers(prev => ({...prev, [u.id]: e.target.value as SubscriptionTier}))} className="text-[10px] font-black uppercase py-1.5 rounded-lg border-slate-200 bg-white"><optgroup label="Tier">{TIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup></select><select value={selectedDurations[u.id] || 'sub_1y'} onChange={(e) => setSelectedDurations(prev => ({...prev, [u.id]: e.target.value}))} className="text-[10px] font-black uppercase py-1.5 rounded-lg border-slate-200 bg-white"><optgroup label="Access Term">{DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup></select></div>)}<button onClick={() => toggleSubscription(u)} className={`text-[10px] font-black px-4 py-2 rounded-xl border border-slate-200 uppercase transition-all shadow-sm ${u.is_subscribed ? 'text-rose-600 border-rose-100 bg-rose-50 hover:bg-rose-600 hover:text-white' : 'text-indigo-600 hover:bg-indigo-600 hover:text-white'}`}>{u.is_subscribed ? 'Terminate' : 'Authorize'}</button></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Protocol Management</span>
                                        <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                                        <span className="text-[10px] font-bold text-indigo-600 uppercase">Live Database Sync</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Temporary Protocol Offset (Days)</label>
                                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                                    {PROMO_DURATIONS.map(d => (
                                        <button key={d.value} onClick={() => setPromoDuration(d.value)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${promoDuration === d.value ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{d.label}</button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
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
                    <div className="p-8 lg:p-12 space-y-12 animate-fade-in flex flex-col pb-32">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 shadow-inner">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Intelligence Node</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">{intelligenceMetrics.filteredTotal} System Actions Logged</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <button onClick={() => refreshActiveTab(false)} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm" title="Refresh Live Data">
                                    <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                                <button onClick={exportRawTelemetry} className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Export Logs
                                </button>
                                <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                                    {(['24h', '7d', '30d', 'all'] as const).map(range => (
                                        <button 
                                            key={range}
                                            onClick={() => setIntelRange(range)}
                                            className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${intelRange === range ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            {range === '24h' ? 'Daily' : range === '7d' ? 'Weekly' : range === '30d' ? 'Monthly' : 'All'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <section className="grid grid-cols-1 md:grid-cols-4 gap-8">
                            <div className="p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] shadow-sm flex flex-col justify-center text-center">
                                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-3">Premium Pulse</div>
                                <div className="text-5xl font-black text-indigo-900 leading-none mb-4">{intelligenceMetrics.segments.premium}</div>
                                <div className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest">Authorized Operations</div>
                            </div>
                            <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem] shadow-sm flex flex-col justify-center text-center">
                                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-3">Standard Pulse</div>
                                <div className="text-5xl font-black text-emerald-900 leading-none mb-4">{intelligenceMetrics.segments.standard}</div>
                                <div className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">Public Traffic</div>
                            </div>
                            <div className="p-8 bg-purple-50 border border-purple-100 rounded-[2.5rem] shadow-sm flex flex-col justify-center text-center">
                                <div className="text-[10px] font-black text-purple-400 uppercase tracking-[0.4em] mb-3">Velocity Growth</div>
                                <div className={`text-5xl font-black leading-none mb-4 ${intelligenceMetrics.growth >= 0 ? 'text-purple-900' : 'text-rose-600'}`}>
                                    {intelligenceMetrics.growth >= 0 ? '+' : ''}{intelligenceMetrics.growth}%
                                </div>
                                <div className="text-[9px] font-bold text-purple-300 uppercase tracking-widest">Vs Previous Window</div>
                            </div>
                            <div className="p-8 bg-slate-900 rounded-[2.5rem] shadow-xl flex flex-col justify-center text-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent"></div>
                                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-3 relative z-10">Persistence</div>
                                <div className="text-5xl font-black text-white leading-none mb-4 relative z-10">
                                    {users.length > 0 ? Math.round((intelligenceMetrics.userAffinities.length / users.length) * 100) : 0}%
                                </div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest relative z-10">Operator Retention</div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                            <section className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Temporal Heatmap</h3>
                                </div>
                                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
                                    {intelligenceMetrics.hourlyIntensity.map((val, hour) => {
                                        const maxIntensity = Math.max(...intelligenceMetrics.hourlyIntensity, 1);
                                        const opacity = (val / maxIntensity) * 0.9 + 0.1;
                                        return (
                                            <div key={hour} className="group relative">
                                                <div 
                                                    className="h-10 rounded-lg transition-all duration-500"
                                                    style={{ backgroundColor: `rgba(99, 102, 241, ${opacity})`, boxShadow: val > (maxIntensity * 0.8) ? '0 0 10px rgba(99, 102, 241, 0.3)' : 'none' }}
                                                ></div>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-900 text-white text-[9px] font-black p-2 rounded shadow-xl whitespace-nowrap z-20">
                                                    {hour}:00 - {val} Hits
                                                </div>
                                                <span className="text-[8px] font-bold text-slate-400 mt-1 block text-center uppercase">{hour}h</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-6 italic text-center">Normalized usage density across a 24-hour protocol cycle</p>
                            </section>

                            <section className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-full"></div>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-indigo-400 shadow-sm border border-white/5">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Live Protocol Feed</h3>
                                </div>
                                <div className="space-y-4">
                                    {intelligenceMetrics.recentActivity.length > 0 ? intelligenceMetrics.recentActivity.map((act) => (
                                        <div key={act.id} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
                                            <div className="flex-grow min-w-0">
                                                <p className="text-xs font-bold text-indigo-300 uppercase tracking-tighter truncate">{act.toolName}</p>
                                                <p className="text-[9px] text-slate-500 font-mono truncate">{act.user}</p>
                                            </div>
                                            <span className="text-[9px] font-black text-slate-600 uppercase whitespace-nowrap">{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    )) : (
                                        <div className="py-20 text-center opacity-20"><p className="text-xs font-black uppercase text-white">System Signal Silent</p></div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Module Saturation Leaderboard</h3>
                                </div>
                                <div className="space-y-8">
                                    {intelligenceMetrics.globalRanking.length > 0 ? intelligenceMetrics.globalRanking.slice(0, 8).map((tool) => {
                                        const premCount = intelligenceMetrics.segments.segmentCounts.premium[tool.id] || 0;
                                        const stdCount = intelligenceMetrics.segments.segmentCounts.standard[tool.id] || 0;
                                        const premPercent = tool.count > 0 ? (premCount / tool.count) * 100 : 0;
                                        return (
                                            <div key={tool.id} className="relative">
                                                <div className="flex justify-between items-end mb-2.5">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{tool.name}</span>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[8px] font-black text-indigo-400 uppercase">Premium: {premCount}</span>
                                                            <span className="text-[8px] font-black text-slate-300">/</span>
                                                            <span className="text-[8px] font-black text-emerald-400 uppercase">Std: {stdCount}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{tool.count}</span>
                                                </div>
                                                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50 flex">
                                                    <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-1000 ease-out" style={{ width: `${premPercent}%` }}></div>
                                                    <div className="h-full bg-emerald-400 transition-all duration-1000 ease-out" style={{ width: `${100 - premPercent}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="py-20 text-center opacity-30 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">System Silence Detected</p>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Cold Node Analysis</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {intelligenceMetrics.rareTools.length > 0 ? (
                                        intelligenceMetrics.rareTools.slice(0, 4).map(tool => (
                                            <div key={tool.id} className="p-6 bg-white border border-slate-200 rounded-[2.5rem] flex flex-col items-center text-center shadow-sm hover:shadow-md transition-all hover:border-rose-200">
                                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-2">Low Velocity</span>
                                                <h4 className="text-xs font-bold text-slate-800 uppercase mb-4 leading-snug">{tool.name}</h4>
                                                <span className="text-[9px] font-mono font-black bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 text-slate-400">{tool.count} hits</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="col-span-full py-20 flex flex-col items-center justify-center bg-emerald-50/30 rounded-[2.5rem] border-2 border-dashed border-emerald-100 opacity-60">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Global saturation optimal</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 pb-20">
                            <section className="xl:col-span-2">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Personnel Engagement Audit</h3>
                                </div>
                                <div className="overflow-x-auto shadow-sm rounded-3xl border border-slate-200">
                                    <table className="min-w-full divide-y divide-slate-100 bg-slate-50/30">
                                        <thead className="bg-white/80 backdrop-blur-sm">
                                            <tr>
                                                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Operator</th>
                                                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Protocol</th>
                                                <th className="px-8 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Action Index</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {intelligenceMetrics.userAffinities.length > 0 ? intelligenceMetrics.userAffinities.map((ua) => (
                                                <tr key={ua.id} onClick={() => setFocusedUserId(ua.id)} className={`cursor-pointer transition-all ${focusedUserId === ua.id ? 'bg-indigo-600 ring-4 ring-indigo-100' : 'hover:bg-white'}`}>
                                                    <td className={`px-8 py-5 text-sm font-bold ${focusedUserId === ua.id ? 'text-white' : 'text-slate-900'}`}>{ua.email}</td>
                                                    <td className="px-8 py-5"><span className={`px-4 py-1.5 text-[10px] font-black rounded-xl shadow-sm uppercase tracking-tighter border ${focusedUserId === ua.id ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-indigo-100 text-indigo-600'}`}>{ua.topTool}</span></td>
                                                    <td className="px-8 py-5 text-center"><span className={`text-[11px] font-mono font-bold ${focusedUserId === ua.id ? 'text-indigo-200' : 'text-slate-500'}`}>{ua.totalActions} logged</span></td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={3} className="px-8 py-20 text-center opacity-30 text-[10px] font-black uppercase tracking-widest text-slate-400">No active sessions in current window</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="xl:col-span-1">
                                {focusedUser ? (
                                    <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-slate-900/40 sticky top-24 animate-slide-up ring-4 ring-slate-800">
                                        <div className="flex justify-between items-start mb-12">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-3">Operator DNA</span>
                                                <h4 className="text-2xl font-black truncate max-w-[200px] uppercase tracking-tighter leading-none">{focusedUser.email.split('@')[0]}</h4>
                                                <p className="text-[10px] text-slate-500 truncate lowercase mt-2 font-mono">{focusedUser.email}</p>
                                            </div>
                                            <button onClick={() => setFocusedUserId(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-slate-500 hover:text-white border border-white/10">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                        <div className="space-y-10">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 border-b border-white/5 pb-2">Module Utilization Profile</p>
                                                <div className="space-y-6">
                                                    {focusedUser.breakdown.map((item, i) => (
                                                        <div key={i} className="group">
                                                            <div className="flex justify-between text-[11px] font-bold mb-2.5">
                                                                <span className="text-slate-300 group-hover:text-white transition-colors uppercase tracking-wider">{item.name}</span>
                                                                <span className="text-indigo-400 font-mono">{item.count}</span>
                                                            </div>
                                                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden shadow-inner">
                                                                <div className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.6)] transition-all duration-1000 ease-out" style={{ width: `${(item.count / focusedUser.totalActions) * 100}%` }}></div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            {focusedUser.lastAction && (
                                                <div className="pt-10 border-t border-white/10">
                                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Last Protocol Access</p>
                                                    <div className="p-5 bg-white/5 rounded-3xl border border-white/5 shadow-inner">
                                                        <span className="text-[11px] font-black text-indigo-300 block mb-2 uppercase tracking-widest">{getToolName(focusedUser.lastAction.tool)}</span>
                                                        <span className="text-[10px] text-slate-500 font-mono italic">{new Date(focusedUser.lastAction.time).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 opacity-60">
                                        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-300 mb-6 shadow-sm border border-slate-100">
                                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        </div>
                                        <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Telemetry Disengaged</p>
                                        <p className="text-[10px] text-slate-400 mt-3 font-medium px-8 leading-relaxed italic text-center">Select an operator to inspect their module usage DNA.</p>
                                    </div>
                                )}
                            </section>
                        </div>
                        
                        <div className="pt-20 pb-32 border-t border-slate-100">
                            <div className="bg-rose-50/30 rounded-[2.5rem] border-2 border-dashed border-rose-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 shadow-sm">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-rose-900 uppercase tracking-tight">Intelligence Danger Zone</h4>
                                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mt-1">Purge all production telemetry from the database</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={purgeTelemetry}
                                    className="px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-rose-200 transition-all active:scale-95"
                                >
                                    Reset Intelligence Database
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'announcements' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-x divide-slate-200 h-full min-h-[700px] bg-slate-50/50">
                        <div className="p-10 bg-white border-r border-slate-200 flex flex-col shadow-inner">
                            <div className="flex justify-between items-center mb-10">
                                <div className="flex flex-col">
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Signal Transmitter</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-1">Deploy Global Broadcast</p>
                                </div>
                                {editingId && (
                                    <button 
                                        onClick={() => { setEditingId(null); setNewTitle(''); setNewContent(''); setNewType('info'); }} 
                                        className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center transition-all hover:bg-rose-500 hover:text-white"
                                        title="Cancel Edit"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                            
                            <form onSubmit={saveAnnouncement} className="space-y-8 flex-grow flex flex-col">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] ml-1">Subject Frequency</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="SIGNAL_TITLE_KEY"
                                        value={newTitle} 
                                        onChange={e => setNewTitle(e.target.value)} 
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder-slate-300 font-mono" 
                                    />
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] ml-1">Severity Layer</label>
                                    <select 
                                        value={newType} 
                                        onChange={e => setNewType(e.target.value as any)} 
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all appearance-none"
                                    >
                                        <option value="info">STANDARD_PULSE (INFO)</option>
                                        <option value="warning">ALERT_THRESHOLD (WARN)</option>
                                        <option value="success">STABLE_RESOLUTION (OK)</option>
                                        <option value="error">CRITICAL_EXCEPTION (ERROR)</option>
                                    </select>
                                </div>
                                
                                <div className="space-y-2 flex-grow flex flex-col">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] ml-1">Payload Content</label>
                                    <textarea 
                                        required 
                                        placeholder="ENTER_TRANSMISSION_DATA..."
                                        value={newContent} 
                                        onChange={e => setNewContent(e.target.value)} 
                                        className="w-full flex-grow bg-slate-50 border-2 border-slate-100 rounded-[2rem] px-6 py-5 text-sm font-medium text-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all resize-none leading-relaxed placeholder-slate-300" 
                                    />
                                </div>
                                
                                <button 
                                    type="submit" 
                                    className={`w-full py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4 ${
                                        editingId ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200' : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200'
                                    }`}
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    {editingId ? 'Push Update' : 'Initialize Signal'}
                                </button>
                            </form>
                        </div>

                        <div className="lg:col-span-2 p-12 overflow-y-auto custom-scrollbar">
                            <div className="flex items-center justify-between mb-10">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em]">Signal Logs</h3>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Frequency Stable</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {announcements.map(a => {
                                    const typeColors = {
                                        info: 'border-indigo-100 text-indigo-600 bg-indigo-50',
                                        warning: 'border-amber-100 text-amber-600 bg-amber-50',
                                        success: 'border-emerald-100 text-emerald-600 bg-emerald-50',
                                        error: 'border-rose-100 text-rose-600 bg-rose-50'
                                    };
                                    
                                    return (
                                        <div key={a.id} className={`group relative flex flex-col p-8 bg-white border-2 rounded-[2.5rem] transition-all duration-500 ${
                                            a.is_active ? 'border-indigo-500 ring-8 ring-indigo-50 shadow-2xl' : 'border-slate-100 hover:border-slate-200 shadow-sm opacity-80 hover:opacity-100'
                                        }`}>
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="flex flex-col gap-2">
                                                    <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border w-max ${typeColors[a.type]}`}>
                                                        {a.type}_TRANS
                                                    </div>
                                                    <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-tight">
                                                        PKT_{a.id.slice(0, 8)}
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                                                    <button onClick={() => editAnnouncement(a)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 border border-transparent hover:border-indigo-100 transition-all">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                    </button>
                                                    <button onClick={() => deleteAnnouncement(a.id)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-100 transition-all">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <h4 className="text-lg font-black text-slate-900 mb-3 uppercase tracking-tight leading-none truncate pr-4">{a.title}</h4>
                                            <div className="text-[12px] text-slate-500 font-medium leading-relaxed mb-10 flex-grow h-20 overflow-hidden line-clamp-4 italic">
                                                {a.content}
                                            </div>

                                            <div className="mt-auto flex items-center justify-between border-t border-slate-50 pt-6">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Time Marker</span>
                                                    <span className="text-[10px] font-mono font-bold text-slate-500">{new Date(a.created_at).toLocaleString([], { hour12: false })}</span>
                                                </div>

                                                <button 
                                                    onClick={() => activateAnnouncement(a.id)}
                                                    className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all border-2 flex items-center gap-3 active:scale-95 ${
                                                        a.is_active 
                                                            ? 'bg-rose-50 border-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white' 
                                                            : 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white shadow-lg shadow-emerald-500/10'
                                                    }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${a.is_active ? 'bg-rose-600 animate-pulse' : 'bg-emerald-600'}`}></span>
                                                    {a.is_active ? 'Terminate' : 'Deploy'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                
                                {announcements.length === 0 && (
                                    <div className="col-span-full py-40 text-center opacity-30 grayscale flex flex-col items-center justify-center">
                                        <svg className="w-20 h-20 mb-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 v2M7 7h10" /></svg>
                                        <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Signal Archive Empty</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AdminDashboard;