import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, limit, getDocs } from 'firebase/firestore';
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
    // ИСПРАВЛЕНИЕ: убран onSnapshot на всю коллекцию users — заменён на getDoc при входе (в App.tsx)
    // Список пользователей берём из одного запроса, не слушаем изменения постоянно
    getDocs(collection(db, 'users')).then((snap: any) => {
      const allUsers = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const uniqueMap = new Map();
      allUsers.forEach((u: any) => {
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
    }).catch(console.error);

    // ИСПРАВЛЕНИЕ: ограничили сообщения последними 50 вместо всей коллекции
    const unsubMessages = onSnapshot(
      query(collection(db, 'messages'), orderBy('createdAt', 'asc'), limit(50)),
      (snap) => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );

    return () => { unsubMessages(); };
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
      senderName: currentUser.displayName || currentUser.email || 'Аноним',
      receiverId: selectedUser.id,
      content: newMessage,
      text: newMessage,
      createdAt: serverTimestamp()
    });

    await logActivity("отправил(а) сообщение", selectedUser.username || selectedUser.email);
    setNewMessage("");
  };

  const otherUsers = users.filter(u => u.id !== currentUser?.uid);
  const conversation = selectedUser
    ? messages.filter(m =>
        (m.senderId === currentUser?.uid && m.receiverId === selectedUser.id) ||
        (m.senderId === selectedUser.id && m.receiverId === currentUser?.uid)
      )
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/[0.08] pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-serif text-white tracking-wide">Команда</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">Участники и сообщения</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users list */}
        <div className="glass-card p-6">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">Участники</h3>
          <div className="space-y-3">
            {otherUsers.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedUser?.id === u.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <div className="w-9 h-9 shrink-0 rounded-full bg-white/10 overflow-hidden">
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} className="w-full h-full object-cover" />
                    : <UserIcon className="w-4 h-4 mx-auto mt-2.5 text-zinc-400" />
                  }
                </div>
                <div className="text-left overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{u.username || u.email}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{u.status || 'Участник'}</p>
                </div>
              </button>
            ))}
            {otherUsers.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-6">Нет других участников</p>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="lg:col-span-2 glass-card p-6 flex flex-col h-[65vh]">
          {selectedUser ? (
            <>
              <div className="flex items-center gap-3 pb-4 border-b border-white/[0.05] mb-4">
                <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden shrink-0">
                  {selectedUser.avatarUrl
                    ? <img src={selectedUser.avatarUrl} className="w-full h-full object-cover" />
                    : <UserIcon className="w-4 h-4 mx-auto mt-2 text-zinc-400" />
                  }
                </div>
                <span className="text-sm font-medium text-white">{selectedUser.username || selectedUser.email}</span>
                <button onClick={() => setSelectedUser(null)} className="ml-auto text-zinc-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 hide-scrollbar">
                {conversation.map(msg => {
                  const isMe = msg.senderId === currentUser?.uid;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-white/10 text-white' : 'bg-white/5 text-zinc-300'}`}>
                        {msg.content || msg.text}
                      </div>
                    </div>
                  );
                })}
                {conversation.length === 0 && (
                  <div className="text-center py-10 text-xs text-zinc-600 uppercase tracking-widest">Начните диалог</div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="flex gap-3 pt-4 border-t border-white/[0.05] mt-4">
                <input
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="Сообщение..."
                  className="flex-grow bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white outline-none focus:border-white/30 placeholder-zinc-600"
                />
                <button type="submit" className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm flex-col gap-3">
              <MessageSquare className="w-8 h-8 opacity-30" strokeWidth={1} />
              <p className="text-xs uppercase tracking-widest">Выберите участника</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
