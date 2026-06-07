import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query } from 'firebase/firestore';
import { db } from '../firebase';
import { Plus, X } from 'lucide-react';
import { motion } from 'motion/react';

export function CalendarModule() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'events')), (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    await addDoc(collection(db, 'events'), {
      title,
      time: time || '12:00',
      date: dateKey,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setIsAdding(false);
    setTitle("");
    setTime("");
  };

  const removeEvent = async (id: string) => {
    await deleteDoc(doc(db, 'events', id));
  };

  const daysCount = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const pad = firstDay === 0 ? 6 : firstDay - 1;
  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

  const getDayKey = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayEvents = events.filter(e => e.date === getDayKey(selectedDay)).sort((a,b) => a.time.localeCompare(b.time));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/[0.08] pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-serif text-white tracking-wide">Хронология</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">График команды и важные события</p>
        </div>
        <div className="flex items-center space-x-4 bg-white/[0.03] border border-white/[0.05] rounded-full px-5 py-2">
           <button onClick={() => setMonth(m => m === 0 ? 11 : m - 1)} className="text-zinc-500 hover:text-white transition-colors">◀</button>
           <span className="text-xs font-medium tracking-wide text-zinc-300 w-28 text-center">{monthNames[month]} {year}</span>
           <button onClick={() => setMonth(m => m === 11 ? 0 : m + 1)} className="text-zinc-500 hover:text-white transition-colors">▶</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         
         <div className="lg:col-span-2 glass-card p-8">
           <div className="grid grid-cols-7 gap-3 mb-6">
             {weekdays.map(d => <div key={d} className="text-center text-[10px] font-medium uppercase tracking-widest text-zinc-600">{d}</div>)}
           </div>
           <div className="grid grid-cols-7 gap-3">
             {Array.from({ length: pad }).map((_, i) => <div key={`pad-${i}`} />)}
             {Array.from({ length: daysCount }).map((_, i) => {
               const day = i + 1;
               const hasEv = events.some(e => e.date === getDayKey(day));
               const isSel = day === selectedDay;
               return (
                 <div 
                    key={day} 
                    onClick={() => setSelectedDay(day)} 
                    className={`aspect-square rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative group overflow-hidden ${isSel ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-105' : 'bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.15] text-zinc-400 hover:text-zinc-100 hover:-translate-y-1 hover:shadow-lg'}`}
                  >
                   <span className={`text-sm z-10 ${isSel ? 'font-bold' : 'font-medium'}`}>{day}</span>
                   {hasEv && <div className={`w-1 h-1 rounded-full mt-1.5 z-10 ${isSel ? 'bg-black' : 'bg-emerald-400 group-hover:shadow-[0_0_8px_rgba(52,211,153,0.8)] transition-all'}`} />}
                   {isSel && <motion.div layoutId="calendar-sel" className="absolute inset-0 bg-gradient-to-tr from-white to-zinc-300 rounded-2xl opacity-90 z-0" />}
                 </div>
               )
             })}
           </div>
         </div>

         <div className="glass-card p-8 flex flex-col h-[500px]">
           <div className="flex justify-between items-center pb-6 border-b border-white/[0.05] mb-6">
              <span className="text-lg font-serif text-zinc-200">{monthNames[month].substring(0,3)} {selectedDay}</span>
              <button onClick={() => setIsAdding(true)} className="btn-secondary w-8 h-8 flex items-center justify-center rounded-full"><Plus className="w-4 h-4"/></button>
           </div>
           <div className="flex-1 overflow-y-auto space-y-4 hide-scrollbar -mx-2 px-2">
             {dayEvents.length === 0 ? (
               <div className="text-xs text-center text-zinc-700 uppercase tracking-widest mt-12">Нет событий</div>
             ) : (
               dayEvents.map(ev => (
                 <motion.div 
                   layout
                   initial={{opacity: 0, scale: 0.95}} 
                   animate={{opacity: 1, scale: 1}} 
                   exit={{opacity: 0, scale: 0.95}}
                   key={ev.id} 
                   className="p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.15] rounded-[1.5rem] flex flex-col group relative transition-all duration-300 hover:shadow-[0_4px_24px_rgba(255,255,255,0.05)] hover:-translate-y-1"
                 >
                   <div className="flex justify-between items-start mb-2">
                     <p className="text-sm font-medium text-zinc-200">{ev.title}</p>
                     <button onClick={() => removeEvent(ev.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all absolute right-4 top-4"><X className="w-4 h-4" /></button>
                   </div>
                   <p className="text-xs font-mono text-zinc-500">{ev.time}</p>
                 </motion.div>
               ))
             )}
           </div>
         </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
           <form onSubmit={addEvent} className="glass-panel w-full max-w-sm p-8 rounded-[2rem]">
              <h3 className="text-xl font-serif text-white mb-6 tracking-wide">Запланировать Событие</h3>
              <div className="space-y-4">
                <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Название события" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" />
                <input value={time} onChange={e => setTime(e.target.value)} placeholder="Время (напр. 14:00)" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" />
                <div className="flex gap-3 pt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 btn-secondary py-3 text-sm">Отмена</button>
                  <button type="submit" className="flex-1 btn-primary py-3 text-sm">Сохранить</button>
                </div>
              </div>
           </form>
        </div>
      )}
    </div>
  );
}
