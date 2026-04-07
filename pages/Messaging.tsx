import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, Message, Channel } from '../types';
import { 
    Send, 
    User, 
    Search, 
    MoreVertical, 
    Hash, 
    Clock, 
    Check, 
    CheckCheck,
    MessageCircle,
    Users,
    ArrowLeft,
    Trash2,
    Ban,
    ShieldCheck,
    X,
    Info,
    SearchX,
    Calendar,
    Settings,
    Plus,
    Paperclip,
    FileText,
    Lock,
    Globe,
    Download,
    Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const Messaging: React.FC = () => {
    const { user, profile, isAdmin } = useAuth();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
    const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [searchMessageQuery, setSearchMessageQuery] = useState('');
    const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
    const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
    const [isBlockingMe, setIsBlockingMe] = useState(false);
    const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
    const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);
    const [clearChatConfirmText, setClearChatConfirmText] = useState('');
    const [newChannelName, setNewChannelName] = useState('');
    const [newChannelDesc, setNewChannelDesc] = useState('');
    const [isNewChannelPrivate, setIsNewChannelPrivate] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editedDesc, setEditedDesc] = useState('');
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [editedNotes, setEditedNotes] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setIsEditingDesc(false);
        setIsEditingNotes(false);
    }, [selectedChannel, selectedUser]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Mark messages as read when selectedUser changes or new messages arrive
    useEffect(() => {
        if (!user?.id || !selectedUser) return;

        const markAsRead = async () => {
            const { error } = await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('sender_id', selectedUser.id)
                .eq('receiver_id', user.id)
                .eq('is_read', false);

            if (!error) {
                setUnreadCounts(prev => ({ ...prev, [selectedUser.id]: 0 }));
            }
        };

        markAsRead();
    }, [selectedUser, messages.length, user?.id]);

    useEffect(() => {
        const fetchUsers = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', user?.id)
                .order('last_seen', { ascending: false });

            if (!error && data) {
                setUsers(data);
            }
        };

        const fetchChannels = async () => {
            const { data, error } = await supabase
                .from('channels')
                .select('*')
                .order('created_at', { ascending: true });

            if (!error && data) {
                setChannels(data);
            }
        };

        const fetchUnreadCounts = async () => {
            if (!user?.id) return;
            const { data, error } = await supabase
                .from('messages')
                .select('sender_id')
                .eq('receiver_id', user.id)
                .eq('is_read', false);

            if (!error && data) {
                const counts: Record<string, number> = {};
                data.forEach(msg => {
                    counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
                });
                setUnreadCounts(counts);
            }
        };

        const fetchBlockedUsers = async () => {
            if (!user?.id) return;
            const { data, error } = await supabase
                .from('blocked_users')
                .select('blocked_id')
                .eq('blocker_id', user.id);

            if (!error && data) {
                setBlockedUsers(data.map(b => b.blocked_id));
            }
        };

        const init = async () => {
            setLoading(true);
            await Promise.all([fetchUsers(), fetchChannels(), fetchUnreadCounts(), fetchBlockedUsers()]);
            setLoading(false);
        };

        init();
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id || !selectedUser) {
            setIsBlockingMe(false);
            return;
        }

        const checkBlockingMe = async () => {
            const { data, error } = await supabase
                .from('blocked_users')
                .select('*')
                .eq('blocker_id', selectedUser.id)
                .eq('blocked_id', user.id)
                .single();

            setIsBlockingMe(!!data);
        };

        checkBlockingMe();
    }, [user?.id, selectedUser]);

    useEffect(() => {
        if (!user?.id) return;

        const fetchMessages = async () => {
            let query = supabase
                .from('messages')
                .select('*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*)');

            if (selectedChannel) {
                query = query.eq('channel_id', selectedChannel.id);
            } else if (selectedUser) {
                query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`);
            } else {
                query = query.is('receiver_id', null).is('channel_id', null);
            }

            const { data, error } = await query.order('created_at', { ascending: true });

            if (!error && data) {
                setMessages(data);
            }
        };

        fetchMessages();

        // Subscribe to new messages and presence
        const channel = supabase.channel('messaging_room', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        channel
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'messages',
                },
                async (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const msg = payload.new as Message;
                        
                        const isGlobal = !msg.receiver_id && !msg.channel_id && !selectedUser && !selectedChannel;
                        const isChannel = selectedChannel && msg.channel_id === selectedChannel.id;
                        const isDirect = selectedUser && (
                            (msg.sender_id === user.id && msg.receiver_id === selectedUser.id) ||
                            (msg.sender_id === selectedUser.id && msg.receiver_id === user.id)
                        );

                        if (isGlobal || isDirect || isChannel) {
                            const { data: senderData } = await supabase
                                .from('profiles')
                                .select('*')
                                .eq('id', msg.sender_id)
                                .single();
                            
                            setMessages(prev => {
                                if (prev.some(m => m.id === msg.id)) return prev;
                                return [...prev, { ...msg, sender: senderData }];
                            });
                        } else if (msg.receiver_id === user.id) {
                            // Increment unread count for background conversations
                            setUnreadCounts(prev => ({
                                ...prev,
                                [msg.sender_id]: (prev[msg.sender_id] || 0) + 1
                            }));
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedMsg = payload.new as Message;
                        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
                    }
                }
            )
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const online: Record<string, boolean> = {};
                Object.keys(state).forEach(key => {
                    online[key] = true;
                });
                setOnlineUsers(online);
            })
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                const { userId, isTyping, targetId } = payload;
                // Only show typing if it's for the current conversation
                const isForMe = targetId === user.id || (!targetId && !selectedUser);
                if (isForMe && userId !== user.id) {
                    setTypingUsers(prev => ({ ...prev, [userId]: isTyping }));
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        user_id: user.id,
                        online_at: new Date().toISOString(),
                    });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, selectedUser, selectedChannel]);

    const handleTyping = () => {
        if (!user?.id) return;
        
        supabase.channel('messaging_room').send({
            type: 'broadcast',
            event: 'typing',
            payload: { 
                userId: user.id, 
                isTyping: true, 
                targetId: selectedUser?.id || null 
            },
        });

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            supabase.channel('messaging_room').send({
                type: 'broadcast',
                event: 'typing',
                payload: { 
                    userId: user.id, 
                    isTyping: false, 
                    targetId: selectedUser?.id || null 
                },
            });
        }, 3000);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id) return;

        // Validate file type (XML, HTML, HTM)
        const allowedExtensions = ['xml', 'html', 'htm'];
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !allowedExtensions.includes(extension)) {
            alert('Only XML, HTML, and HTM files are allowed.');
            return;
        }

        setUploadingFile(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('chat-attachments')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('chat-attachments')
                .getPublicUrl(filePath);

            // Send message with file
            const { error: msgError } = await supabase
                .from('messages')
                .insert({
                    sender_id: user.id,
                    receiver_id: selectedChannel ? null : (selectedUser?.id || null),
                    channel_id: selectedChannel?.id || null,
                    content: `Sent a file: ${file.name}`,
                    file_url: publicUrl,
                    file_name: file.name
                });

            if (msgError) throw msgError;
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Failed to upload file.');
        } finally {
            setUploadingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const createChannel = async () => {
        if (!newChannelName.trim() || !user?.id) return;

        try {
            const { data: channelData, error: channelError } = await supabase
                .from('channels')
                .insert({
                    name: newChannelName.trim(),
                    description: newChannelDesc.trim(),
                    is_private: isNewChannelPrivate,
                    created_by: user.id
                })
                .select()
                .single();

            if (channelError) throw channelError;

            // Add creator as admin member
            const { error: memberError } = await supabase
                .from('channel_members')
                .insert({
                    channel_id: channelData.id,
                    user_id: user.id,
                    role: 'admin'
                });

            if (memberError) throw memberError;

            setChannels(prev => [...prev, channelData]);
            setIsCreateChannelOpen(false);
            setNewChannelName('');
            setNewChannelDesc('');
            setIsNewChannelPrivate(false);
            setSelectedChannel(channelData);
            setSelectedUser(null);
        } catch (error) {
            console.error('Error creating channel:', error);
            alert('Failed to create channel.');
        }
    };

    const handleDownload = async (url: string, fileName: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            window.open(url, '_blank');
        }
    };

    const handleUpdateDescription = async () => {
        if (!selectedChannel || !user?.id) return;
        
        try {
            const { error } = await supabase
                .from('channels')
                .update({ description: editedDesc.trim() })
                .eq('id', selectedChannel.id);

            if (error) throw error;

            setChannels(prev => prev.map(c => c.id === selectedChannel.id ? { ...c, description: editedDesc.trim() } : c));
            setSelectedChannel(prev => prev ? { ...prev, description: editedDesc.trim() } : null);
            setIsEditingDesc(false);
        } catch (error) {
            console.error('Error updating description:', error);
            alert('Failed to update description.');
        }
    };

    const handleUpdateNotes = async () => {
        if (!selectedChannel || !user?.id) return;
        
        try {
            const { error } = await supabase
                .from('channels')
                .update({ notes: editedNotes.trim() })
                .eq('id', selectedChannel.id);

            if (error) throw error;

            setChannels(prev => prev.map(c => c.id === selectedChannel.id ? { ...c, notes: editedNotes.trim() } : c));
            setSelectedChannel(prev => prev ? { ...prev, notes: editedNotes.trim() } : null);
            setIsEditingNotes(false);
        } catch (error) {
            console.error('Error updating notes:', error);
            alert('Failed to update notes.');
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user?.id || isBlockingMe) return;

        const messageData = {
            sender_id: user.id,
            receiver_id: selectedChannel ? null : (selectedUser?.id || null),
            channel_id: selectedChannel?.id || null,
            content: newMessage.trim(),
        };

        const { error } = await supabase.from('messages').insert([messageData]);

        if (!error) {
            setNewMessage('');
            // Clear typing status immediately
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            supabase.channel('messaging_room').send({
                type: 'broadcast',
                event: 'typing',
                payload: { 
                    userId: user.id, 
                    isTyping: false, 
                    targetId: selectedUser?.id || null 
                },
            });
        }
    };

    const handleClearChat = () => {
        setIsClearChatModalOpen(true);
        setClearChatConfirmText('');
    };

    const executeClearChat = async () => {
        if (!user?.id || clearChatConfirmText !== 'CONFIRM') return;
        
        let query = supabase.from('messages').delete();
        
        if (selectedUser) {
            query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`);
        } else {
            query = query.is('receiver_id', null);
        }

        const { error } = await query;
        if (!error) {
            setMessages([]);
            setIsOptionsMenuOpen(false);
            setIsClearChatModalOpen(false);
            setClearChatConfirmText('');
        }
    };

    const handleBlockUser = async () => {
        if (!user?.id || !selectedUser) return;

        const { error } = await supabase.from('blocked_users').insert({
            blocker_id: user.id,
            blocked_id: selectedUser.id
        });

        if (!error) {
            setBlockedUsers(prev => [...prev, selectedUser.id]);
            setIsOptionsMenuOpen(false);
        }
    };

    const handleUnblockUser = async () => {
        if (!user?.id || !selectedUser) return;

        const { error } = await supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', user.id)
            .eq('blocked_id', selectedUser.id);

        if (!error) {
            setBlockedUsers(prev => prev.filter(id => id !== selectedUser.id));
            setIsOptionsMenuOpen(false);
        }
    };

    const filteredMessages = messages.filter(msg => 
        msg.content.toLowerCase().includes(searchMessageQuery.toLowerCase())
    );

    const filteredUsers = users.filter(u => 
        (u.display_name?.toLowerCase() || u.email.toLowerCase()).includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Initializing Comms...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex bg-white overflow-hidden">
            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'w-80' : 'w-0'} border-r border-slate-100 flex flex-col transition-all duration-300 overflow-hidden bg-slate-50/50`}>
                <div className="p-6 border-b border-slate-100 bg-white">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Messages</h2>
                        <button className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all">
                            <MoreVertical size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-3 space-y-1 custom-scrollbar">
                    {/* Sticky Search Bar */}
                    <div className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md pb-2 -mx-3 px-3">
                        <div className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                            <Search className="text-slate-400 shrink-0" size={14} />
                            <input 
                                type="text" 
                                placeholder="Search users..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-grow bg-transparent text-xs font-medium outline-none placeholder:text-slate-400"
                            />
                        </div>
                    </div>
                    {/* Global Chat Option */}
                    <button 
                        onClick={() => {
                            setSelectedUser(null);
                            setSelectedChannel(null);
                            if (window.innerWidth < 768) setIsSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${(!selectedUser && !selectedChannel) ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-600'}`}
                    >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${(!selectedUser && !selectedChannel) ? 'bg-white/20' : 'bg-slate-200'}`}>
                            <Globe size={20} />
                        </div>
                        <div className="flex flex-col items-start flex-grow overflow-hidden">
                            <span className="text-sm font-black uppercase tracking-tight">Global Chat</span>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${(!selectedUser && !selectedChannel) ? 'text-white/60' : 'text-slate-400'}`}>Public Channel</span>
                            {(!selectedUser && !selectedChannel) && (
                                <span className="text-xs text-white/60 truncate w-full text-left mt-0.5">
                                    The official global communication channel.
                                </span>
                            )}
                        </div>
                    </button>

                    {/* Channels Section */}
                    <div className="pt-4 pb-2 px-3 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Channels</span>
                        {isAdmin && (
                            <button 
                                onClick={() => setIsCreateChannelOpen(true)}
                                className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-all"
                                title="Create Channel"
                            >
                                <Plus size={14} />
                            </button>
                        )}
                    </div>

                    {channels.map(channel => (
                        <button 
                            key={channel.id}
                            onClick={() => {
                                setSelectedChannel(channel);
                                setSelectedUser(null);
                                if (window.innerWidth < 768) setIsSidebarOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedChannel?.id === channel.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-600'}`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedChannel?.id === channel.id ? 'bg-white/20' : 'bg-slate-200'}`}>
                                {channel.is_private ? <Lock size={18} /> : <Hash size={18} />}
                            </div>
                            <div className="flex flex-col items-start overflow-hidden flex-grow">
                                <span className="text-sm font-black uppercase tracking-tight truncate w-full text-left">{channel.name}</span>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${selectedChannel?.id === channel.id ? 'text-white/60' : 'text-slate-400'}`}>
                                    {channel.is_private ? 'Private' : 'Public'}
                                </span>
                                {channel.description && (
                                    <span className={`text-xs truncate w-full text-left mt-0.5 ${selectedChannel?.id === channel.id ? 'text-white/70' : 'text-slate-500'}`}>
                                        {channel.description}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}

                    <div className="pt-4 pb-2 px-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Direct Messages</span>
                    </div>

                    {filteredUsers.map(u => (
                        <button 
                            key={u.id}
                            onClick={() => {
                                setSelectedUser(u);
                                setSelectedChannel(null);
                                if (window.innerWidth < 768) setIsSidebarOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedUser?.id === u.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-600'}`}
                        >
                            <div className="relative">
                                <div className={`w-10 h-10 rounded-xl overflow-hidden border-2 ${selectedUser?.id === u.id ? 'border-white/20' : 'border-white shadow-sm'}`}>
                                    {u.avatar_url ? (
                                        <img src={u.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 text-xs font-black">
                                            {u.display_name?.substring(0, 2) || u.email.substring(0, 2)}
                                        </div>
                                    )}
                                </div>
                                {onlineUsers[u.id] && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white"></div>
                                )}
                            </div>
                            <div className="flex flex-col items-start overflow-hidden flex-grow">
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-sm font-black uppercase tracking-tight truncate text-left">
                                        {u.display_name || u.email.split('@')[0]}
                                    </span>
                                    {unreadCounts[u.id] > 0 && (
                                        <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                            {unreadCounts[u.id]}
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest truncate w-full text-left ${selectedUser?.id === u.id ? 'text-white/60' : 'text-slate-400'}`}>
                                    {typingUsers[u.id] ? (
                                        <span className="animate-pulse flex items-center gap-1">
                                            <span className="w-1 h-1 bg-current rounded-full"></span>
                                            <span className="w-1 h-1 bg-current rounded-full"></span>
                                            <span className="w-1 h-1 bg-current rounded-full"></span>
                                        </span>
                                    ) : (u.role || 'Member')}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-grow flex flex-col relative bg-white overflow-hidden">
                {/* Chat Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 lg:hidden"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-indigo-600">
                                {selectedChannel ? (
                                    selectedChannel.is_private ? <Lock size={20} /> : <Hash size={20} />
                                ) : selectedUser ? (
                                    selectedUser.avatar_url ? (
                                        <img src={selectedUser.avatar_url} alt="" className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
                                    ) : (
                                        <User size={20} />
                                    )
                                ) : (
                                    <Globe size={20} />
                                )}
                            </div>
                            <div className="flex flex-col">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                    {selectedChannel ? selectedChannel.name : selectedUser ? (selectedUser.display_name || selectedUser.email.split('@')[0]) : 'Global Chat'}
                                </h3>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${selectedChannel ? (selectedChannel.is_private ? 'bg-indigo-500' : 'bg-indigo-500') : selectedUser ? (onlineUsers[selectedUser.id] ? 'bg-emerald-500' : 'bg-slate-300') : 'bg-indigo-500'}`}></div>
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                        {selectedChannel ? (selectedChannel.is_private ? 'Private Channel' : 'Public Channel') : selectedUser ? (onlineUsers[selectedUser.id] ? 'Online' : 'Offline') : 'Public Channel'}
                                        {selectedUser && typingUsers[selectedUser.id] && " • Typing..."}
                                    </span>
                                </div>
                                {selectedChannel?.description && (
                                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-1 max-w-md font-medium">
                                        {selectedChannel.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center">
                            <Search size={16} className="absolute left-3 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Search messages..." 
                                value={searchMessageQuery}
                                onChange={(e) => setSearchMessageQuery(e.target.value)}
                                className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all w-32 md:w-48 lg:w-64"
                            />
                            {searchMessageQuery && (
                                <button 
                                    onClick={() => setSearchMessageQuery('')}
                                    className="absolute right-2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button 
                            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                            className={`p-2 rounded-xl transition-all ${isDetailsOpen ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100 text-slate-400'}`}
                            title="User Details"
                        >
                            <Info size={18} />
                        </button>
                        <div className="relative">
                            <button 
                                onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)}
                                className={`p-2 rounded-xl transition-all ${isOptionsMenuOpen ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100 text-slate-400'}`}
                                title="More Options"
                            >
                                <MoreVertical size={18} />
                            </button>
                            
                            <AnimatePresence>
                                {isOptionsMenuOpen && (
                                    <>
                                        <motion.div 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            onClick={() => setIsOptionsMenuOpen(false)}
                                            className="fixed inset-0 z-20"
                                        />
                                        <motion.div 
                                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                            className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-30"
                                        >
                                            <button 
                                                onClick={handleClearChat}
                                                className="w-full flex items-center gap-3 p-3 text-left text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                                            >
                                                <Trash2 size={16} className="text-slate-400" />
                                                Clear Chat
                                            </button>
                                            {selectedUser && (
                                                blockedUsers.includes(selectedUser.id) ? (
                                                    <button 
                                                        onClick={handleUnblockUser}
                                                        className="w-full flex items-center gap-3 p-3 text-left text-sm font-bold text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                                    >
                                                        <ShieldCheck size={16} />
                                                        Unblock User
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={handleBlockUser}
                                                        className="w-full flex items-center gap-3 p-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                                    >
                                                        <Ban size={16} />
                                                        Block User
                                                    </button>
                                                )
                                            )}
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
                    {filteredMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-12">
                            <div className="w-20 h-20 bg-white rounded-[2.5rem] shadow-xl flex items-center justify-center mb-6 border border-slate-100">
                                {searchMessageQuery ? <SearchX size={32} className="text-slate-300" /> : <MessageCircle size={32} className="text-indigo-600" />}
                            </div>
                            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                                {searchMessageQuery ? 'No results found' : 'No messages yet'}
                            </h4>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2 max-w-[200px] leading-relaxed">
                                {searchMessageQuery ? `No messages matching "${searchMessageQuery}"` : 'Start the conversation by sending a message below.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {filteredMessages.map((msg, idx) => {
                                const isMe = msg.sender_id === user?.id;
                                // Show avatar on every message for consistency as requested
                                const showAvatar = true; 
                                
                                return (
                                    <div key={msg.id} className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                        <div className="w-8 h-8 rounded-lg bg-slate-200 flex-shrink-0 overflow-hidden border border-white shadow-sm">
                                            {isMe ? (
                                                profile?.avatar_url ? (
                                                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-400 uppercase">
                                                        {profile?.display_name?.substring(0, 2) || profile?.email?.substring(0, 2) || 'ME'}
                                                    </div>
                                                )
                                            ) : (
                                                msg.sender?.avatar_url ? (
                                                    <img src={msg.sender.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-400 uppercase">
                                                        {msg.sender?.display_name?.substring(0, 2) || msg.sender?.email?.substring(0, 2) || '??'}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                        <div className={`flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                                            {!isMe && (
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">
                                                    {msg.sender?.display_name || msg.sender?.email.split('@')[0]}
                                                </span>
                                            )}
                                            <div className={`px-4 py-3 rounded-2xl text-sm font-medium shadow-sm border ${
                                                isMe 
                                                ? 'bg-indigo-600 text-white border-indigo-500 rounded-br-none' 
                                                : 'bg-white text-slate-700 border-slate-100 rounded-bl-none'
                                            }`}>
                                                {msg.file_url ? (
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex items-center gap-3 p-2 bg-black/5 rounded-xl border border-black/10">
                                                            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                                                                <FileText size={20} />
                                                            </div>
                                                            <div className="flex flex-col overflow-hidden">
                                                                <span className="text-xs font-black uppercase tracking-tight truncate">{msg.file_name}</span>
                                                                <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Attachment</span>
                                                            </div>
                                                            <div className="ml-auto flex items-center gap-1">
                                                                <button 
                                                                    onClick={() => {
                                                                        const isHtml = msg.file_name?.toLowerCase().endsWith('.html') || msg.file_name?.toLowerCase().endsWith('.htm');
                                                                        if (isHtml) {
                                                                            window.open(`/#/view-html?url=${encodeURIComponent(msg.file_url!)}&name=${encodeURIComponent(msg.file_name!)}`, '_blank');
                                                                        } else {
                                                                            window.open(msg.file_url!, '_blank');
                                                                        }
                                                                    }}
                                                                    className={`p-2 hover:bg-black/5 rounded-lg transition-all ${isMe ? 'text-white/80 hover:text-white' : 'text-indigo-600'}`}
                                                                    title="View File"
                                                                >
                                                                    <Eye size={16} />
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDownload(msg.file_url!, msg.file_name || 'download')}
                                                                    className={`p-2 hover:bg-black/5 rounded-lg transition-all ${isMe ? 'text-white/80 hover:text-white' : 'text-indigo-600'}`}
                                                                    title="Download File"
                                                                >
                                                                    <Download size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {msg.content && !msg.content.startsWith('Sent a file:') && (
                                                            <div className={`mt-1 prose prose-sm max-w-none ${isMe ? 'prose-invert' : ''}`}>
                                                                <ReactMarkdown 
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{
                                                                        a: ({ node, ...props }) => (
                                                                            <a 
                                                                                {...props} 
                                                                                target="_blank" 
                                                                                rel="noopener noreferrer" 
                                                                                className={`${isMe ? 'text-white underline font-bold' : 'text-indigo-600 underline font-bold'} hover:opacity-80 transition-opacity`}
                                                                            />
                                                                        ),
                                                                        p: ({ node, ...props }) => <p {...props} className="m-0 leading-relaxed" />
                                                                    }}
                                                                >
                                                                    {msg.content}
                                                                </ReactMarkdown>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className={`prose prose-sm max-w-none ${isMe ? 'prose-invert' : ''}`}>
                                                        <ReactMarkdown 
                                                            remarkPlugins={[remarkGfm]}
                                                            components={{
                                                                a: ({ node, ...props }) => (
                                                                    <a 
                                                                        {...props} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        className={`${isMe ? 'text-white underline font-bold' : 'text-indigo-600 underline font-bold'} hover:opacity-80 transition-opacity`}
                                                                    />
                                                                ),
                                                                p: ({ node, ...props }) => <p {...props} className="m-0 leading-relaxed" />
                                                            }}
                                                        >
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`flex items-center gap-1.5 mt-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                                    {format(new Date(msg.created_at), 'HH:mm')}
                                                </span>
                                                {isMe && (
                                                    <div className="text-slate-400">
                                                        {msg.is_read ? <CheckCheck size={10} /> : <Check size={10} />}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {selectedUser && typingUsers[selectedUser.id] && (
                                <div className="flex items-end gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                        <div className="flex gap-1">
                                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"></span>
                                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                            <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-slate-100">
                    {isBlockingMe ? (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center">
                            <p className="text-xs font-black text-rose-600 uppercase tracking-widest">
                                You cannot send messages to this user.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(e); }} className="flex items-center gap-3 max-w-5xl mx-auto">
                            <div className="flex-grow relative flex items-center gap-2">
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    accept=".xml,.html,.htm"
                                />
                                <button 
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingFile}
                                    className={`p-2.5 rounded-xl transition-all ${uploadingFile ? 'bg-slate-50 text-slate-300' : 'hover:bg-indigo-50 text-indigo-600 active:scale-95'}`}
                                    title="Upload XML, HTML, or HTM file"
                                >
                                    {uploadingFile ? (
                                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <Paperclip size={20} />
                                    )}
                                </button>
                                <div className="flex-grow relative">
                                    <input 
                                        type="text" 
                                        placeholder={selectedUser ? `Message ${selectedUser.display_name || selectedUser.email.split('@')[0]}...` : selectedChannel ? `Message #${selectedChannel.name}...` : "Message global chat..."}
                                        value={newMessage}
                                        onChange={(e) => {
                                            setNewMessage(e.target.value);
                                            handleTyping();
                                        }}
                                        className="w-full pl-4 pr-12 py-3.5 bg-slate-100 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    </div>
                                </div>
                            </div>
                            <button 
                                type="submit"
                                disabled={!newMessage.trim() && !uploadingFile}
                                className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                            >
                                <Send size={20} />
                            </button>
                        </form>
                    )}
                </div>

                {/* User Details Side Panel */}
                <AnimatePresence>
                    {isDetailsOpen && (
                        <>
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsDetailsOpen(false)}
                                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
                            />
                            <motion.div 
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="absolute right-0 top-0 bottom-0 w-full max-w-[320px] bg-white shadow-2xl z-50 border-l border-slate-100 flex flex-col"
                            >
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Details</h3>
                                    <button 
                                        onClick={() => setIsDetailsOpen(false)}
                                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                
                                <div className="flex-grow overflow-y-auto p-8 flex flex-col items-center text-center">
                                    <div className="w-32 h-32 rounded-[2.5rem] bg-slate-100 mb-6 overflow-hidden border-4 border-white shadow-xl">
                                        {selectedUser ? (
                                            selectedUser.avatar_url ? (
                                                <img src={selectedUser.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-3xl font-black text-slate-300">
                                                    {selectedUser.display_name?.substring(0, 2) || selectedUser.email.substring(0, 2)}
                                                </div>
                                            )
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-3xl font-black text-indigo-200">
                                                <Hash size={48} />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">
                                        {selectedUser ? (selectedUser.display_name || selectedUser.email.split('@')[0]) : (selectedChannel?.name || 'Global Chat')}
                                    </h2>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                        {selectedUser ? (selectedUser.role || 'Member') : (selectedChannel ? (selectedChannel.is_private ? 'Private Channel' : 'Public Channel') : 'Public Channel')}
                                    </p>
                                    
                                    {!selectedUser && (
                                        <div className="w-full px-4 mb-8">
                                            {isEditingDesc ? (
                                                <div className="space-y-3">
                                                    <textarea 
                                                        value={editedDesc}
                                                        onChange={(e) => setEditedDesc(e.target.value)}
                                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[100px] resize-none"
                                                        placeholder="Add channel description or notes..."
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={handleUpdateDescription}
                                                            className="flex-grow py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-indigo-200"
                                                        >
                                                            Save Changes
                                                        </button>
                                                        <button 
                                                            onClick={() => setIsEditingDesc(false)}
                                                            className="px-4 py-2 bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-lg"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="group relative">
                                                    <p className="text-sm text-slate-600 leading-relaxed">
                                                        {selectedChannel?.description || 'The official global communication channel for the Production Toolkit.'}
                                                    </p>
                                                    {(isAdmin || selectedChannel?.created_by === user?.id) && (
                                                        <button 
                                                            onClick={() => {
                                                                setEditedDesc(selectedChannel?.description || '');
                                                                setIsEditingDesc(true);
                                                            }}
                                                            className="mt-3 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline opacity-0 group-hover:opacity-100 transition-all"
                                                        >
                                                            Edit Description
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    <div className="w-full space-y-6 text-left">
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Email Address</span>
                                            <p className="text-sm font-bold text-slate-600 truncate">
                                                {selectedUser ? selectedUser.email : 'system@production.toolkit'}
                                            </p>
                                        </div>
                                        
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</span>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${selectedUser ? (onlineUsers[selectedUser.id] ? 'bg-emerald-500' : 'bg-slate-300') : 'bg-indigo-500'}`}></div>
                                                <p className="text-sm font-bold text-slate-600">
                                                    {selectedUser ? (onlineUsers[selectedUser.id] ? 'Online Now' : 'Currently Offline') : 'Always Active'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Admin Notes Section */}
                                        {(isAdmin || selectedChannel?.created_by === user?.id) && !selectedUser && (
                                            <div className="pt-6 border-t border-slate-100 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Admin Notes</span>
                                                    {!isEditingNotes && (
                                                        <button 
                                                            onClick={() => {
                                                                setEditedNotes(selectedChannel?.notes || '');
                                                                setIsEditingNotes(true);
                                                            }}
                                                            className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                                                        >
                                                            Edit
                                                        </button>
                                                    )}
                                                </div>
                                                {isEditingNotes ? (
                                                    <div className="space-y-3">
                                                        <textarea 
                                                            value={editedNotes}
                                                            onChange={(e) => setEditedNotes(e.target.value)}
                                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[100px] resize-none"
                                                            placeholder="Add private admin notes..."
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <button 
                                                                onClick={handleUpdateNotes}
                                                                className="flex-grow py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-indigo-200"
                                                            >
                                                                Save Notes
                                                            </button>
                                                            <button 
                                                                onClick={() => setIsEditingNotes(false)}
                                                                className="px-4 py-2 bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-lg"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                                                        {selectedChannel?.notes || 'No admin notes added yet.'}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {selectedUser && (
                                            <div className="pt-6 border-t border-slate-100 space-y-3">
                                                {blockedUsers.includes(selectedUser.id) ? (
                                                    <button 
                                                        onClick={handleUnblockUser}
                                                        className="w-full flex items-center gap-3 p-4 bg-emerald-50 hover:bg-emerald-100 rounded-2xl text-sm font-bold text-emerald-600 transition-all"
                                                    >
                                                        <ShieldCheck size={18} />
                                                        Unblock User
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={handleBlockUser}
                                                        className="w-full flex items-center gap-3 p-4 bg-rose-50 hover:bg-rose-100 rounded-2xl text-sm font-bold text-rose-600 transition-all"
                                                    >
                                                        <Ban size={18} />
                                                        Block User
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="p-8 bg-slate-50 border-t border-slate-100">
                                    <div className="flex items-center gap-3 text-slate-400">
                                        <Calendar size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">
                                            Joined {selectedUser ? format(new Date(selectedUser.created_at || Date.now()), 'MMM yyyy') : 'Jan 2025'}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Create Channel Modal */}
                <AnimatePresence>
                    {isCreateChannelOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsCreateChannelOpen(false)}
                                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                            />
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
                            >
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white/20 rounded-xl">
                                            <Plus size={20} />
                                        </div>
                                        <h2 className="text-lg font-black uppercase tracking-tight">Create Channel</h2>
                                    </div>
                                    <button 
                                        onClick={() => setIsCreateChannelOpen(false)}
                                        className="p-2 hover:bg-white/20 rounded-xl transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Channel Name</label>
                                        <input 
                                            type="text"
                                            value={newChannelName}
                                            onChange={(e) => setNewChannelName(e.target.value)}
                                            placeholder="e.g. general-discussion"
                                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:border-indigo-500 focus:ring-0 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                                        <textarea 
                                            value={newChannelDesc}
                                            onChange={(e) => setNewChannelDesc(e.target.value)}
                                            placeholder="What's this channel about?"
                                            rows={3}
                                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:border-indigo-500 focus:ring-0 transition-all resize-none"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${isNewChannelPrivate ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                {isNewChannelPrivate ? <Lock size={18} /> : <Globe size={18} />}
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-slate-900 uppercase tracking-tight">Private Channel</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Only invited members can join</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setIsNewChannelPrivate(!isNewChannelPrivate)}
                                            className={`w-12 h-6 rounded-full transition-all relative ${isNewChannelPrivate ? 'bg-indigo-600' : 'bg-slate-200'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isNewChannelPrivate ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                                    <button 
                                        onClick={() => setIsCreateChannelOpen(false)}
                                        className="flex-1 px-6 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={createChannel}
                                        disabled={!newChannelName.trim()}
                                        className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                                    >
                                        Create
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
                {/* Clear Chat Confirmation Modal */}
                <AnimatePresence>
                    {isClearChatModalOpen && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsClearChatModalOpen(false)}
                                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                            />
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
                            >
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-rose-600 text-white">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white/20 rounded-xl">
                                            <Trash2 size={20} />
                                        </div>
                                        <h2 className="text-lg font-black uppercase tracking-tight">Clear Chat</h2>
                                    </div>
                                    <button 
                                        onClick={() => setIsClearChatModalOpen(false)}
                                        className="p-2 hover:bg-white/20 rounded-xl transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex gap-4">
                                        <div className="p-2 bg-rose-100 text-rose-600 rounded-xl h-fit">
                                            <Ban size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-rose-900 uppercase tracking-tight">Destructive Action</p>
                                            <p className="text-xs font-medium text-rose-600 leading-relaxed mt-1">
                                                This will permanently delete all messages in this conversation for you. This action cannot be undone.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                            Type <span className="text-rose-600">CONFIRM</span> to proceed
                                        </label>
                                        <input 
                                            type="text"
                                            value={clearChatConfirmText}
                                            onChange={(e) => setClearChatConfirmText(e.target.value)}
                                            placeholder="CONFIRM"
                                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black tracking-widest focus:border-rose-500 focus:ring-0 transition-all text-center"
                                        />
                                    </div>
                                </div>
                                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                                    <button 
                                        onClick={() => setIsClearChatModalOpen(false)}
                                        className="flex-1 px-6 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={executeClearChat}
                                        disabled={clearChatConfirmText !== 'CONFIRM'}
                                        className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-200 hover:bg-rose-700 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
                                    >
                                        Clear Chat
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Messaging;
