
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';
import Toast from '../components/Toast';
import LoadingOverlay from '../components/LoadingOverlay';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'warning' | 'info' | 'success' | 'error';
    is_active: boolean;
    created_at: string;
}

const SQL_SCRIPT = `-- PRODUCTION TOOLKIT: DATABASE REPAIR & SETUP
-- Execute this in Supabase SQL Editor to fix permissions and tables.

-- ==========================================
-- 1. HELPER FUNCTION (Fixes Admin Permissions)
-- ==========================================
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 
    from public.profiles 
    where id = auth.uid() 
    and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- ==========================================
-- 2. PROFILES TABLE
-- ==========================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'user',
  is_subscribed boolean default false,
  subscription_end timestamp with time zone,
  trial_start timestamp with time zone,
  trial_end timestamp with time zone
);

alter table profiles enable row level security;

drop policy if exists "Users view own profile" on profiles;
create policy "Users view own profile" on profiles for select using ( auth.uid() = id );

drop policy if exists "Users update own profile" on profiles;
create policy "Users update own profile" on profiles for update using ( auth.uid() = id );

drop policy if exists "Admins view all profiles" on profiles;
create policy "Admins view all profiles" on profiles for select using ( is_admin() );

drop policy if exists "Admins update all profiles" on profiles;
create policy "Admins update all profiles" on profiles for update using ( is_admin() );

-- ==========================================
-- 3. ANNOUNCEMENTS TABLE
-- ==========================================
create table if not exists public.announcements (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null,
  type text default 'info',
  is_active boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table announcements enable row level security;

-- Public Access
drop policy if exists "Public read active announcements" on announcements;
create policy "Public read active announcements" 
on announcements for select 
using ( is_active = true );

-- Admin Access (Explicit Policies)
drop policy if exists "Admins manage announcements" on announcements;
drop policy if exists "Admins select announcements" on announcements;
drop policy if exists "Admins insert announcements" on announcements;
drop policy if exists "Admins update announcements" on announcements;
drop policy if exists "Admins delete announcements" on announcements;

create policy "Admins select announcements" on announcements for select using ( is_admin() );
create policy "Admins insert announcements" on announcements for insert with check ( is_admin() );
create policy "Admins update announcements" on announcements for update using ( is_admin() );
create policy "Admins delete announcements" on announcements for delete using ( is_admin() );

-- ==========================================
-- 4. ACCESS KEYS
-- ==========================================
create table if not exists public.access_keys (
  id uuid default gen_random_uuid() primary key,
  key text unique not null,
  tool text not null,
  is_used boolean default false,
  used_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table access_keys enable row level security;

drop policy if exists "Read keys" on access_keys;
create policy "Read keys" on access_keys for select using (true);

drop policy if exists "Admins manage keys" on access_keys;
create policy "Admins manage keys" on access_keys for all using (is_admin());

-- ==========================================
-- 5. TRIGGER FOR NEW USERS
-- ==========================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, is_subscribed, trial_start, trial_end, subscription_end)
  values (
    new.id,
    new.email,
    true,
    now(),
    now() + interval '20 days',
    now() + interval '20 days'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================
-- 6. SEED & ADMIN SETUP
-- ==========================================
insert into announcements (title, content, type, is_active)
select 'Welcome', 'System operational.', 'success', true
where not exists (select 1 from announcements);

-- RUN THIS MANUALLY AFTER SIGNING UP:
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL';
`;

const AdminDashboard: React.FC = () => {
    // Tab State
    const [activeTab, setActiveTab] = useState<'users' | 'announcements' | 'guide'>('users');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success'|'warn'|'error'} | null>(null);

    // User Management State
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [search, setSearch] = useState('');
    const [duration, setDuration] = useState('1y'); 

    // Announcement State
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newType, setNewType] = useState<'info' | 'warning' | 'success' | 'error'>('info');

    // Helper to safely get error message
    const getErrMsg = (error: any) => error?.message || 'Unknown error occurred';

    // --- User Fetching ---
    const fetchUsers = async () => {
        setLoading(true);
        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timed out')), 15000)
            );
            const dataPromise = supabase.from('profiles').select('*').order('email', { ascending: true });
            const result = await Promise.race([dataPromise, timeoutPromise]) as any;
            const { data, error } = result;

            if (error) throw error;
            setUsers(data || []);
        } catch (error: any) {
            console.error('Error fetching users:', error);
            setToast({ msg: 'Failed to load users: ' + getErrMsg(error), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // --- Announcement Fetching ---
    const fetchAnnouncements = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setAnnouncements(data || []);
        } catch (error: any) {
            console.error('Error fetching announcements:', error);
            // Check for missing table error specifically
            if (error?.code === '42P01') {
                setToast({ msg: 'Announcements table missing. Check Guide tab.', type: 'warn' });
            } else {
                setToast({ msg: 'Failed to load announcements: ' + getErrMsg(error), type: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        else if (activeTab === 'announcements') fetchAnnouncements();
    }, [activeTab]);

    // --- User Logic ---
    const calculateExpiry = (type: string) => {
        const date = new Date();
        if (type === '1min') date.setMinutes(date.getMinutes() + 1); 
        else if (type === 'trial') date.setDate(date.getDate() + 20); 
        else if (type === '1m') date.setMonth(date.getMonth() + 1);
        else if (type === '3m') date.setMonth(date.getMonth() + 3);
        else if (type === '6m') date.setMonth(date.getMonth() + 6);
        else if (type === '1y') date.setFullYear(date.getFullYear() + 1);
        else if (type === 'lifetime') date.setFullYear(date.getFullYear() + 99);
        return date.toISOString();
    };

    const toggleSubscription = async (user: UserProfile) => {
        const newVal = !user.is_subscribed;
        const updates: any = { is_subscribed: newVal };
        
        if (newVal) {
            const expiryDate = calculateExpiry(duration);
            updates.subscription_end = expiryDate;
            
            // If explicitly trial or test, set trial markers
            if (duration === 'trial' || duration === '1min') {
                updates.trial_start = new Date().toISOString();
                updates.trial_end = expiryDate;
            } else {
                // For real plans, clear trial data to differentiate in UI
                updates.trial_start = null;
                updates.trial_end = null;
            }
        } else {
            updates.subscription_end = null;
        }

        const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
        if (error) {
            setToast({ msg: 'Update failed: ' + getErrMsg(error), type: 'error' });
        } else {
            setUsers(users.map(u => u.id === user.id ? { ...u, ...updates } : u));
            setToast({ msg: `User ${newVal ? 'activated' : 'deactivated'}`, type: 'success' });
        }
    };

    const toggleAdmin = async (user: UserProfile) => {
        const newRole = user.role === 'admin' ? 'user' : 'admin';
        const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', user.id);
        if (error) {
            setToast({ msg: 'Role update failed: ' + getErrMsg(error), type: 'error' });
        } else {
            setUsers(users.map(u => u.id === user.id ? { ...u, role: newRole } : u));
            setToast({ msg: `Role updated to ${newRole}`, type: 'success' });
        }
    };

    // --- Announcement Logic ---
    const resetForm = () => {
        setNewTitle('');
        setNewContent('');
        setNewType('info');
        setEditingId(null);
    };

    const startEdit = (ann: Announcement) => {
        setNewTitle(ann.title);
        setNewContent(ann.content);
        setNewType(ann.type);
        setEditingId(ann.id);
    };

    const saveAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle || !newContent) return;

        setLoading(true);
        try {
            if (editingId) {
                // UPDATE Existing
                const { error } = await supabase.from('announcements')
                    .update({
                        title: newTitle,
                        content: newContent,
                        type: newType
                    })
                    .eq('id', editingId);

                if (error) throw error;
                
                // Optimistic Update
                setAnnouncements(prev => prev.map(a => 
                    a.id === editingId ? { ...a, title: newTitle, content: newContent, type: newType } : a
                ));
                setToast({ msg: 'Template updated successfully', type: 'success' });
            } else {
                // CREATE New
                const { data, error } = await supabase.from('announcements').insert([{
                    title: newTitle,
                    content: newContent,
                    type: newType,
                    is_active: false // Created inactive by default
                }]).select();

                if (error) throw error;
                
                if (data) {
                    setAnnouncements(prev => [data[0], ...prev]);
                } else {
                    fetchAnnouncements();
                }
                setToast({ msg: 'Template created', type: 'success' });
            }
            
            resetForm();
        } catch (error: any) {
            setToast({ msg: 'Save failed: ' + getErrMsg(error), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const deleteAnnouncement = async (id: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;
        
        try {
            // Select returned rows to ensure deletion actually occurred
            const { data, error } = await supabase.from('announcements').delete().eq('id', id).select();
            
            if (error) throw error;
            
            // If RLS blocks deletion, no error is thrown but data is empty
            if (!data || data.length === 0) {
                throw new Error('Permission denied. Please run the SQL Repair script.');
            }
            
            setAnnouncements(announcements.filter(a => a.id !== id));
            if (editingId === id) resetForm();
            setToast({ msg: 'Deleted', type: 'success' });
        } catch (error: any) {
            setToast({ msg: 'Delete failed: ' + getErrMsg(error), type: 'error' });
        }
    };

    const activateAnnouncement = async (id: string) => {
        setLoading(true);
        try {
            // 1. Deactivate all
            await supabase.from('announcements').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000'); 
            
            // 2. Activate target
            const { error } = await supabase.from('announcements').update({ is_active: true }).eq('id', id);
            
            if (error) throw error;
            
            setAnnouncements(announcements.map(a => ({
                ...a,
                is_active: a.id === id
            })));
            setToast({ msg: 'Announcement Live!', type: 'success' });
        } catch (error: any) {
            setToast({ msg: 'Activation failed: ' + getErrMsg(error), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const deactivateAll = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.from('announcements').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');
            if (error) throw error;
            setAnnouncements(announcements.map(a => ({ ...a, is_active: false })));
            setToast({ msg: 'All announcements disabled', type: 'success' });
        } catch (error: any) {
            setToast({ msg: 'Deactivation failed: ' + getErrMsg(error), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const copySql = () => {
        navigator.clipboard.writeText(SQL_SCRIPT);
        setToast({ msg: 'SQL Copied to Clipboard', type: 'success' });
    };

    const filteredUsers = users.filter(u => 
        u.email.toLowerCase().includes(search.toLowerCase()) || 
        u.id.includes(search)
    );

    const stats = {
        total: users.length,
        active: users.filter(u => u.is_subscribed).length,
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 animate-fade-in">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin Console</h1>
                    <p className="text-slate-500 mt-1">System management and configurations.</p>
                </div>
                
                {/* Stats / Actions */}
                <div className="flex gap-4">
                    <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center min-w-[100px]">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Users</span>
                        <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
                    </div>
                    {activeTab === 'announcements' && (
                        <button onClick={deactivateAll} className="bg-white hover:bg-rose-50 px-4 py-2 rounded-xl border border-slate-200 hover:border-rose-200 shadow-sm flex flex-col items-center min-w-[100px] text-rose-600 transition-colors">
                            <span className="text-xs font-bold uppercase tracking-wider">Emergency</span>
                            <span className="text-sm font-bold mt-1">Stop All</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl mb-6 w-full max-w-xl">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                        activeTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    Users
                </button>
                <button
                    onClick={() => setActiveTab('announcements')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                        activeTab === 'announcements' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    Announcements
                </button>
                <button
                    onClick={() => setActiveTab('guide')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                        activeTab === 'guide' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    Developer Guide
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px] animate-slide-up relative">
                {loading && <LoadingOverlay message="Processing..." color="slate" />}
                
                {/* USERS TAB */}
                {activeTab === 'users' && (
                    <>
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="relative flex-grow w-full sm:max-w-xs">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                                <input 
                                    type="text" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search users..."
                                    className="pl-9 w-full rounded-lg border-slate-200 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                    <span className="text-xs font-bold text-slate-500 uppercase">Grant:</span>
                                    <select 
                                        value={duration} 
                                        onChange={(e) => setDuration(e.target.value)}
                                        className="text-sm font-semibold text-indigo-600 bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
                                    >
                                        <option value="1min">Test: 1 Min</option>
                                        <option value="trial">Trial (20 Days)</option>
                                        <option value="1m">1 Month</option>
                                        <option value="1y">1 Year</option>
                                    </select>
                                </div>
                                <button onClick={fetchUsers} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-all">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {filteredUsers.map(u => {
                                        const isExpired = u.subscription_end && new Date(u.subscription_end) < new Date();
                                        const isVisuallyActive = u.is_subscribed && !isExpired;
                                        return (
                                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs uppercase mr-3">
                                                        {u.email ? u.email.substring(0,2) : '??'}
                                                    </div>
                                                    <div className="text-sm font-medium text-slate-900">{u.email}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span onClick={() => toggleAdmin(u)} className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer border ${u.role === 'admin' ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {isVisuallyActive ? (
                                                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Active</span>
                                                ) : (
                                                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-500 border border-slate-200">Inactive</span>
                                                )}
                                                {u.subscription_end && <div className="text-[10px] text-slate-400 mt-1">{new Date(u.subscription_end).toLocaleDateString()}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <button onClick={() => toggleSubscription(u)} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${u.is_subscribed ? 'text-rose-600 border-rose-200 hover:bg-rose-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>
                                                    {u.is_subscribed ? 'Revoke' : 'Grant'}
                                                </button>
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* ANNOUNCEMENTS TAB */}
                {activeTab === 'announcements' && (
                    <div className="flex flex-col h-full">
                        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 h-full">
                            {/* Create/Edit Form */}
                            <div className="p-6 bg-slate-50 lg:col-span-1">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                        {editingId ? 'Edit Template' : 'Create Template'}
                                    </h3>
                                    {editingId && (
                                        <button onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-800 underline">
                                            Cancel
                                        </button>
                                    )}
                                </div>
                                <form onSubmit={saveAnnouncement} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
                                        <input 
                                            type="text" 
                                            required
                                            value={newTitle}
                                            onChange={(e) => setNewTitle(e.target.value)}
                                            className="w-full rounded-lg border-slate-200 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            placeholder="System Maintenance"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
                                        <select 
                                            value={newType} 
                                            onChange={(e) => setNewType(e.target.value as any)}
                                            className="w-full rounded-lg border-slate-200 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                        >
                                            <option value="info">Info (Blue)</option>
                                            <option value="warning">Warning (Orange)</option>
                                            <option value="error">Error (Red)</option>
                                            <option value="success">Success (Green)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1">Message Content</label>
                                        <textarea 
                                            required
                                            value={newContent}
                                            onChange={(e) => setNewContent(e.target.value)}
                                            rows={6}
                                            className="w-full rounded-lg border-slate-200 text-sm focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                            placeholder="We are updating the system..."
                                        />
                                    </div>
                                    <button 
                                        type="submit" 
                                        className={`w-full text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors text-sm ${
                                            editingId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
                                        }`}
                                    >
                                        {editingId ? 'Update Template' : 'Save Template'}
                                    </button>
                                </form>
                            </div>

                            {/* List */}
                            <div className="lg:col-span-2 flex flex-col max-h-[600px]">
                                <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center sticky top-0 z-10">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Saved Templates</h3>
                                    <button onClick={fetchAnnouncements} className="text-slate-400 hover:text-indigo-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                </div>
                                <div className="overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-50/30 flex-grow">
                                    {announcements.length === 0 && <p className="text-center text-slate-400 text-sm mt-10">No templates found.</p>}
                                    {announcements.map(ann => (
                                        <div key={ann.id} className={`bg-white border rounded-xl p-4 transition-all ${
                                            editingId === ann.id ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-md' : 
                                            ann.is_active ? 'border-emerald-400 ring-1 ring-emerald-400 shadow-md' : 'border-slate-200 hover:border-slate-300 shadow-sm'
                                        }`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${
                                                        ann.type === 'warning' ? 'bg-amber-500' :
                                                        ann.type === 'error' ? 'bg-rose-500' :
                                                        ann.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                                                    }`}></span>
                                                    <h4 className="font-bold text-slate-800 text-sm">{ann.title}</h4>
                                                    {ann.is_active && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Active</span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {!ann.is_active && (
                                                        <button 
                                                            onClick={() => activateAnnouncement(ann.id)}
                                                            className="text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded transition-colors"
                                                        >
                                                            Go Live
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => startEdit(ann)}
                                                        className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition-colors"
                                                        title="Edit"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                    </button>
                                                    <button 
                                                        onClick={() => deleteAnnouncement(ann.id)}
                                                        className="text-slate-400 hover:text-rose-500 p-1.5 hover:bg-rose-50 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 rounded border border-slate-100">{ann.content}</p>
                                            <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
                                                <span className="uppercase">{ann.type}</span>
                                                <span>{new Date(ann.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* GUIDE TAB */}
                {activeTab === 'guide' && (
                    <div className="flex flex-col h-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Database Setup Guide</h3>
                                <p className="text-slate-500 text-sm">
                                    1. Go to your Supabase Project &rarr; SQL Editor.<br/>
                                    2. Paste the script below and run it to initialize tables, policies, and triggers.<br/>
                                    3. <b>Important:</b> After running, sign up in the app, then manually run the final update command to make yourself an admin.
                                </p>
                            </div>
                            <button onClick={copySql} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                Copy SQL
                            </button>
                        </div>
                        <div className="flex-grow bg-slate-900 rounded-xl overflow-hidden relative">
                            <textarea 
                                readOnly
                                value={SQL_SCRIPT}
                                className="w-full h-full bg-transparent text-slate-300 font-mono text-xs p-4 resize-none focus:outline-none"
                            />
                        </div>
                    </div>
                )}
            </div>
            
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AdminDashboard;
