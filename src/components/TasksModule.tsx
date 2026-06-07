import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Plus, X } from 'lucide-react';
import { motion } from 'motion/react';

export function TasksModule() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignee, setAssignee] = useState("Alex");
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'tasks')), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const logActivity = async (actionType: string, targetName: string) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await addDoc(collection(db, 'activities'), {
        actorId: user.uid,
        actorName: user.displayName || user.email || 'Неизвестный',
        actionType,
        targetName,
        createdAt: serverTimestamp()
      });
    } catch(e) { console.error('Failed to log activity', e); }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    await addDoc(collection(db, 'tasks'), {
      title,
      description: desc,
      status: 'todo',
      assignee,
      deadline: deadline || 'ASAP',
      deadlineNotified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await logActivity("создал(а) задачу", title);
    setTitle("");
    setDesc("");
    setDeadline("");
    setIsAdding(false);
  };

  const updateStatus = async (id: string, status: string, taskTitle: string) => {
    await updateDoc(doc(db, 'tasks', id), { status, updatedAt: serverTimestamp() });
    await logActivity("обновил(а) статус задачи", taskTitle);
  };

  const removeTask = async (id: string, taskTitle: string) => {
    await deleteDoc(doc(db, 'tasks', id));
    await logActivity("удалил(а) задачу", taskTitle);
  };

  const columns = [
    { id: 'todo', title: 'План', next: 'progress', nextLabel: 'Начать' },
    { id: 'progress', title: 'В Процессе', next: 'done', nextLabel: 'Завершить' },
    { id: 'done', title: 'Готово', next: 'todo', nextLabel: 'Вернуть' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/[0.08] pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-serif text-white tracking-wide">Задачи</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">Канбан-доска для управления проектами</p>
        </div>
        <button onClick={() => setIsAdding(true)} className="btn-primary py-2 px-5 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Новая Задача
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {columns.map(col => (
          <div key={col.id} className="glass-card p-6 flex flex-col h-[65vh]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.05] mb-4">
               <span className="text-sm tracking-wide font-medium text-zinc-300">{col.title}</span>
               <span className="w-6 h-6 flex items-center justify-center bg-white/[0.04] rounded-full text-[10px] text-zinc-400 font-mono">{tasks.filter(t => t.status === col.id).length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 hide-scrollbar">
               {tasks.filter(t => t.status === col.id).map(task => (
                 <motion.div 
                   layout 
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   key={task.id} 
                   className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] hover:border-white/[0.15] hover:shadow-[0_4px_24px_rgba(255,255,255,0.05)] p-5 rounded-[1.5rem] relative group transition-all duration-300"
                 >
                    <h4 className="text-sm font-medium text-zinc-200 leading-snug">{task.title}</h4>
                    {task.description && <p className="text-[11px] text-zinc-500 mt-2 line-clamp-2 leading-relaxed">{task.description}</p>}
                    <div className="flex justify-between items-center mt-5 pt-4 border-t border-white/[0.05] text-[10px] uppercase font-medium tracking-widest">
                       <span className="text-zinc-300 bg-white/[0.05] px-2 py-1 rounded-md">{task.assignee}</span>
                       <span className="text-zinc-500">{task.deadline}</span>
                    </div>
                    <div className="flex gap-2 mt-3 -mx-1">
                      <button onClick={() => updateStatus(task.id, col.next, task.title)} className="btn-secondary flex-1 py-1.5 text-xs">
                        {col.nextLabel}
                      </button>
                      <button onClick={() => removeTask(task.id, task.title)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                 </motion.div>
               ))}
               {tasks.filter(t => t.status === col.id).length === 0 && (
                 <div className="text-center py-10 mt-4 text-xs tracking-widest uppercase text-zinc-700">Пусто</div>
               )}
            </div>
          </div>
        ))}
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4">
           <form onSubmit={addTask} className="glass-panel w-full max-w-sm p-8 rounded-[2rem]">
              <h3 className="text-xl font-serif text-white mb-6 tracking-wide">Новая Задача</h3>
              <div className="space-y-4">
                <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Суть задачи" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30 placeholder-zinc-600" />
                <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Дополнительный контекст (необязательно)" className="w-full h-24 resize-none bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30 placeholder-zinc-600" />
                <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Ответственный (имя)" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30 placeholder-zinc-600" />
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30 placeholder-zinc-600" />
                <div className="flex gap-3 pt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 btn-secondary py-3 text-sm">Отмена</button>
                  <button type="submit" className="flex-1 btn-primary py-3 text-sm">Создать</button>
                </div>
              </div>
           </form>
        </div>
      )}
    </div>
  );
}
