import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, ToolId } from '../types';
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

    if (diffMins < 5) {
        return (
            <span className="text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> 
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
    const [activeTab, setActiveTab] = useState<'users' | 'keys' | 'announcements' | 'config'>('users');
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);
    const { freeToolsData, refreshFreeTools } = useAuth();

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

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean; title: string; message: string; confirmLabel?: string; type: 'primary' | 'danger'; onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'primary', onConfirm: () => {} });

    const getToolName = (tid: string) => {
        switch (tid) {
            case ToolId.XML_RENUMBER: return "XML Reference Normalizer";
            case ToolId.CREDIT_GENERATOR: return "CRediT Author Tagging";
            case ToolId.UNCITED_CLEANER: return "Uncited Ref Cleaner";
            case ToolId.OTHER_REF_SCANNER: return "Other-Ref Scanner";
            case ToolId.REFERENCE_GEN: return "Reference Updater";
            case ToolId.REF_DUPE_CHECK: return "Duplicate Ref Remover";
            case ToolId.HIGHLIGHTS_GEN: return "Article Highlights Gen";
            case ToolId.QUICK_DIFF: return "Quick Text Diff";
            case ToolId.TAG_CLEANER: return "XML Tag Cleaner";
            case ToolId.TABLE_FIXER: return "XML Table Fixer";
            case ToolId.VIEW_SYNC: return "View Synchronizer";
            case 'universal': return "Universal Access";
            default: return tid;
        }
    };

    const fetchUsers = useCallback(async (isSilent = false) => {
        if (!isSilent) setIsLoading(true);
        
        // CIRCUIT BREAKER: Hard loading override after 6s
        const breaker = setTimeout(() => {
            setIsLoading(false);
            if (!isSilent) setToast({ msg: "Database slow to respond. Displaying cached/partial data.", type: "warn" });
        }, 6000);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('last_seen', { ascending: false, nullsFirst: false });
            
            if (error) throw error;
            if (data) {
                setUsers(data);
                const durMap: Record<string, string> = {};
                data.forEach(u => {
                    if (!selectedDurations[u.id]) durMap[u.id] = 'sub_1y';
                });
                if (Object.keys(durMap).length > 0) {
                    setSelectedDurations(prev => ({ ...prev, ...durMap }));
                }
            }
        } catch (error: any) {
            if (!isSilent) setToast({ msg: 'System check failed: ' + error.message, type: 'error' });
        } finally { 
            clearTimeout(breaker);
            setIsLoading(false); 
        }
    }, [selectedDurations]);

    const fetchAccessKeys = useCallback(async () => {
        setIsLoading(true);
        const breaker = setTimeout(() => setIsLoading(false), 6000);
        try {
            const { data, error } = await supabase
                .from('access_keys')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setAccessKeys(data || []);
        } catch (error: any) {
            setToast({ msg: 'Key matrix fetch failed', type: 'error' });
        } finally { 
            clearTimeout(breaker);
            setIsLoading(false); 
        }
    }, []);

    const handleRevokeKey = async (keyRecord: AccessKeyRecord) => {
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('access_keys')
                .update({ is_used: false, user_id: null, device_id: null, used_at: null })
                .eq('id', keyRecord.id);

            if (error) throw error;
            setAccessKeys(prev => prev.map(k => k.id === keyRecord.id ? { ...k, is_used: false, user_id: undefined, device_id: undefined, used_at: undefined } : k));
            setToast({ msg: 'Key access reset.', type: 'success' });
        } catch (err: any) {
            setToast({ msg: 'Revocation blocked', type: 'error' });
        } finally { setIsLoading(false); }
    };

    const handleDeleteKey = (keyId: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Access Key',
            message: 'Are you sure? This license will be purged.',
            confirmLabel: 'Delete',
            type: 'danger',
            onConfirm: async () => {
                setIsLoading(true);
                try {
                    const { error } = await supabase.from('access_keys').delete().eq('id', keyId);
                    if (error) throw error;
                    setAccessKeys(prev => prev.filter(k => k.id !== keyId));
                    setToast({ msg: 'Key purged', type: 'success' });
                } catch (err: any) {
                    setToast({ msg: 'Deletion failed', type: 'error' });
                } finally { setIsLoading(false); }
            }
        });
    };

    const fetchAnnouncements = useCallback(async () => {
        setIsLoading(true);
        const breaker = setTimeout(() => setIsLoading(false), 6000);
        try {
            const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setAnnouncements(data || []);
        } catch (error: any) {
            setToast({ msg: 'Broadcast fetch failed', type: 'error' });
        } finally { 
            clearTimeout(breaker);
            setIsLoading(false); 
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        else if (activeTab === 'announcements') fetchAnnouncements();
        else if (activeTab === 'keys') {
            fetchUsers(true).then(() => fetchAccessKeys());
        }
    }, [activeTab, fetchUsers, fetchAnnouncements, fetchAccessKeys]);

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
        } catch (err: any) {
            setToast({ msg: 'Operation failed', type: 'error' });
        } finally { setIsLoading(false); }
    };

    const toggleFreeTool = async (tid: string) => {
        setIsLoading(true);
        const nextData = { ...freeToolsData };
        if (nextData[tid]) delete nextData[tid];
        else {
            const expiry = new Date(); expiry.setDate(expiry.getDate() + 7);
            nextData[tid] = expiry.toISOString();
        }
        try {
            const { error } = await supabase.from('system_settings').update({ free_tools_data: nextData, updated_at: new Date().toISOString() }).eq('id', 'global');
            if (error) throw error;
            await refreshFreeTools();
            setToast({ msg: `System protocol updated`, type: 'success' });
        } catch (err) {
            setToast({ msg: 'System update failed', type: 'error' });
        } finally { setIsLoading(false); }
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
        } catch (err: any) {
            setToast({ msg: 'Generation failed', type: 'error' });
        } finally { setIsLoading(false); }
    };

    const saveAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (editingId) {
                const { error } = await supabase.from('announcements').update({ title: newTitle, content: newContent, type: newType }).eq('id', editingId);
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
        } catch (err: any) {
            setToast({ msg: 'Broadcast failed to save', type: 'error' });
        } finally { setIsLoading(false); }
    };

    const deleteAnnouncement = (id: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Delete Broadcast',
            message: 'Are you sure?',
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
                } finally { setIsLoading(false); }
            }
        });
    };

    // Added missing editAnnouncement function to fix reference error
    const editAnnouncement = (a: Announcement) => {
        setEditingId(a.id);
        setNewTitle(a.title);
        setNewContent(a.content);
        setNewType(a.type);
    };

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
        } catch (err: any) {
            setToast({ msg: 'State update failed', type: 'error' });
        } finally { setIsLoading(false); }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <ConfirmationModal isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} confirmLabel={confirmConfig.confirmLabel} type={confirmConfig.type} onConfirm={() => { confirmConfig.onConfirm(); setConfirmConfig(prev => ({ ...prev, isOpen: false })); }} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight uppercase">Admin Console</h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Control Layer Access</p>
                </div>
                <div className="bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            {users.filter(u => u.last_seen && Math.abs(Date.now() - new Date(u.last_seen).getTime()) < 300000).length} Nodes Active
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl mb-6 w-full max-w-2xl overflow-x-auto">
                <button onClick={() => setActiveTab('users')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Personnel</button>
                <button onClick={() => setActiveTab('keys')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'keys' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500'}`}>Key Matrix</button>
                <button onClick={() => setActiveTab('config')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'config' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-500'}`}>Global Config</button>
                <button onClick={() => setActiveTab('announcements')} className={`flex-1 py-2.5 px-6 text-sm font-bold rounded-lg transition-all ${activeTab === 'announcements' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500'}`}>Broadcasts</button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] relative">
                {isLoading && <LoadingOverlay message="Synchronizing..." color="slate" />}
                
                {activeTab === 'users' && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50 font-black text-slate-400 uppercase tracking-widest text-[10px]">
                                <tr><th className="px-6 py-4 text-left">Identity</th><th className="px-6 py-4 text-left">Role</th><th className="px-6 py-4 text-left">Status</th><th className="px-6 py-4 text-center">Activity</th><th className="px-6 py-4 text-left">Control</th></tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                                {users.filter(u => u.email.includes(search)).map(u => (
                                    <tr key={u.id} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-4"><div className="flex flex-col"><span className="text-sm font-bold text-slate-900">{u.email}</span><span className="text-[10px] font-mono text-slate-400 uppercase">{u.id.slice(0, 13)}...</span></div></td>
                                        <td className="px-6 py-4 text-xs font-black uppercase text-slate-400">{u.role}</td>
                                        <td className="px-6 py-4"><span className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest border ${u.is_subscribed ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{u.is_subscribed ? 'Authorized' : 'Dormant'}</span></td>
                                        <td className="px-6 py-4 text-center"><div className="flex flex-col items-center"><span className="text-[11px] font-bold text-slate-600">{formatLastSeen(u.last_seen)}</span>{u.subscription_end && <span className="text-[9px] text-slate-300 font-black uppercase mt-1">Exp: {new Date(u.subscription_end).toLocaleDateString()}</span>}</div></td>
                                        <td className="px-6 py-4"><div className="flex items-center gap-3">{!u.is_subscribed && (<select value={selectedDurations[u.id] || 'sub_1y'} onChange={(e) => setSelectedDurations(prev => ({...prev, [u.id]: e.target.value}))} className="text-[10px] font-black uppercase py-1.5 rounded-lg border-slate-200 bg-white"><optgroup label="Term">{DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup></select>)}<button onClick={() => toggleSubscription(u)} className={`text-[10px] font-black px-4 py-2 rounded-xl border border-slate-200 uppercase transition-all shadow-sm ${u.is_subscribed ? 'text-rose-600 border-rose-100 bg-rose-50 hover:bg-rose-600 hover:text-white' : 'text-indigo-600 hover:bg-indigo-600 hover:text-white'}`}>{u.is_subscribed ? 'Kill Session' : 'Grant Entry'}</button></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'keys' && (
                    <div className="p-8 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end bg-slate-50 p-6 rounded-2xl border border-slate-100">
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Module</label><select value={keyTool} onChange={e => setKeyTool(e.target.value)} className="w-full rounded-xl border-slate-200 text-sm font-bold bg-white"><option value="universal">Universal</option><option value={ToolId.XML_RENUMBER}>XML Normalizer</option><option value={ToolId.CREDIT_GENERATOR}>CRediT Tagging</option></select></div>
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Batch Qty</label><input type="number" min="1" max="50" value={keyQty} onChange={e => setKeyQty(parseInt(e.target.value))} className="w-full rounded-xl border-slate-200 text-sm font-bold bg-white" /></div>
                            <button onClick={generateKeys} className="bg-slate-900 text-white font-black py-2.5 rounded-xl uppercase text-xs tracking-widest shadow-lg shadow-slate-200 transition-all">Generate</button>
                        </div>
                        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100"><thead className="bg-slate-50 font-black text-slate-400 uppercase text-[10px]"><tr><th className="px-6 py-4 text-left">Key</th><th className="px-6 py-4 text-left">Module</th><th className="px-6 py-4 text-left">Status</th><th className="px-6 py-4 text-left">Owner</th><th className="px-6 py-4 text-left">Hardware</th><th className="px-6 py-4 text-left">Mgmt</th></tr></thead><tbody className="divide-y divide-slate-100">
                            {accessKeys.map(k => (
                                <tr key={k.id} className="hover:bg-slate-50/50"><td className="px-6 py-4 font-mono font-black text-indigo-600 text-sm">{k.key}</td><td className="px-6 py-4 text-[11px] font-bold text-slate-600">{getToolName(k.tool)}</td><td className="px-6 py-4"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${k.is_used ? 'text-rose-500 bg-rose-50 border-rose-100' : 'text-emerald-500 bg-emerald-50 border-emerald-100'}`}>{k.is_used ? 'LOCKED' : 'AVAIL'}</span></td><td className="px-6 py-4 text-[11px] font-bold text-slate-600">{users.find(u => u.id === k.user_id)?.email || (k.user_id ? 'Unknown' : 'Unbound')}</td><td className="px-6 py-4 font-mono text-[9px] text-slate-400">{k.device_id || '---'}</td><td className="px-6 py-4"><div className="flex gap-2">{k.is_used && <button onClick={() => handleRevokeKey(k)} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded" title="Reset"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>}<button onClick={() => handleDeleteKey(k.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded" title="Kill"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></td></tr>
                            ))}
                        </tbody></table></div>
                    </div>
                )}

                {activeTab === 'config' && (
                    <div className="p-10 space-y-10">
                        <div><h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Free Access Windows</h3><p className="text-sm text-slate-500 mb-8">Selected modules temporarily bypass subscription guards globally.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.values(ToolId).filter(id => id !== 'dashboard' && id !== 'docs').map(tid => {
                                    const expiry = freeToolsData[tid]; const isFree = !!expiry && new Date(expiry) > new Date();
                                    return (<div key={tid} onClick={() => toggleFreeTool(tid)} className={`p-6 rounded-[2rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${isFree ? 'border-emerald-500 bg-emerald-50 shadow-lg' : 'border-slate-100 hover:border-slate-200'}`}><div className="flex flex-col"><span className={`text-sm font-black uppercase ${isFree ? 'text-emerald-700' : 'text-slate-700'}`}>{getToolName(tid)}</span>{isFree ? (<span className="text-[9px] font-bold text-emerald-600 mt-1 uppercase">Ends: {new Date(expiry).toLocaleDateString()}</span>) : (<span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Gated</span>)}</div><div className={`w-12 h-6 rounded-full relative transition-colors ${isFree ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isFree ? 'left-7' : 'left-1'}`}></div></div></div>);
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'announcements' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-x divide-slate-200 h-full min-h-[600px]">
                        <div className="p-8 bg-white"><div className="flex justify-between items-center mb-6"><h3 className="text-xs font-black text-slate-400 uppercase">{editingId ? 'Modify Broadcast' : 'Broadcaster'}</h3>{editingId && (<button onClick={() => { setEditingId(null); setNewTitle(''); setNewContent(''); setNewType('info'); }} className="text-[10px] font-bold text-indigo-600 uppercase hover:underline">Draft New</button>)}</div><form onSubmit={saveAnnouncement} className="space-y-6"><div><label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Subject</label><input type="text" required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full rounded-xl border-slate-200 text-sm font-bold shadow-sm" placeholder="Subject..." /></div><div><label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Type</label><select value={newType} onChange={e => setNewType(e.target.value as any)} className="w-full rounded-xl border-slate-200 text-sm font-bold shadow-sm"><option value="info">System Info</option><option value="warning">Urgent</option><option value="success">Fixed</option><option value="error">Critical</option></select></div><div><label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Body</label><textarea required value={newContent} onChange={e => setNewContent(e.target.value)} rows={5} className="w-full rounded-xl border-slate-200 text-sm font-medium shadow-sm" placeholder="Content..." /></div><button type="submit" className={`w-full text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95 ${editingId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900 hover:bg-slate-800'}`}>{editingId ? 'Update' : 'Broadcast'}</button></form></div>
                        <div className="lg:col-span-2 p-8 bg-slate-50/30 overflow-y-auto custom-scrollbar"><div className="flex items-center justify-between mb-8"><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">History</h3></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {announcements.map(a => (
                                <div key={a.id} className={`group flex flex-col p-6 border-2 rounded-[2.5rem] bg-white transition-all hover:shadow-xl ${a.is_active ? 'border-emerald-500 shadow-lg' : 'border-slate-100'}`}><div className="flex justify-between items-start mb-4"><div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${a.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{a.type}</div><div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => editAnnouncement(a)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button><button onClick={() => deleteAnnouncement(a.id)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></div><h4 className="font-black text-sm uppercase text-slate-800 mb-2">{a.title}</h4><p className="text-xs text-slate-500 mb-6 line-clamp-3 leading-relaxed flex-grow">{a.content}</p><button onClick={() => activateAnnouncement(a.id)} className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${a.is_active ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>{a.is_active ? 'Stop Live' : 'Go Live'}</button></div>
                            ))}
                        </div></div>
                    </div>
                )}
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AdminDashboard;