import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, ToolId, ToolAccessMode } from '../types';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';
import ConfirmationModal from '../components/ConfirmationModal';

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

    if (diffMs < 240000) {
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
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const { freeToolsData, toolAccessConfigs, refreshFreeTools } = useAuth();

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [search, setSearch] = useState('');
    const [selectedDurations, setSelectedDurations] = useState<Record<string, string>>({});

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
                const durMap: Record<string, string> = {};
                data.forEach(u => { if (!selectedDurations[u.id]) durMap[u.id] = 'sub_1y'; });
                if (Object.keys(durMap).length > 0) setSelectedDurations(prev => ({ ...prev, ...durMap }));
            }
        } catch (error: any) {
            if (!isSilent) setToast({ msg: 'Personnel check failed', type: 'error' });
        } finally { setIsLoading(false); }
    }, [selectedDurations]);

    const fetchAccessKeys = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('access_keys').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setAccessKeys(data || []);
        } catch (error: any) {
            setToast({ msg: 'Key matrix fetch failed', type: 'error' });
        } finally { setIsLoading(false); }
    }, []);

    const fetchIntelligence = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('usage_logs').select('tool_id, user_id, timestamp').order('timestamp', { ascending: false });
            if (error) throw error;
            setUsageLogs(data || []);
            await fetchUsers(true);
        } catch (error: any) {
            console.warn("Usage logs might not exist yet.");
        } finally { setIsLoading(false); }
    }, [fetchUsers]);

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

    const fetchAnnouncements = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setAnnouncements(data || []);
        } catch (error: any) { setToast({ msg: 'Broadcast fetch failed', type: 'error' }); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        else if (activeTab === 'announcements') fetchAnnouncements();
        else if (activeTab === 'keys') fetchUsers(true).then(() => fetchAccessKeys());
        else if (activeTab === 'config') refreshFreeTools();
        else if (activeTab === 'intelligence') fetchIntelligence();
    }, [activeTab, fetchUsers, fetchAnnouncements, fetchAccessKeys, refreshFreeTools, fetchIntelligence]);

    useEffect(() => {
        if (activeTab === 'users') {
            const interval = setInterval(() => fetchUsers(true), 45000); 
            return () => clearInterval(interval);
        }
    }, [activeTab, fetchUsers]);

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

    const updateToolAccessMode = async (tid: string, mode: ToolAccessMode) => {
        setIsLoading(true);
        try {
            // 1. Fetch latest config with explicit check for the global row
            const { data: latest, error: fetchError } = await supabase
                .from('system_settings')
                .select('tool_access_configs')
                .eq('id', 'global')
                .maybeSingle();
            
            if (fetchError) throw fetchError;

            // 2. Prepare next state (merge with existing or use empty object)
            const nextConfigs = { ...(latest?.tool_access_configs || {}) };
            nextConfigs[tid] = mode;
            
            // 3. Upsert into database
            const { error: upsertError } = await supabase
                .from('system_settings')
                .upsert({ 
                    id: 'global', 
                    tool_access_configs: nextConfigs, 
                    updated_at: new Date().toISOString() 
                }, { onConflict: 'id' });

            if (upsertError) throw upsertError;

            // 4. Update UI context
            await refreshFreeTools();
            setToast({ msg: `${getToolName(tid)} set to ${mode.replace(/_/g, ' ')} mode.`, type: 'success' });
        } catch (err: any) { 
            console.error("Matrix Update Failure Details:", err);
            // Specific check for "column does not exist" error 42703
            if (err.code === '42703') {
                setToast({ msg: 'Structural mismatch: Please run the SQL migration script in Supabase dashboard.', type: 'error' });
            } else {
                setToast({ msg: `Update rejected: ${err.message || 'Check database permissions'}`, type: 'error' }); 
            }
        } finally { 
            setIsLoading(false); 
        }
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

    const deleteAnnouncement = (id: string) => {
        setConfirmConfig({
            isOpen: true, title: 'Delete Broadcast', message: 'Are you sure?', confirmLabel: 'Delete', type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    const { error } = await supabase.from('announcements').delete().eq('id', id);
                    if (error) throw error;
                    setAnnouncements(prev => prev.filter(a => a.id !== id));
                    setToast({ msg: 'Broadcast purged', type: 'success' });
                } catch (err: any) { setToast({ msg: 'Deletion failed', type: 'error' }); } finally { setIsLoading(false); }
            }
        });
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

    const activeNodesCount = users.filter(u => {
        if (!u.last_seen) return false;
        return (Date.now() - new Date(u.last_seen).getTime()) < 300000;
    }).length;

    // --- Intelligence Analytics with Temporal & Per-User Filters ---
    const intelligenceMetrics = useMemo(() => {
        if (usageLogs.length === 0) return { globalRanking: [], userAffinities: [], rareTools: [], filteredTotal: 0 };

        const now = new Date().getTime();
        const filteredLogs = usageLogs.filter(log => {
            if (intelRange === 'all') return true;
            const logTime = new Date(log.timestamp).getTime();
            const diff = now - logTime;
            if (intelRange === '24h') return diff <= 24 * 60 * 60 * 1000;
            if (intelRange === '7d') return diff <= 7 * 24 * 60 * 60 * 1000;
            if (intelRange === '30d') return diff <= 30 * 24 * 60 * 60 * 1000;
            return true;
        });

        const toolCounts: Record<string, number> = {};
        const userToolCounts: Record<string, Record<string, number>> = {};
        const userLastAction: Record<string, { tool: string, time: string }> = {};

        filteredLogs.forEach(log => {
            toolCounts[log.tool_id] = (toolCounts[log.tool_id] || 0) + 1;
            if (!userToolCounts[log.user_id]) userToolCounts[log.user_id] = {};
            userToolCounts[log.user_id][log.tool_id] = (userToolCounts[log.user_id][log.tool_id] || 0) + 1;
            
            if (!userLastAction[log.user_id]) {
                userLastAction[log.user_id] = { tool: log.tool_id, time: log.timestamp };
            }
        });

        const allAvailableTools = Object.values(ToolId).filter(id => id !== 'dashboard' && id !== 'docs');
        
        const globalRanking = allAvailableTools.map(id => ({
            id,
            name: getToolName(id),
            count: toolCounts[id] || 0
        })).sort((a, b) => b.count - a.count);

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

        return { globalRanking, userAffinities, rareTools, filteredTotal: filteredLogs.length };
    }, [usageLogs, users, intelRange]);

    const focusedUser = useMemo(() => {
        if (!focusedUserId) return null;
        return intelligenceMetrics.userAffinities.find(u => u.id === focusedUserId);
    }, [focusedUserId, intelligenceMetrics.userAffinities]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <ConfirmationModal isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} confirmLabel={confirmConfig.confirmLabel} type={confirmConfig.type} onConfirm={() => { confirmConfig.onConfirm(); setConfirmConfig(prev => ({ ...prev, isOpen: false })); }} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl uppercase tracking-widest leading-none">Admin Console</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Central Authorization & Intelligence Node</p>
                </div>
                <div className="bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${activeNodesCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            {activeNodesCount} Active Nodes
                        </span>
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] relative">
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
                                        <td className="px-6 py-4"><span className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest border ${u.is_subscribed ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{u.is_subscribed ? 'Authorized' : 'Dormant'}</span></td>
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
                                        <td className="px-6 py-4"><div className="flex items-center gap-3">{!u.is_subscribed && (<select value={selectedDurations[u.id] || 'sub_1y'} onChange={(e) => setSelectedDurations(prev => ({...prev, [u.id]: e.target.value}))} className="text-[10px] font-black uppercase py-1.5 rounded-lg border-slate-200 bg-white"><optgroup label="Access Term">{DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup></select>)}<button onClick={() => toggleSubscription(u)} className={`text-[10px] font-black px-4 py-2 rounded-xl border border-slate-200 uppercase transition-all shadow-sm ${u.is_subscribed ? 'text-rose-600 border-rose-100 bg-rose-50 hover:bg-rose-600 hover:text-white' : 'text-indigo-600 hover:bg-indigo-600 hover:text-white'}`}>{u.is_subscribed ? 'Terminate' : 'Authorize'}</button></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'intelligence' && (
                    <div className="p-8 lg:p-12 space-y-12 animate-fade-in">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 shadow-inner">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Intelligence Node</h2>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">{intelligenceMetrics.filteredTotal} System Actions Logged</p>
                                </div>
                            </div>
                            
                            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                                {(['24h', '7d', '30d', 'all'] as const).map(range => (
                                    <button 
                                        key={range}
                                        onClick={() => setIntelRange(range)}
                                        className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${intelRange === range ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {range === '24h' ? 'Daily' : range === '7d' ? 'Weekly' : range === '30d' ? 'Monthly' : 'Yearly/All'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Global Node Usage</h3>
                                </div>
                                <div className="space-y-8">
                                    {intelligenceMetrics.globalRanking.slice(0, 8).map((tool, idx) => (
                                        <div key={tool.id} className="relative">
                                            <div className="flex justify-between items-end mb-2.5">
                                                <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{tool.name}</span>
                                                <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{tool.count}</span>
                                            </div>
                                            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-1000 ease-out" 
                                                    style={{ width: `${Math.min(100, (tool.count / Math.max(1, intelligenceMetrics.filteredTotal)) * 500)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Cold Nodes</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {intelligenceMetrics.rareTools.length > 0 ? (
                                        intelligenceMetrics.rareTools.slice(0, 4).map(tool => (
                                            <div key={tool.id} className="p-6 bg-white border border-slate-200 rounded-[2rem] flex flex-col items-center text-center shadow-sm hover:shadow-md transition-all hover:border-rose-200">
                                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-2">Underutilized</span>
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
                    </div>
                )}

                {activeTab === 'keys' && (
                    <div className="p-8 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-inner">
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Target Module</label><select value={keyTool} onChange={e => setKeyTool(e.target.value)} className="w-full rounded-xl border-slate-200 text-sm font-bold bg-white focus:ring-2 focus:ring-indigo-100 outline-none"><option value="universal">Universal Access</option><option value={ToolId.XML_RENUMBER}>XML Normalizer</option><option value={ToolId.CREDIT_GENERATOR}>CRediT Tagging</option><option value={ToolId.TABLE_BEAUTIFIER}>Table XML Beautifier</option></select></div>
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Quantity</label><input type="number" min="1" max="50" value={keyQty} onChange={e => setKeyQty(parseInt(e.target.value))} className="w-full rounded-xl border-slate-200 text-sm font-bold bg-white focus:ring-2 focus:ring-indigo-100 outline-none" /></div>
                            <button onClick={generateKeys} className="bg-slate-900 text-white font-black py-2.5 rounded-xl uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">Generate</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50 font-black text-slate-400 uppercase text-[10px]">
                                    <tr>
                                        <th className="px-6 py-4 text-left">Key</th>
                                        <th className="px-6 py-4 text-left">Target</th>
                                        <th className="px-6 py-4 text-left">Status</th>
                                        <th className="px-6 py-4 text-left">User</th>
                                        <th className="px-6 py-4 text-left">Device ID</th>
                                        <th className="px-6 py-4 text-left">Control</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {accessKeys.map(k => (
                                        <tr key={k.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 font-mono font-black text-indigo-600 text-sm tracking-widest">{k.key}</td>
                                            <td className="px-6 py-4 text-[11px] font-bold text-slate-600">{getToolName(k.tool)}</td>
                                            <td className="px-6 py-4"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${k.is_used ? 'text-rose-500 bg-rose-50 border-rose-100' : 'text-emerald-500 bg-emerald-50 border-emerald-100'}`}>{k.is_used ? 'LOCKED' : 'AVAIL'}</span></td>
                                            <td className="px-6 py-4 text-[11px] font-bold text-slate-600">{users.find(u => u.id === k.user_id)?.email || 'Unbound'}</td>
                                            <td className="px-6 py-4">
                                                {k.device_id ? (
                                                    <span className="font-mono text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200" title={k.device_id}>
                                                        {k.device_id.replace('dev_', '').substring(0, 16).toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-slate-300 uppercase italic">Unbound</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4"><div className="flex gap-2">{k.is_used && <button onClick={() => handleRevokeKey(k)} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded transition-colors" title="Revoke Device Bind"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>}<button onClick={() => handleDeleteKey(k.id)} className="p-1.5 text-rose-300 hover:text-rose-600 transition-colors" title="Delete Key"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'config' && (
                    <div className="p-10 space-y-12">
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-8">
                                <div className="flex flex-col">
                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">System Protocols</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Automatic Node Provisioning (Free Zone)</p>
                                </div>
                                
                                <div className="flex flex-col gap-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Provisioning Term</label>
                                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                                        {PROMO_DURATIONS.map(d => (
                                            <button 
                                                key={d.value}
                                                onClick={() => setPromoDuration(d.value)}
                                                className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${promoDuration === d.value ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                {d.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {Object.values(ToolId).filter(id => id !== 'dashboard' && id !== 'docs').map(tid => {
                                    const expiry = freeToolsData[tid]; const isFree = !!expiry && new Date(expiry) > new Date();
                                    return (
                                        <div key={tid} onClick={() => toggleFreeTool(tid)} className={`p-6 rounded-[1.5rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${isFree ? 'border-emerald-500 bg-emerald-50 shadow-lg' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                                            <div className="flex flex-col">
                                                <span className={`text-xs font-black uppercase ${isFree ? 'text-emerald-700' : 'text-slate-700'}`}>{getToolName(tid)}</span>
                                                {isFree ? (
                                                    <span className="text-[9px] font-black text-emerald-600 mt-1 uppercase">EXPIRES: {new Date(expiry!).toLocaleDateString()}</span>
                                                ) : (
                                                    <span className="text-[9px] font-bold text-slate-300 mt-1 uppercase">LOCKED STATUS</span>
                                                )}
                                            </div>
                                            <div className={`w-10 h-5 rounded-full relative transition-colors border ${isFree ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-200 border-slate-300'}`}><div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${isFree ? 'left-[22px]' : 'left-1'}`}></div></div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-6 pt-10 border-t border-slate-100">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Access Control Matrix</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure Mandatory Authorization Logic per Protocol</p>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                                <table className="min-w-full divide-y divide-slate-100">
                                    <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[9px]">
                                        <tr>
                                            <th className="px-8 py-5 text-left">Module Identification</th>
                                            <th className="px-8 py-5 text-center">Subscription Only</th>
                                            <th className="px-8 py-5 text-center">Subscription OR Key</th>
                                            <th className="px-8 py-5 text-center">Strictly Key Only</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {Object.values(ToolId).filter(id => id !== 'dashboard' && id !== 'docs').map(tid => {
                                            const currentMode = toolAccessConfigs[tid] || ToolAccessMode.SUBSCRIPTION;
                                            return (
                                                <tr key={tid} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-8 py-5">
                                                        <span className="text-xs font-black text-slate-800 uppercase tracking-tighter">{getToolName(tid)}</span>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        <div className="flex justify-center">
                                                            <input 
                                                                type="radio" 
                                                                name={`mode-${tid}`}
                                                                checked={currentMode === ToolAccessMode.SUBSCRIPTION}
                                                                onChange={() => updateToolAccessMode(tid, ToolAccessMode.SUBSCRIPTION)}
                                                                className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        <div className="flex justify-center">
                                                            <input 
                                                                type="radio" 
                                                                name={`mode-${tid}`}
                                                                checked={currentMode === ToolAccessMode.KEY_OR_SUBSCRIPTION}
                                                                onChange={() => updateToolAccessMode(tid, ToolAccessMode.KEY_OR_SUBSCRIPTION)}
                                                                className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        <div className="flex justify-center">
                                                            <input 
                                                                type="radio" 
                                                                name={`mode-${tid}`}
                                                                checked={currentMode === ToolAccessMode.KEY_ONLY}
                                                                onChange={() => updateToolAccessMode(tid, ToolAccessMode.KEY_ONLY)}
                                                                className="w-5 h-5 text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'announcements' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-x divide-slate-200 h-full min-h-[600px]">
                        <div className="p-8 bg-white border-r border-slate-100 flex flex-col">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{editingId ? 'Modify Stream' : 'Deploy Broadcast'}</h3>
                                {editingId && (<button onClick={() => { setEditingId(null); setNewTitle(''); setNewContent(''); setNewType('info'); }} className="text-[9px] font-black text-rose-500 uppercase hover:underline tracking-widest">Discard Draft</button>)}
                            </div>
                            <form onSubmit={saveAnnouncement} className="space-y-6 flex-grow">
                                <div><label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Subject Line</label><input type="text" required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full rounded-xl border-slate-200 text-sm font-bold p-3 outline-none focus:ring-2 focus:ring-indigo-100" /></div>
                                <div><label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Severity Layer</label><select value={newType} onChange={e => setNewType(e.target.value as any)} className="w-full rounded-xl border-slate-200 text-sm font-bold p-3 outline-none"><option value="info">General System Information</option><option value="warning">System Warning Alert</option><option value="success">Resolution Notice</option><option value="error">Maintenance Protocol</option></select></div>
                                <div className="flex-grow flex flex-col"><label className="text-[9px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Payload Content</label><textarea required value={newContent} onChange={e => setNewContent(e.target.value)} className="w-full flex-grow rounded-xl border-slate-200 text-sm font-medium p-4 outline-none resize-none leading-relaxed" rows={8} /></div>
                                <button type="submit" className={`w-full text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all ${editingId ? 'bg-indigo-600' : 'bg-slate-900'}`}>{editingId ? 'Update & Push' : 'Initialize Broadcast'}</button>
                            </form>
                        </div>
                        <div className="lg:col-span-2 p-10 bg-slate-50/40 overflow-y-auto custom-scrollbar">
                            <div className="mb-10"><h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Transmission History</h3></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {announcements.map(a => (
                                    <div key={a.id} className={`group flex flex-col p-8 border-2 rounded-[2.5rem] bg-white transition-all shadow-sm relative ${a.is_active ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-100 opacity-90'}`}>
                                        {a.is_active && <div className="absolute -top-3 right-8 px-4 py-1 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg border-2 border-white">LIVE STREAMING</div>}
                                        <div className="flex justify-between items-start mb-6"><div className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border ${a.type === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-200' : (a.type === 'error' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200')}`}>{a.type}</div><div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => editAnnouncement(a)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button><button onClick={() => deleteAnnouncement(a.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></div>
                                        <h4 className="font-black text-sm uppercase text-slate-900 mb-2 leading-tight">{a.title}</h4>
                                        <p className="text-[11px] text-slate-500 mb-8 line-clamp-4 leading-relaxed font-medium flex-grow">{a.content}</p>
                                        <button onClick={() => activateAnnouncement(a.id)} className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 active:scale-[0.98] ${a.is_active ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white shadow-md'}`}>{a.is_active ? 'TERMINATE STREAM' : 'ACTIVATE BROADCAST'}</button>
                                    </div>
                                ))}
                                {announcements.length === 0 && <div className="col-span-full py-20 text-center opacity-40"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">No archived transmissions</p></div>}
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