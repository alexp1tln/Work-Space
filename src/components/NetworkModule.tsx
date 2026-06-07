import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Users, MessageSquare, Send, User as UserIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function NetworkModule() {
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUser = auth.currentUser;

  const getRelativeTime = (timestamp?: string) => {
    if (!timestamp) return 'a while ago';
    const diffMins = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const uniqueMap = new Map();
      allUsers.forEach(u => {
         const key = u.username || u.email || u.id;
         if (!uniqueMap.has(key)) {
             uniqueMap.set(key, u);
         } else {
             const existing = uniqueMap.get(key);
             if (u.id === currentUser?.uid) {
                 uniqueMap.set(key, u);
             } else if (u.email && !existing.email) {
                 uniqueMap.set(key, u);
             }
         }
      });
      setUsers(Array.from(uniqueMap.values()));
    });
    
    // Using a simple query for messages because complex queries might require composite indexes
    const unsubMessages = onSnapshot(query(collection(db, 'messages'), orderBy('createdAt', 'asc')), (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    return () => { unsubUsers(); unsubMessages(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedUser]);

  const logActivity = async (actionType: string, targetName: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'activities'), {
        actorId: currentUser.uid,
        actorName: currentUser.displayName || currentUser.email || 'Неизвестный',
        actionType,
        targetName,
        createdAt: serverTimestamp()
      });
    } catch(e) { console.error('Failed to log activity', e); }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !currentUser) return;
    
    await addDoc(collection(db, 'messages'), {
      senderId: currentUser.uid,
      receiverId: selectedUser.id,
      content: newMessage,
      createdAt: serverTimestamp()
    });
    
    // Log activity
    await logActivity('отправил(а) сообщение', `пользователю ${selectedUser.username || selectedUser.email || 'Unknown'}`);
    setNewMessage("");
  };

  const getConversationMessages = () => {
    if (!currentUser || !selectedUser) return [];
    return messages.filter(m => 
      (m.senderId === currentUser.uid && m.receiverId === selectedUser.id) ||
      (m.senderId === selectedUser.id && m.receiverId === currentUser.uid)
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-white/[0.08] pb-6 mb-8">
        <div>
          <h2 className="text-4xl font-serif text-white tracking-wide">Команда</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">Сотрудники и личные сообщения</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[65vh]">
        
        {/* Users List */}
        <div className={`glass-card p-4 flex flex-col rounded-[2rem] flex-shrink-0 ${selectedUser ? 'hidden lg:flex w-full lg:w-1/3' : 'w-full lg:w-1/3'}`}>
          <div className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-4 px-2">Участники</div>
          <div className="flex-grow overflow-y-auto space-y-2 pr-2">
            {users.map(u => (
              <button 
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-colors ${selectedUser?.id === u.id ? 'bg-indigo-500/20 border border-indigo-500/30' : 'hover:bg-white/5 border border-transparent'}`}
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center relative flex-shrink-0 overflow-hidden">
                  {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-zinc-400" />}
                  {u.id !== currentUser?.uid && u.updatedAt && (new Date().getTime() - new Date(u.updatedAt).getTime() < 5 * 60000) && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-black shadow" />}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-sm text-white font-medium truncate">{u.username || u.email || 'Аноним'}</p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {u.id === currentUser?.uid ? 'Вы' : (u.updatedAt && (new Date().getTime() - new Date(u.updatedAt).getTime() < 5 * 60000) ? 'В сети' : `Last active ${getRelativeTime(u.updatedAt)}`)}
                  </p>
                </div>
                {u.id !== currentUser?.uid && <MessageSquare className={`w-4 h-4 rounded-full ${selectedUser?.id === u.id ? 'text-indigo-400' : 'text-zinc-600'}`} />}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`glass-card rounded-[2rem] flex flex-col flex-grow relative overflow-hidden ${!selectedUser ? 'hidden lg:flex items-center justify-center' : 'flex'}`}>
          {!selectedUser ? (
            <div className="text-center opacity-30">
               <MessageSquare className="w-12 h-12 mx-auto mb-4" strokeWidth={1} />
               <p className="font-light">Выберите пользователя для общения</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedUser(null)} className="lg:hidden p-2 bg-white/5 rounded-full mr-2">
                    <X className="w-4 h-4 text-white" />
                  </button>
                  <div className="w-10 h-10 rounded-full bg-white/10 flex flex-shrink-0 items-center justify-center overflow-hidden">
                     {selectedUser.avatarUrl ? <img src={selectedUser.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-zinc-400" />}
                  </div>
                  <div>
                    <h3 className="text-white text-sm font-medium">{selectedUser.username || selectedUser.email || 'Аноним'}</h3>
                    <p className="text-[10px] text-zinc-500">
                      {(() => {
                        const isOnline = selectedUser.updatedAt && (new Date().getTime() - new Date(selectedUser.updatedAt).getTime() < 5 * 60000);
                        return isOnline ? (
                          <>
                            <span className="text-emerald-400 mr-1">●</span> В сети
                          </>
                        ) : (
                          <>
                            <span className="text-zinc-500 mr-1">●</span> Last active {getRelativeTime(selectedUser.updatedAt)}
                          </>
                        );
                      })()}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-zinc-500 font-mono hidden sm:block">
                  Симбионт: {selectedUser.status || 'Active operator'}
                </div>
              </div>

              {/* Messages Map */}
              <div className="flex-grow overflow-y-auto p-4 space-y-4">
                 {getConversationMessages().length === 0 ? (
                   <div className="h-full flex items-center justify-center text-zinc-600 text-sm italic">
                     Нет сообщений. Начните диалог!
                   </div>
                 ) : (
                   getConversationMessages().map((msg, i) => {
                     const isMine = msg.senderId === currentUser?.uid;
                     return (
                       <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${isMine ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white/10 text-zinc-200 rounded-tl-sm'}`}>
                            {msg.content}
                          </div>
                          <span className="text-[9px] text-zinc-600 mt-1 uppercase tracking-wider px-1">
                            {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '...'}
                          </span>
                       </div>
                     )
                   })
                 )}
                 <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              {selectedUser.id !== currentUser?.uid && (
                <form onSubmit={sendMessage} className="p-4 bg-white/[0.02] border-t border-white/5 flex gap-2">
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Написать сообщение..." 
                    className="flex-grow bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                  <button type="submit" disabled={!newMessage.trim()} className="btn-primary p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
