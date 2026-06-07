import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query } from 'firebase/firestore';
import { db } from '../firebase';
import { Lock, Plus, X, Copy, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

export function SafeModule() {
  const [safe, setSafe] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [service, setService] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'safeEntries')), (snap) => {
      setSafe(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service) return;
    await addDoc(collection(db, 'safeEntries'), {
      service, login, password, note,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setService(""); setLogin(""); setPassword(""); setNote("");
    setIsAdding(false);
  };

  const removeEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteDoc(doc(db, 'safeEntries', id));
  };

  const copyPwd = (pwd: string) => {
    navigator.clipboard.writeText(pwd);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/[0.08] pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-serif text-white tracking-wide">Сейф</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">Зашифрованные доступы и API ключи</p>
        </div>
        <button onClick={() => setIsAdding(true)} className="btn-primary py-2 px-5 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Добавить Секрет
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {safe.length === 0 && (
           <div className="col-span-full py-24 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-white/10 rounded-[2rem]">
             <Lock className="w-8 h-8 mb-4 opacity-50" strokeWidth={1} />
             <p className="text-sm font-light">В данный момент сейф пуст</p>
           </div>
         )}
         
         {safe.map(item => (
           <motion.div 
             layout 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, scale: 0.9 }}
             key={item.id} 
             className="glass-card p-6 flex flex-col justify-between group hover:-translate-y-1 hover:shadow-2xl"
           >
                 <div className="flex justify-between items-start mb-6">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full border border-white/[0.08] shadow-inner bg-gradient-to-br from-white/[0.05] to-transparent flex items-center justify-center group-hover:border-white/20 transition-all">
                     <Lock className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
                   </div>
                   <div>
                     <h4 className="text-sm font-semibold text-white tracking-wide">{item.service}</h4>
                     {item.note && <p className="text-[10px] text-zinc-500 mt-0.5 max-w-[120px] truncate">{item.note}</p>}
                   </div>
                 </div>
                 <button onClick={(e) => removeEntry(item.id, e)} className="opacity-0 group-hover:opacity-100 bg-white/5 hover:bg-red-500/20 p-2 rounded-full text-zinc-600 hover:text-red-400 transition-all"><X className="w-3.5 h-3.5"/></button>
              </div>
              <div className="space-y-3">
                 <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-xl flex justify-between items-center text-sm">
                   <span className="text-zinc-500 text-xs">Логин</span>
                   <span className="text-zinc-200 select-all font-mono text-xs">{item.login}</span>
                 </div>
                 <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-xl flex justify-between items-center text-sm">
                   <span className="text-zinc-500 text-xs">Пароль</span>
                   <span className="text-zinc-200 font-mono tracking-widest text-xs">{revealed[item.id] ? item.password : "••••••••"}</span>
                 </div>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-white/[0.05]">
                 <button onClick={() => setRevealed(r => ({...r, [item.id]: !r[item.id]}))} className="btn-secondary flex-1 py-2 text-xs flex justify-center items-center gap-2">
                   {revealed[item.id] ? <><EyeOff className="w-3.5 h-3.5"/> Скрыть</> : <><Eye className="w-3.5 h-3.5"/> Показать</>}
                 </button>
                 <button onClick={() => copyPwd(item.password)} className="btn-secondary w-10 flex items-center justify-center"><Copy className="w-3.5 h-3.5"/></button>
              </div>
           </motion.div>
         ))}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
           <form onSubmit={addEntry} className="glass-panel w-full max-w-sm p-8 rounded-[2rem]">
              <h3 className="text-xl font-serif text-white mb-6 tracking-wide">Зашифровать данные</h3>
              <div className="space-y-4">
                <input required value={service} onChange={e => setService(e.target.value)} placeholder="Название сервиса" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" />
                <input required value={login} onChange={e => setLogin(e.target.value)} placeholder="Идентификатор / Логин" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" />
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" />
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Примечание (необязательно)" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" />
                <div className="flex gap-3 pt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 btn-secondary py-3 text-sm">Отмена</button>
                  <button type="submit" className="flex-1 btn-primary py-3 text-sm">Зашифровать</button>
                </div>
              </div>
           </form>
        </div>
      )}
    </div>
  );
}
