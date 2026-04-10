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
    Eye,
    Smile,
    Pin,
    Edit2,
    Reply,
    ExternalLink,
    Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { LinkPreview as LinkPreviewType } from '../types';

const LinkPreview: React.FC<{ url: string, data?: LinkPreviewType | null }> = ({ url, data }) => {
    if (data) {
        return (
            <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-2 flex flex-col bg-slate-50 rounded-xl border border-slate-100 overflow-hidden hover:bg-slate-100 transition-all group max-w-sm"
            >
                {data.image && (
                    <div className="h-32 overflow-hidden border-b border-slate-100">
                        <img src={data.image} alt={data.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                )}
                <div className="p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{new URL(url).hostname}</p>
                    <h5 className="text-xs font-black text-slate-900 truncate mt-1">{data.title}</h5>
                    <p className="text-[10px] text-slate-500 line-clamp-2 mt-1">{data.description}</p>
                </div>
            </a>
        );
    }

    const isImage = /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
    
    if (isImage) {
        return (
            <div className="mt-2 rounded-xl overflow-hidden border border-slate-100 max-w-sm">
                <img src={url} alt="Preview" className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
            </div>
        );
    }

    return (
        <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-all group max-w-sm"
        >
            <div className="p-2 bg-white rounded-lg text-slate-400 group-hover:text-indigo-600 transition-all">
                <ExternalLink size={16} />
            </div>
            <div className="flex-grow overflow-hidden">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{new URL(url).hostname}</p>
                <p className="text-xs font-bold text-slate-600 truncate">{url}</p>
            </div>
        </a>
    );
};

const Messaging: React.FC = () => {
    const { user, profile, isAdmin, updateProfile } = useAuth();
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
    const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});
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
    const [readReceipts, setReadReceipts] = useState<Record<string, string>>({});
    const [isReadReceiptsLoading, setIsReadReceiptsLoading] = useState(false);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [editedNotes, setEditedNotes] = useState('');
    const [channelMembers, setChannelMembers] = useState<UserProfile[]>([]);
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [selectedThreadParent, setSelectedThreadParent] = useState<Message | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [threadMessage, setThreadMessage] = useState('');
    const [threadMessages, setThreadMessages] = useState<Message[]>([]);
    const [activeTab, setActiveTab] = useState<'details' | 'files' | 'pinned'>('details');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
    const [mentionSearch, setMentionSearch] = useState('');
    const [showMentions, setShowMentions] = useState(false);
    const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const mentionRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setIsEditingDesc(false);
        setIsEditingNotes(false);
        setIsAddingMember(false);
        setMemberSearchQuery('');
        setSelectedThreadParent(null);
        setEditingMessageId(null);
        setActiveTab('details');
        setActiveReactionPicker(null);
    }, [selectedChannel, selectedUser]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
            if (mentionRef.current && !mentionRef.current.contains(event.target as Node)) {
                setShowMentions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Mark messages as read when selectedUser changes or new messages arrive
    useEffect(() => {
        if (!user?.id) return;

        const markAsRead = async () => {
            try {
                if (selectedUser) {
                    const { error } = await supabase
                        .from('messages')
                        .update({ is_read: true })
                        .eq('sender_id', selectedUser.id)
                        .eq('receiver_id', user.id)
                        .eq('is_read', false);

                    if (!error) {
                        setUnreadCounts(prev => ({ ...prev, [selectedUser.id]: 0 }));
                    }
                } else if (selectedChannel) {
                    const latestMsg = messages.filter(m => m.sender_id !== user.id).pop();
                    const timestamp = latestMsg ? latestMsg.created_at : new Date().toISOString();
                    
                    await supabase
                        .from('channel_members')
                        .update({ last_read_at: timestamp })
                        .eq('channel_id', selectedChannel.id)
                        .eq('user_id', user.id);
                } else {
                    // Global chat
                    const latestMsg = messages.filter(m => m.sender_id !== user.id).pop();
                    const timestamp = latestMsg ? latestMsg.created_at : new Date().toISOString();

                    await updateProfile({ last_global_read_at: timestamp });
                }
            } catch (err) {
                console.error('Error marking as read:', err);
            }
        };

        markAsRead();
    }, [selectedUser, selectedChannel, messages.length, user?.id]);

    // Fetch read receipts
    useEffect(() => {
        if (!user?.id) return;

        const fetchReadReceipts = async () => {
            setIsReadReceiptsLoading(true);
            try {
                if (selectedChannel) {
                    const { data, error } = await supabase
                        .from('channel_members')
                        .select('user_id, last_read_at')
                        .eq('channel_id', selectedChannel.id);
                    
                    if (!error && data) {
                        const receipts: Record<string, string> = {};
                        data.forEach(m => {
                            if (m.last_read_at) receipts[m.user_id] = m.last_read_at;
                        });
                        setReadReceipts(receipts);
                    }
                } else if (!selectedUser) {
                    // Global chat
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, last_global_read_at');
                    
                    if (!error && data) {
                        const receipts: Record<string, string> = {};
                        data.forEach(p => {
                            if (p.last_global_read_at) receipts[p.id] = p.last_global_read_at;
                        });
                        setReadReceipts(receipts);
                    }
                } else {
                    // Direct message - handled via is_read on messages
                    setReadReceipts({});
                }
            } catch (err) {
                console.error('Error fetching read receipts:', err);
            } finally {
                setIsReadReceiptsLoading(false);
            }
        };

        fetchReadReceipts();

        // Subscribe to read receipt changes
        const channel = supabase.channel('read_receipts_sync');
        
        if (selectedChannel) {
            channel.on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'channel_members',
                    filter: `channel_id=eq.${selectedChannel.id}`
                },
                (payload) => {
                    const { user_id, last_read_at } = payload.new;
                    setReadReceipts(prev => ({ ...prev, [user_id]: last_read_at }));
                }
            ).subscribe();
        } else if (!selectedUser) {
            channel.on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles'
                },
                (payload) => {
                    const { id, last_global_read_at } = payload.new;
                    if (last_global_read_at) {
                        setReadReceipts(prev => ({ ...prev, [id]: last_global_read_at }));
                    }
                }
            ).subscribe();
        }

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedChannel, selectedUser, user?.id]);

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
            if (!user?.id) return;

            // Fetch all channels the user is a member of
            const { data: memberships } = await supabase
                .from('channel_members')
                .select('channel_id')
                .eq('user_id', user.id);
            
            const memberChannelIds = memberships?.map(m => m.channel_id) || [];

            // Fetch public channels OR channels user is a member of
            let query = supabase
                .from('channels')
                .select('*');
            
            if (memberChannelIds.length > 0) {
                query = query.or(`is_private.eq.false,id.in.(${memberChannelIds.join(',')})`);
            } else {
                query = query.eq('is_private', false);
            }

            const { data, error } = await query.order('created_at', { ascending: true });

            if (!error && data) {
                setChannels(data);
            }
        };

        const fetchUnreadCounts = async () => {
            if (!user?.id || !profile) return;
            
            const myName = profile.display_name || profile.email.split('@')[0];
            const mentionRegex = new RegExp(`@${myName}\\b|@Channel\\b`, 'i');

            // Fetch DM unreads
            const { data: dmData } = await supabase
                .from('messages')
                .select('sender_id, content')
                .eq('receiver_id', user.id)
                .eq('is_read', false);

            const counts: Record<string, number> = {};
            const mentions: Record<string, number> = {};

            if (dmData) {
                dmData.forEach(msg => {
                    counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
                    if (msg.content && mentionRegex.test(msg.content)) {
                        mentions[msg.sender_id] = (mentions[msg.sender_id] || 0) + 1;
                    }
                });
            }

            // Fetch Channel unreads
            const { data: memberships } = await supabase
                .from('channel_members')
                .select('channel_id, last_read_at')
                .eq('user_id', user.id);

            if (memberships) {
                for (const mem of memberships) {
                    const lastRead = mem.last_read_at || '1970-01-01T00:00:00Z';
                    const { data: chanMsgs } = await supabase
                        .from('messages')
                        .select('content')
                        .eq('channel_id', mem.channel_id)
                        .gt('created_at', lastRead)
                        .neq('sender_id', user.id);
                    
                    if (chanMsgs) {
                        counts[mem.channel_id] = chanMsgs.length;
                        const mCount = chanMsgs.filter(m => m.content && mentionRegex.test(m.content)).length;
                        if (mCount > 0) {
                            mentions[mem.channel_id] = mCount;
                        }
                    }
                }
            }

            // Global chat unreads
            const lastGlobalRead = profile.last_global_read_at || '1970-01-01T00:00:00Z';
            const { data: globalMsgs } = await supabase
                .from('messages')
                .select('content')
                .is('receiver_id', null)
                .is('channel_id', null)
                .gt('created_at', lastGlobalRead)
                .neq('sender_id', user.id);
            
            if (globalMsgs) {
                counts['global'] = globalMsgs.length;
                const mCount = globalMsgs.filter(m => m.content && mentionRegex.test(m.content)).length;
                if (mCount > 0) {
                    mentions['global'] = mCount;
                }
            }

            setUnreadCounts(counts);
            setMentionCounts(mentions);
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
                .select('*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*), reactions:message_reactions(*, user:profiles!user_id(*))');

            if (selectedChannel) {
                query = query.eq('channel_id', selectedChannel.id).is('parent_id', null);
            } else if (selectedUser) {
                query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`).is('parent_id', null);
            } else {
                query = query.is('receiver_id', null).is('channel_id', null).is('parent_id', null);
            }

            const { data, error } = await query.order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching messages:', error);
                return;
            }
            
            if (data) {
                setMessages(data);
            }
        };

        const fetchChannelMembers = async () => {
            if (!selectedChannel) {
                setChannelMembers([]);
                return;
            }

            const { data, error } = await supabase
                .from('channel_members')
                .select('profiles(*)')
                .eq('channel_id', selectedChannel.id);

            if (!error && data) {
                setChannelMembers(data.map((m: any) => m.profiles));
            }
        };

        fetchMessages();
        fetchChannelMembers();

        const fetchThreadMessages = async () => {
            if (!selectedThreadParent) {
                setThreadMessages([]);
                return;
            }

            const { data, error } = await supabase
                .from('messages')
                .select('*, sender:profiles!sender_id(*), reactions:message_reactions(*, user:profiles!user_id(*))')
                .eq('parent_id', selectedThreadParent.id)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching thread messages:', error);
                return;
            }

            if (data) {
                setThreadMessages(data);
            }
        };

        if (selectedThreadParent) {
            fetchThreadMessages();
        }

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

                        if ((isGlobal || isDirect || isChannel) && !msg.parent_id) {
                            const { data: senderData } = await supabase
                                .from('profiles')
                                .select('*')
                                .eq('id', msg.sender_id)
                                .single();
                            
                            setMessages(prev => {
                                if (prev.some(m => m.id === msg.id)) return prev;
                                return [...prev, { ...msg, sender: senderData }];
                            });
                        } else if (msg.parent_id === selectedThreadParent?.id) {
                            const { data: senderData } = await supabase
                                .from('profiles')
                                .select('*')
                                .eq('id', msg.sender_id)
                                .single();
                            
                            setThreadMessages(prev => {
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
                        if (selectedThreadParent?.id === updatedMsg.id) {
                            setSelectedThreadParent(prev => prev ? { ...prev, ...updatedMsg } : null);
                        }
                        setThreadMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'message_reactions',
                },
                async (payload) => {
                    // Refetch messages to get updated reactions (simplest way for now)
                    // Or we could manually update the state
                    fetchMessages();
                    if (selectedThreadParent) {
                        const { data: threadData } = await supabase
                            .from('messages')
                            .select('*, sender:profiles!sender_id(*), reactions:message_reactions(*, user:profiles!user_id(*))')
                            .eq('parent_id', selectedThreadParent.id)
                            .order('created_at', { ascending: true });
                        if (threadData) setThreadMessages(threadData);
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
    }, [user?.id, selectedUser, selectedChannel, selectedThreadParent?.id]);

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
        const files = e.target.files;
        if (!files || files.length === 0 || !user?.id) return;

        setUploadingFile(true);
        let successCount = 0;
        let failCount = 0;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                // Validate file type (XML, HTML, HTM, Images, PDFs)
                const allowedExtensions = ['xml', 'html', 'htm', 'png', 'jpg', 'jpeg', 'gif', 'pdf', 'docx', 'txt'];
                const extension = file.name.split('.').pop()?.toLowerCase();
                
                if (!extension || !allowedExtensions.includes(extension)) {
                    console.warn(`Skipping file ${file.name}: Unsupported type.`);
                    failCount++;
                    continue;
                }

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
                    successCount++;
                } catch (err) {
                    console.error(`Error uploading ${file.name}:`, err);
                    failCount++;
                }
            }

            if (failCount > 0) {
                alert(`Uploaded ${successCount} files. ${failCount} files failed.`);
            }
        } catch (error) {
            console.error('Error in multiple file upload:', error);
            alert('An error occurred during file upload.');
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

    const handleTogglePrivacy = async () => {
        if (!selectedChannel || !user?.id) return;
        
        const newPrivacy = !selectedChannel.is_private;
        try {
            const { error } = await supabase
                .from('channels')
                .update({ is_private: newPrivacy })
                .eq('id', selectedChannel.id);

            if (error) throw error;

            setChannels(prev => prev.map(c => c.id === selectedChannel.id ? { ...c, is_private: newPrivacy } : c));
            setSelectedChannel(prev => prev ? { ...prev, is_private: newPrivacy } : null);
        } catch (error) {
            console.error('Error toggling privacy:', error);
            alert('Failed to update channel privacy.');
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

    const handleAddMember = async (targetUser: UserProfile) => {
        if (!selectedChannel || !user?.id) return;

        try {
            const { error } = await supabase
                .from('channel_members')
                .insert({
                    channel_id: selectedChannel.id,
                    user_id: targetUser.id,
                    role: 'member'
                });

            if (error) {
                if (error.code === '23505') {
                    alert('User is already a member of this channel.');
                } else {
                    throw error;
                }
                return;
            }

            setChannelMembers(prev => [...prev, targetUser]);
            setMemberSearchQuery('');
            setIsAddingMember(false);
        } catch (error) {
            console.error('Error adding member:', error);
            alert('Failed to add member.');
        }
    };

    const handleEditMessage = async (messageId: string, newContent: string) => {
        if (!user?.id) return;
        try {
            const { error } = await supabase
                .from('messages')
                .update({ 
                    content: newContent,
                    is_edited: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', messageId);

            if (error) throw error;

            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, is_edited: true } : m));
            setEditingMessageId(null);
        } catch (error) {
            console.error('Error editing message:', error);
            alert('Failed to edit message.');
        }
    };

    const handleTogglePin = async (message: Message) => {
        if (!user?.id) return;
        const newPinnedStatus = !message.is_pinned;
        try {
            const { error } = await supabase
                .from('messages')
                .update({ is_pinned: newPinnedStatus })
                .eq('id', message.id);

            if (error) throw error;

            setMessages(prev => prev.map(m => m.id === message.id ? { ...m, is_pinned: newPinnedStatus } : m));
        } catch (error) {
            console.error('Error toggling pin:', error);
            alert('Failed to update pin status.');
        }
    };

    const handleReaction = async (messageId: string, emoji: string) => {
        if (!user?.id) return;

        try {
            // Check if user already reacted with this emoji
            const { data: existing } = await supabase
                .from('message_reactions')
                .select('*')
                .eq('message_id', messageId)
                .eq('user_id', user.id)
                .eq('emoji', emoji)
                .single();

            if (existing) {
                // Remove reaction
                const { error } = await supabase
                    .from('message_reactions')
                    .delete()
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                // Add reaction
                const { error } = await supabase
                    .from('message_reactions')
                    .insert({
                        message_id: messageId,
                        user_id: user.id,
                        emoji
                    });
                if (error) throw error;
            }
            // Real-time subscription will handle the UI update or we can manually refetch
        } catch (error) {
            console.error('Error handling reaction:', error);
        }
    };

    const handleRemoveMember = async (targetUserId: string) => {
        if (!selectedChannel || !user?.id) return;
        if (targetUserId === selectedChannel.created_by) {
            alert('Cannot remove the channel creator.');
            return;
        }

        try {
            const { error } = await supabase
                .from('channel_members')
                .delete()
                .eq('channel_id', selectedChannel.id)
                .eq('user_id', targetUserId);

            if (error) throw error;

            setChannelMembers(prev => prev.filter(m => m.id !== targetUserId));
        } catch (error) {
            console.error('Error removing member:', error);
            alert('Failed to remove member.');
        }
    };

    const handleSendMessage = async (e: React.FormEvent, parentId: string | null = null) => {
        e.preventDefault();
        const content = parentId ? threadMessage.trim() : newMessage.trim();
        if (!content || !user?.id || isBlockingMe) return;

        const messageData = {
            sender_id: user.id,
            receiver_id: selectedChannel ? null : (selectedUser?.id || null),
            channel_id: selectedChannel?.id || null,
            parent_id: parentId || null,
            content: content,
        };

        const { error } = await supabase.from('messages').insert([messageData]);

        if (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message.');
            return;
        }

        if (parentId) {
            setThreadMessage('');
        } else {
            setNewMessage('');
        }
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
    };

    const handleClearChat = () => {
        if (!selectedUser && !selectedChannel) {
            alert('Global chat cannot be cleared. You can only clear direct messages or channel history.');
            return;
        }
        setIsClearChatModalOpen(true);
        setClearChatConfirmText('');
    };

    const handleDeleteMessage = async (messageId: string) => {
        try {
            const { error } = await supabase
                .from('messages')
                .delete()
                .eq('id', messageId)
                .eq('sender_id', user?.id); // Security: Only allow deleting own messages

            if (error) throw error;

            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (error) {
            console.error('Error deleting message:', error);
            alert('Failed to delete message.');
        }
    };

    const executeClearChat = async () => {
        if (!user?.id || clearChatConfirmText !== 'CONFIRM') return;
        
        let query = supabase.from('messages').delete();
        
        if (selectedUser) {
            query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`);
        } else if (selectedChannel) {
            query = query.eq('channel_id', selectedChannel.id);
        } else {
            // This should not be reachable due to handleClearChat check, but for safety:
            alert('Global chat cannot be cleared.');
            return;
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

    const getSeenBy = (message: any) => {
        if (selectedUser) {
            // For Direct Messages, if I sent it and it's read, the recipient has seen it
            if (message.sender_id === user?.id && message.is_read) {
                return [selectedUser];
            }
            return [];
        }

        if (!readReceipts) return [];
        return Object.entries(readReceipts)
            .filter(([uid, timestamp]) => uid !== message.sender_id && timestamp >= message.created_at)
            .map(([uid]) => users.find(u => u.id === uid))
            .filter(Boolean) as UserProfile[];
    };

    const handleMentionSelect = (option: any) => {
        const name = option.type === 'channel' ? 'Channel' : (option.display_name || option.email.split('@')[0]);
        const before = newMessage.substring(0, mentionTriggerIndex);
        const after = newMessage.substring(mentionTriggerIndex + mentionSearch.length + 1);
        setNewMessage(`${before}@${name} ${after}`);
        setShowMentions(false);
    };

    const mentionOptions = [
        ...(selectedChannel ? [{ id: 'channel', display_name: 'Channel', type: 'channel' }] : []),
        ...users.map(u => ({ ...u, type: 'user' }))
    ].filter(opt => {
        const search = (opt.display_name || (opt as UserProfile).email || '').toLowerCase();
        return search.includes(mentionSearch.toLowerCase());
    }).slice(0, 8);

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
                            <div className="flex items-center justify-between w-full">
                                <span className="text-sm font-black uppercase tracking-tight">Global Chat</span>
                                <div className="flex items-center gap-1">
                                    {mentionCounts['global'] > 0 && (
                                        <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center ring-2 ring-white">
                                            @
                                        </span>
                                    )}
                                    {unreadCounts['global'] > 0 && (
                                        <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                            {unreadCounts['global']}
                                        </span>
                                    )}
                                </div>
                            </div>
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
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-sm font-black uppercase tracking-tight truncate text-left">{channel.name}</span>
                                    <div className="flex items-center gap-1">
                                        {mentionCounts[channel.id] > 0 && (
                                            <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center ring-2 ring-white">
                                                @
                                            </span>
                                        )}
                                        {unreadCounts[channel.id] > 0 && (
                                            <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                                {unreadCounts[channel.id]}
                                            </span>
                                        )}
                                    </div>
                                </div>
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
                                    <div className="flex items-center gap-1">
                                        {mentionCounts[u.id] > 0 && (
                                            <span className="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center ring-2 ring-white">
                                                @
                                            </span>
                                        )}
                                        {unreadCounts[u.id] > 0 && (
                                            <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                                {unreadCounts[u.id]}
                                            </span>
                                        )}
                                    </div>
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
                                            <div className={`px-4 py-3 rounded-2xl text-sm font-medium shadow-sm border relative group ${
                                                isMe 
                                                ? 'bg-indigo-600 text-white border-indigo-500 rounded-br-none' 
                                                : 'bg-white text-slate-700 border-slate-100 rounded-bl-none'
                                            }`}>
                                                {msg.is_pinned && (
                                                    <div className={`absolute -top-2 ${isMe ? '-left-2' : '-right-2'} p-1 bg-amber-100 text-amber-600 rounded-lg shadow-sm border border-amber-200 z-10`}>
                                                        <Pin size={10} fill="currentColor" />
                                                    </div>
                                                )}
                                                
                                                <div className={`absolute -top-2 ${isMe ? 'right-0' : 'left-0'} flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-20`}>
                                                    {isMe && (
                                                        <button 
                                                            onClick={() => {
                                                                setEditingMessageId(msg.id);
                                                                setEditContent(msg.content);
                                                            }}
                                                            className="p-1.5 bg-white text-slate-400 rounded-lg shadow-lg border border-slate-100 hover:text-indigo-600 hover:bg-indigo-50"
                                                            title="Edit Message"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => setSelectedThreadParent(msg)}
                                                        className="p-1.5 bg-white text-slate-400 rounded-lg shadow-lg border border-slate-100 hover:text-indigo-600 hover:bg-indigo-50"
                                                        title="Reply in Thread"
                                                    >
                                                        <Reply size={12} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleTogglePin(msg)}
                                                        className={`p-1.5 bg-white rounded-lg shadow-lg border border-slate-100 hover:bg-indigo-50 transition-all ${msg.is_pinned ? 'text-amber-600' : 'text-slate-400 hover:text-amber-600'}`}
                                                        title={msg.is_pinned ? "Unpin Message" : "Pin Message"}
                                                    >
                                                        <Pin size={12} fill={msg.is_pinned ? "currentColor" : "none"} />
                                                    </button>
                                                    <button 
                                                        onClick={() => setActiveReactionPicker(activeReactionPicker === msg.id ? null : msg.id)}
                                                        className={`p-1.5 bg-white rounded-lg shadow-lg border border-slate-100 hover:bg-indigo-50 transition-all ${activeReactionPicker === msg.id ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}
                                                        title="Add Reaction"
                                                    >
                                                        <Smile size={12} />
                                                    </button>
                                                    {isMe && (
                                                        <button 
                                                            onClick={() => handleDeleteMessage(msg.id)}
                                                            className="p-1.5 bg-white text-rose-500 rounded-lg shadow-lg border border-slate-100 hover:bg-rose-50"
                                                            title="Delete Message"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>

                                                {activeReactionPicker === msg.id && (
                                                    <div className={`absolute bottom-full ${isMe ? 'right-0' : 'left-0'} mb-2 z-50`}>
                                                        <motion.div 
                                                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            className="flex items-center gap-1 p-1.5 bg-white rounded-2xl shadow-2xl border border-slate-100"
                                                        >
                                                            {['👍', '❤️', '😮', '😂', '🔥', '👏'].map(emoji => (
                                                                <button 
                                                                    key={emoji}
                                                                    onClick={() => {
                                                                        handleReaction(msg.id, emoji);
                                                                        setActiveReactionPicker(null);
                                                                    }}
                                                                    className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-xl transition-all text-lg"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </motion.div>
                                                    </div>
                                                )}

                                                {editingMessageId === msg.id ? (
                                                    <div className="space-y-2 min-w-[200px]">
                                                        <textarea 
                                                            value={editContent}
                                                            onChange={(e) => setEditContent(e.target.value)}
                                                            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-sm outline-none focus:ring-2 focus:ring-white/20 resize-none"
                                                            rows={3}
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <button 
                                                                onClick={() => handleEditMessage(msg.id, editContent)}
                                                                className="px-3 py-1 bg-white text-indigo-600 text-[10px] font-black uppercase rounded-md"
                                                            >
                                                                Save
                                                            </button>
                                                            <button 
                                                                onClick={() => setEditingMessageId(null)}
                                                                className="px-3 py-1 bg-white/20 text-white text-[10px] font-black uppercase rounded-md"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {msg.file_url ? (
                                                            // ... (existing file rendering)
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
                                                                        p: ({ children, ...props }) => {
                                                                            const renderWithMentions = (text: string) => {
                                                                                const parts = text.split(/(@\w+|@Channel)/g);
                                                                                return parts.map((part, i) => {
                                                                                    if (part.startsWith('@')) {
                                                                                        return (
                                                                                            <span key={i} className={`font-black px-1 rounded-md ${isMe ? 'bg-indigo-400/30 text-yellow-200' : 'bg-amber-50 text-amber-600'}`}>
                                                                                                {part}
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                    return part;
                                                                                });
                                                                            };
                                                                            return (
                                                                                <p {...props} className="m-0 leading-relaxed">
                                                                                    {React.Children.map(children, (child) => typeof child === 'string' ? renderWithMentions(child) : child)}
                                                                                </p>
                                                                            );
                                                                        }
                                                                    }}
                                                                >
                                                                    {msg.content}
                                                                </ReactMarkdown>
                                                                {msg.content.match(/https?:\/\/[^\s]+/g)?.map((url, i) => (
                                                                    <LinkPreview key={i} url={url} data={msg.link_preview} />
                                                                ))}
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
                                                                p: ({ children, ...props }) => {
                                                                    const renderWithMentions = (text: string) => {
                                                                        const parts = text.split(/(@\w+|@Channel)/g);
                                                                        return parts.map((part, i) => {
                                                                            if (part.startsWith('@')) {
                                                                                return (
                                                                                    <span key={i} className={`font-black px-1 rounded-md ${isMe ? 'bg-indigo-400/30 text-yellow-200' : 'bg-amber-50 text-amber-600'}`}>
                                                                                        {part}
                                                                                    </span>
                                                                                );
                                                                            }
                                                                            return part;
                                                                        });
                                                                    };
                                                                    return (
                                                                        <p {...props} className="m-0 leading-relaxed">
                                                                            {React.Children.map(children, (child) => typeof child === 'string' ? renderWithMentions(child) : child)}
                                                                        </p>
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                        {msg.content.match(/https?:\/\/[^\s]+/g)?.map((url, i) => (
                                                            <LinkPreview key={i} url={url} data={msg.link_preview} />
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {/* Reactions Display */}
                                                {msg.reactions && msg.reactions.length > 0 && (
                                                    <div className={`flex flex-wrap gap-1 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                        {Object.entries(
                                                            msg.reactions.reduce((acc, r) => {
                                                                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                                                return acc;
                                                            }, {} as Record<string, number>)
                                                        ).map(([emoji, count]) => {
                                                            const hasReacted = msg.reactions?.some(r => r.user_id === user?.id && r.emoji === emoji);
                                                            return (
                                                                <button 
                                                                    key={emoji}
                                                                    onClick={() => handleReaction(msg.id, emoji)}
                                                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
                                                                        hasReacted
                                                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                                                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                                                                    }`}
                                                                >
                                                                    <span>{emoji}</span>
                                                                    <span>{count}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                
                                                {/* Thread Summary */}
                                                <button 
                                                    onClick={() => setSelectedThreadParent(msg)}
                                                    className={`mt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:underline ${isMe ? 'text-white/80' : 'text-indigo-600'}`}
                                                >
                                                    <MessageCircle size={12} />
                                                    View Thread
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className={`flex items-center gap-1.5 mt-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                                        {msg.is_edited && (
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest opacity-60">Edited</span>
                                        )}
                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                            {format(new Date(msg.created_at), 'HH:mm')}
                                        </span>
                                                {isMe && (
                                                    <div className="text-slate-400 flex items-center gap-1">
                                                        {msg.is_read ? <CheckCheck size={10} /> : <Check size={10} />}
                                                        {getSeenBy(msg).length > 0 && (
                                                            <div className="flex -space-x-1 ml-1">
                                                                {getSeenBy(msg).slice(0, 3).map(u => (
                                                                    <div key={u.id} className="w-3 h-3 rounded-full overflow-hidden border border-white shadow-sm" title={`Seen by ${u.display_name || u.email}`}>
                                                                        {u.avatar_url ? (
                                                                            <img src={u.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center bg-slate-200 text-[5px] font-black text-slate-500">
                                                                                {(u.display_name || u.email).substring(0, 1)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {getSeenBy(msg).length > 3 && (
                                                                    <div className="w-3 h-3 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[5px] font-black text-slate-500">
                                                                        +{getSeenBy(msg).length - 3}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
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
                                    accept=".xml,.html,.htm,.png,.jpg,.jpeg,.gif,.pdf,.docx,.txt"
                                    multiple
                                />
                                <button 
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingFile}
                                    className={`p-2.5 rounded-xl transition-all ${uploadingFile ? 'bg-slate-50 text-slate-300' : 'hover:bg-indigo-50 text-indigo-600 active:scale-95'}`}
                                    title="Upload files"
                                >
                                    {uploadingFile ? (
                                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <Paperclip size={20} />
                                    )}
                                </button>
                                <div className="flex-grow relative">
                                    <AnimatePresence>
                                        {showMentions && mentionOptions.length > 0 && (
                                            <motion.div 
                                                ref={mentionRef}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50"
                                            >
                                                <div className="p-3 border-b border-slate-50 bg-slate-50/50">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mentions</span>
                                                </div>
                                                <div className="max-h-60 overflow-y-auto p-1">
                                                    {mentionOptions.map((opt, idx) => (
                                                        <button
                                                            key={opt.id}
                                                            type="button"
                                                            onClick={() => handleMentionSelect(opt)}
                                                            className={`w-full flex items-center gap-3 p-2.5 text-left rounded-xl transition-all ${selectedMentionIndex === idx ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-50 text-slate-600'}`}
                                                        >
                                                            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                                                {opt.type === 'channel' ? <Hash size={14} /> : <User size={14} />}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-xs font-bold truncate">{opt.display_name || (opt as any).email?.split('@')[0]}</span>
                                                                {opt.type === 'user' && <span className="text-[9px] text-slate-400 truncate">{(opt as any).email}</span>}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <input 
                                        type="text" 
                                        placeholder={selectedUser ? `Message ${selectedUser.display_name || selectedUser.email.split('@')[0]}...` : selectedChannel ? `Message #${selectedChannel.name}...` : "Message global chat..."}
                                        value={newMessage}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const pos = e.target.selectionStart || 0;
                                            setNewMessage(val);
                                            handleTyping();

                                            // Mention detection
                                            const lastAt = val.lastIndexOf('@', pos - 1);
                                            if (lastAt !== -1) {
                                                const textAfter = val.substring(lastAt + 1, pos);
                                                const charBefore = lastAt > 0 ? val[lastAt - 1] : ' ';
                                                if ((charBefore === ' ' || charBefore === '\n') && !textAfter.includes(' ')) {
                                                    setMentionSearch(textAfter);
                                                    setShowMentions(true);
                                                    setMentionTriggerIndex(lastAt);
                                                    setSelectedMentionIndex(0);
                                                    return;
                                                }
                                            }
                                            setShowMentions(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (showMentions && mentionOptions.length > 0) {
                                                if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    setSelectedMentionIndex(prev => (prev + 1) % mentionOptions.length);
                                                } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    setSelectedMentionIndex(prev => (prev - 1 + mentionOptions.length) % mentionOptions.length);
                                                } else if (e.key === 'Enter' || e.key === 'Tab') {
                                                    e.preventDefault();
                                                    handleMentionSelect(mentionOptions[selectedMentionIndex]);
                                                } else if (e.key === 'Escape') {
                                                    setShowMentions(false);
                                                }
                                            }
                                        }}
                                        className="w-full pl-4 pr-12 py-3.5 bg-slate-100 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        <div className="relative" ref={emojiPickerRef}>
                                            <button
                                                type="button"
                                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                className={`p-2 rounded-lg transition-all ${showEmojiPicker ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-white'}`}
                                                title="Add emoji"
                                            >
                                                <Smile size={18} />
                                            </button>
                                            
                                            <AnimatePresence>
                                                {showEmojiPicker && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                                        className="absolute bottom-full right-0 mb-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-slate-100"
                                                    >
                                                        <EmojiPicker
                                                            onEmojiClick={(emojiData: EmojiClickData) => {
                                                                setNewMessage(prev => prev + emojiData.emoji);
                                                                // Don't close picker so user can add multiple emojis
                                                            }}
                                                            theme={Theme.LIGHT}
                                                            lazyLoadEmojis={true}
                                                            skinTonesDisabled={true}
                                                            searchPlaceHolder="Search emojis..."
                                                            width={320}
                                                            height={400}
                                                        />
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
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

                                <div className="flex border-b border-slate-100">
                                    <button 
                                        onClick={() => setActiveTab('details')}
                                        className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'details' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Info
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('files')}
                                        className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'files' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Files
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('pinned')}
                                        className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pinned' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Pinned
                                    </button>
                                </div>
                                
                                <div className="flex-grow overflow-y-auto custom-scrollbar">
                                    {activeTab === 'details' && (
                                        <>
                                            <div className="p-8 flex flex-col items-center text-center">
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

                                                {selectedChannel && (isAdmin || selectedChannel.created_by === user?.id) && (
                                                    <div className="w-full px-8 mb-6">
                                                        <button 
                                                            onClick={handleTogglePrivacy}
                                                            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                                                selectedChannel.is_private 
                                                                ? 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100' 
                                                                : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                {selectedChannel.is_private ? <Lock size={18} /> : <Globe size={18} />}
                                                                <div className="text-left">
                                                                    <p className="text-[10px] font-black uppercase tracking-tight">
                                                                        {selectedChannel.is_private ? 'Make Public' : 'Make Private'}
                                                                    </p>
                                                                    <p className="text-[8px] font-bold uppercase tracking-widest opacity-60">
                                                                        {selectedChannel.is_private ? 'Anyone can join' : 'Invite only'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className={`w-10 h-5 rounded-full relative transition-all ${selectedChannel.is_private ? 'bg-amber-600' : 'bg-indigo-600'}`}>
                                                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${selectedChannel.is_private ? 'left-6' : 'left-1'}`} />
                                                            </div>
                                                        </button>
                                                    </div>
                                                )}
                                                
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
                                            </div>
                                            
                                            <div className="w-full space-y-6 text-left px-8 pb-8">
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

                                                {/* Members Section */}
                                                {selectedChannel && (
                                                    <div className="pt-6 border-t border-slate-100 space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Members ({channelMembers.length})</span>
                                                            {(isAdmin || selectedChannel.created_by === user?.id) && (
                                                                <button 
                                                                    onClick={() => setIsAddingMember(!isAddingMember)}
                                                                    className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all"
                                                                    title="Add Member"
                                                                >
                                                                    <Plus size={14} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {isAddingMember && (
                                                            <div className="space-y-3">
                                                                <div className="relative">
                                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                                                    <input 
                                                                        type="text"
                                                                        value={memberSearchQuery}
                                                                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                                                                        placeholder="Search users to add..."
                                                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                                                    />
                                                                </div>
                                                                <div className="max-h-[150px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                                                    {users
                                                                        .filter(u => 
                                                                            !channelMembers.some(m => m.id === u.id) && 
                                                                            (u.display_name?.toLowerCase().includes(memberSearchQuery.toLowerCase()) || 
                                                                             u.email.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                                                                        )
                                                                        .slice(0, 5)
                                                                        .map(u => (
                                                                            <button 
                                                                                key={u.id}
                                                                                onClick={() => handleAddMember(u)}
                                                                                className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg transition-all text-left group"
                                                                            >
                                                                                <div className="w-6 h-6 rounded-md bg-slate-200 overflow-hidden">
                                                                                    {u.avatar_url ? (
                                                                                        <img src={u.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                                    ) : (
                                                                                        <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-slate-400 uppercase">
                                                                                            {u.display_name?.substring(0, 1) || u.email.substring(0, 1)}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex-grow overflow-hidden">
                                                                                    <p className="text-[10px] font-black text-slate-700 truncate">{u.display_name || u.email.split('@')[0]}</p>
                                                                                    <p className="text-[8px] font-bold text-slate-400 truncate uppercase tracking-widest">{u.role || 'Member'}</p>
                                                                                </div>
                                                                                <Plus size={12} className="text-slate-300 group-hover:text-indigo-600 transition-all" />
                                                                            </button>
                                                                        ))
                                                                    }
                                                                    {memberSearchQuery && users.filter(u => !channelMembers.some(m => m.id === u.id) && (u.display_name?.toLowerCase().includes(memberSearchQuery.toLowerCase()) || u.email.toLowerCase().includes(memberSearchQuery.toLowerCase()))).length === 0 && (
                                                                        <p className="text-[10px] text-slate-400 text-center py-2 italic">No users found</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="space-y-2">
                                                            {channelMembers.map(m => (
                                                                <div key={m.id} className="flex items-center gap-3 p-2 bg-slate-50/50 rounded-xl border border-slate-100 group">
                                                                    <div className="w-8 h-8 rounded-lg bg-slate-200 overflow-hidden">
                                                                        {m.avatar_url ? (
                                                                            <img src={m.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-400 uppercase">
                                                                                {m.display_name?.substring(0, 2) || m.email.substring(0, 2)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-grow overflow-hidden">
                                                                        <p className="text-xs font-black text-slate-700 truncate">{m.display_name || m.email.split('@')[0]}</p>
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{m.id === selectedChannel.created_by ? 'Creator' : 'Member'}</p>
                                                                    </div>
                                                                    {(isAdmin || selectedChannel.created_by === user?.id) && m.id !== selectedChannel.created_by && (
                                                                        <button 
                                                                            onClick={() => handleRemoveMember(m.id)}
                                                                            className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                                                            title="Remove Member"
                                                                        >
                                                                            <X size={14} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

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
                                        </>
                                    )}

                                    {activeTab === 'files' && (
                                        <div className="p-6 space-y-4">
                                            {messages.filter(m => m.file_url).length === 0 ? (
                                                <div className="text-center py-12">
                                                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 mx-auto mb-3">
                                                        <FileText size={24} />
                                                    </div>
                                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No files shared yet</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-3">
                                                    {messages.filter(m => m.file_url).map(m => (
                                                        <div key={m.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3 group">
                                                            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                                                                {m.file_name?.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                                                                    <img src={m.file_url!} alt="" className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
                                                                ) : (
                                                                    <FileText size={18} />
                                                                )}
                                                            </div>
                                                            <div className="flex-grow overflow-hidden">
                                                                <p className="text-[10px] font-black text-slate-700 truncate uppercase tracking-tight">{m.file_name}</p>
                                                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(m.created_at), 'MMM d, yyyy')}</p>
                                                            </div>
                                                            <button 
                                                                onClick={() => window.open(m.file_url!, '_blank')}
                                                                className="p-2 text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
                                                            >
                                                                <Download size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'pinned' && (
                                        <div className="p-6 space-y-4">
                                            {messages.filter(m => m.is_pinned).length === 0 ? (
                                                <div className="text-center py-12">
                                                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 mx-auto mb-3">
                                                        <Pin size={24} />
                                                    </div>
                                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No pinned messages</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {messages.filter(m => m.is_pinned).map(m => (
                                                        <div key={m.id} className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-5 h-5 rounded bg-slate-200 overflow-hidden">
                                                                    {m.sender?.avatar_url && <img src={m.sender.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                                                                </div>
                                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{m.sender?.display_name || m.sender?.email.split('@')[0]}</span>
                                                            </div>
                                                            <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{m.content}</p>
                                                            <button 
                                                                onClick={() => {
                                                                    setIsDetailsOpen(false);
                                                                }}
                                                                className="text-[9px] font-black text-amber-600 uppercase tracking-widest hover:underline"
                                                            >
                                                                Jump to Message
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
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

                {/* Thread Side Panel */}
                <AnimatePresence>
                    {selectedThreadParent && (
                        <>
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedThreadParent(null)}
                                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
                            />
                            <motion.div 
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="absolute right-0 top-0 bottom-0 w-full max-w-[400px] bg-white shadow-2xl z-50 border-l border-slate-100 flex flex-col"
                            >
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                            <MessageCircle size={18} />
                                        </div>
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Thread</h3>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedThreadParent(null)}
                                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/30">
                                    {/* Parent Message */}
                                    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-200 overflow-hidden">
                                                {selectedThreadParent.sender?.avatar_url && <img src={selectedThreadParent.sender.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{selectedThreadParent.sender?.display_name || selectedThreadParent.sender?.email.split('@')[0]}</span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(selectedThreadParent.created_at), 'MMM d, h:mm a')}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed">{selectedThreadParent.content}</p>
                                    </div>

                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-100"></div>
                                        </div>
                                        <div className="relative flex justify-center">
                                            <span className="bg-slate-50 px-3 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Replies</span>
                                        </div>
                                    </div>

                                    {/* Thread Replies */}
                                    <div className="space-y-4">
                                        {threadMessages.map(reply => (
                                            <div key={reply.id} className="flex gap-3">
                                                <div className="w-6 h-6 rounded-md bg-slate-200 flex-shrink-0 overflow-hidden">
                                                    {reply.sender?.avatar_url && <img src={reply.sender.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                                                </div>
                                                <div className="flex flex-col flex-grow">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{reply.sender?.display_name || reply.sender?.email.split('@')[0]}</span>
                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(reply.created_at), 'h:mm a')}</span>
                                                    </div>
                                                    <div className="p-3 bg-white rounded-2xl rounded-tl-none border border-slate-100 shadow-sm text-xs text-slate-600 leading-relaxed relative group">
                                                        {reply.content}

                                                        <div className="absolute -top-2 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-20">
                                                            <button 
                                                                onClick={() => setActiveReactionPicker(activeReactionPicker === reply.id ? null : reply.id)}
                                                                className={`p-1.5 bg-white rounded-lg shadow-lg border border-slate-100 hover:bg-indigo-50 transition-all ${activeReactionPicker === reply.id ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}
                                                                title="Add Reaction"
                                                            >
                                                                <Smile size={10} />
                                                            </button>
                                                        </div>

                                                        {activeReactionPicker === reply.id && (
                                                            <div className="absolute bottom-full right-0 mb-2 z-50">
                                                                <motion.div 
                                                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                    className="flex items-center gap-1 p-1 bg-white rounded-xl shadow-2xl border border-slate-100"
                                                                >
                                                                    {['👍', '❤️', '😮', '😂', '🔥', '👏'].map(emoji => (
                                                                        <button 
                                                                            key={emoji}
                                                                            onClick={() => {
                                                                                handleReaction(reply.id, emoji);
                                                                                setActiveReactionPicker(null);
                                                                            }}
                                                                            className="w-7 h-7 flex items-center justify-center hover:bg-slate-50 rounded-lg transition-all text-base"
                                                                        >
                                                                            {emoji}
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Reactions Display for Reply */}
                                                    {reply.reactions && reply.reactions.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {Object.entries(
                                                                reply.reactions.reduce((acc, r) => {
                                                                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                                                    return acc;
                                                                }, {} as Record<string, number>)
                                                            ).map(([emoji, count]) => {
                                                                const hasReacted = reply.reactions?.some(r => r.user_id === user?.id && r.emoji === emoji);
                                                                return (
                                                                    <button 
                                                                        key={emoji}
                                                                        onClick={() => handleReaction(reply.id, emoji)}
                                                                        className={`flex items-center gap-1 px-1 py-0.5 rounded-lg text-[8px] font-bold border transition-all ${
                                                                            hasReacted
                                                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                                                                : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                                                                        }`}
                                                                    >
                                                                        <span>{emoji}</span>
                                                                        <span>{count}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Thread Input */}
                                <div className="p-4 border-t border-slate-100 bg-white">
                                    <form 
                                        onSubmit={(e) => handleSendMessage(e, selectedThreadParent.id)}
                                        className="flex items-center gap-2"
                                    >
                                        <input 
                                            type="text"
                                            value={threadMessage}
                                            onChange={(e) => setThreadMessage(e.target.value)}
                                            placeholder="Reply to thread..."
                                            className="flex-grow p-3 bg-slate-50 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        />
                                        <button 
                                            type="submit"
                                            disabled={!threadMessage.trim()}
                                            className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 transition-all"
                                        >
                                            <Send size={16} />
                                        </button>
                                    </form>
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
