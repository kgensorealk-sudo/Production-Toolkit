import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import LoadingOverlay from '../components/LoadingOverlay';
import Toast from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';

const AdminDashboard: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
    const [showSetup, setShowSetup] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            const fetchedUsers = data || [];
            setUsers(fetchedUsers);

            // If we only found 0 or 1 user (ourselves), likely RLS is blocking access
            if (fetchedUsers.length <= 1) {
                setShowSetup(true);
            }
        } catch (error: any) {
            setToast({ msg: 'Failed to fetch users: ' + error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const updateSubscription = async (userId: string, monthsToAdd: number) => {
        const now = new Date();
        const endDate = new Date();
        endDate.setMonth(now.getMonth() + monthsToAdd);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    subscription_start: now.toISOString(),
                    subscription_end: endDate.toISOString(),
                    is_subscribed: false 
                })
                .eq('id', userId);

            if (error) throw error;
            setToast({ msg: 'Subscription updated successfully', type: 'success' });
            fetchUsers();
        } catch (error: any) {
            setToast({ msg: 'Update failed: ' + error.message, type: 'error' });
        }
    };

    const revokeAccess = async (userId: string) => {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const { error } = await supabase
                .from('profiles')
                .update({
                    is_subscribed: false,
                    subscription_end: yesterday.toISOString()
                })
                .eq('id', userId);

            if (error) throw error;
            setToast({ msg: 'Access revoked', type: 'success' });
            fetchUsers();
        } catch (error: any) {
            setToast({ msg: 'Revocation failed: ' + error.message, type: 'error' });
        }
    };

    const extendTrial = async (userId: string) => {
        try {
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);

            const { error } = await supabase
                .from('profiles')
                .update({
                    trial_end: nextWeek.toISOString()
                })
                .eq('id', userId);

            if (error) throw error;
            setToast({ msg: 'Trial extended by 7 days', type: 'success' });
            fetchUsers();
        } catch (error: any) {
            setToast({ msg: 'Extension failed: ' + error.message, type: 'error' });
        }
    };

    const getUserStatus = (u: UserProfile) => {
        const now = new Date();
        const subEnd = u.subscription_end ? new Date(u.subscription_end) : null;
        const trialEnd = u.trial_end ? new Date(u.trial_end) : null;

        if (u.role === 'admin') return { label: 'ADMIN', color: 'bg-purple-100 text-purple-700' };
        if (u.is_subscribed === true) return { label: 'LIFETIME', color: 'bg-indigo-100 text-indigo-700' };
        
        if (subEnd && subEnd > now) {
            const days = Math.ceil((subEnd.getTime() - now.getTime()) / (1000 * 3600 * 24));
            return { label: `PRO (${days}d)`, color: 'bg-emerald-100 text-emerald-700' };
        }

        if (trialEnd && trialEnd > now) {
            const days = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 3600 * 24));
            return { label: `TRIAL (${days}d)`, color: 'bg-amber-100 text-amber-700' };
        }

        return { label: 'EXPIRED', color: 'bg-slate-100 text-slate-500' };
    };

    const filteredUsers = users.filter(u => 
        (u.email || '').toLowerCase().includes(search.toLowerCase()) || 
        u.id.includes(search)
    );

    const stats = {
        total: users.length,
        active: users.filter(u => {
            const s = getUserStatus(u);
            return s.label.includes('PRO') || s.label.includes('LIFETIME') || s.label.includes('ADMIN');
        }).length,
        trials: users.filter(u => getUserStatus(u).label.includes('TRIAL')).length
    };

    const setupSql = `
-- Run this in the Supabase SQL Editor to fix permissions

-- 1. Create table if it doesn't exist
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  role text default 'user',
  is_subscribed boolean default false,
  subscription_start timestamptz,
  subscription_end timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  created_at timestamptz default now()
);

-- 2. Enable Row Level Security
alter table profiles enable row level security;

-- 3. Allow users to see their own profile
create policy "Users can see own profile" on profiles
  for select using (auth.uid() = id);

-- 4. Allow admins to see ALL profiles
create policy "Admins can see all profiles" on profiles
  for select using (
    (select role from profiles where id = auth.uid()) = 'admin'
  );

-- 5. Allow admins to update profiles (grant subs)
create policy "Admins can update profiles" on profiles
  for update using (
    (select role from profiles where id = auth.uid()) = 'admin'
  );
  
-- 6. Allow users to insert their own profile on signup
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);
`.trim();

    const copySql = () => {
        navigator.clipboard.writeText(setupSql).then(() => setToast({msg: 'SQL copied to clipboard!', type: 'success'}));
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
            <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 animate-fade-in">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin Console</h1>
                    <p className="text-slate-500 mt-1">Manage user subscriptions and access rights.</p>
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={() => setShowSetup(!showSetup)}
                        className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm"
                    >
                        {showSetup ? 'Hide Setup Guide' : 'Database Setup'}
                    </button>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center min-w-[100px]">
                        <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Users</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center min-w-[100px]">
                        <span className="text-2xl font-bold text-emerald-600">{stats.active}</span>
                        <span className="text-xs font-bold text-emerald-600/70 uppercase tracking-wider">Active</span>
                    </div>
                </div>
            </div>

            {showSetup && (
                <div className="mb-8 bg-slate-800 rounded-2xl p-6 text-slate-300 shadow-xl border border-slate-700 animate-slide-up">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-white text-lg font-bold flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                Database Configuration Required
                            </h3>
                            <p className="text-sm mt-1 max-w-2xl">
                                If you cannot see other users below, Supabase Row Level Security (RLS) is likely blocking access. 
                                Run the SQL below in the <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noreferrer" className="text-blue-400 underline hover:text-blue-300">Supabase SQL Editor</a> to fix permissions.
                            </p>
                        </div>
                        <button onClick={copySql} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors">
                            Copy SQL
                        </button>
                    </div>
                    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto font-mono text-xs leading-relaxed border border-slate-700 relative group">
                        <pre>{setupSql}</pre>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-slide-up">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50">
                    <div className="relative w-full sm:max-w-xs">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input 
                            type="text" 
                            className="pl-10 block w-full rounded-lg border-slate-300 bg-white sm:text-sm focus:ring-indigo-500 focus:border-indigo-500 py-2 shadow-sm" 
                            placeholder="Search users..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchUsers} className="text-slate-500 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-slate-100">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>

                <div className="overflow-x-auto min-h-[400px] relative">
                    {loading && <LoadingOverlay message="Loading Profiles..." color="indigo" />}
                    
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Valid Until</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {filteredUsers.length > 0 ? filteredUsers.map((u) => {
                                const status = getUserStatus(u);
                                return (
                                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                                    {u.email?.charAt(0).toUpperCase() || '?'}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-slate-900">{u.email || 'Unknown Email'}</div>
                                                    <div className="text-xs text-slate-500 font-mono">{u.id.substring(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 capitalize">
                                            {u.role}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${status.color}`}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                            {u.subscription_end ? new Date(u.subscription_end).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => updateSubscription(u.id, 1)}
                                                    className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded transition-colors"
                                                    title="Grant 1 Month Access"
                                                >
                                                    +1 Mo
                                                </button>
                                                <button 
                                                    onClick={() => updateSubscription(u.id, 12)}
                                                    className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded transition-colors"
                                                    title="Grant 1 Year Access"
                                                >
                                                    +1 Yr
                                                </button>
                                                <button 
                                                    onClick={() => extendTrial(u.id)}
                                                    className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded transition-colors"
                                                    title="Extend Trial by 7 Days"
                                                >
                                                    Trial+
                                                </button>
                                                <button 
                                                    onClick={() => revokeAccess(u.id)}
                                                    className="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded transition-colors"
                                                    title="Revoke Access Immediately"
                                                >
                                                    Revoke
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                                        No users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default AdminDashboard;