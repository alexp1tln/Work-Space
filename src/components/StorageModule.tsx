import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { File, Folder as FolderIcon, Upload, X, Save, Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';

export function StorageModule() {
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [viewingFile, setViewingFile] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snap) => {
      const uMap: Record<string, any> = {};
      snap.docs.forEach(d => uMap[d.id] = d.data());
      setUsers(uMap);
    });
    const unsubFolders = onSnapshot(query(collection(db, 'folders')), (snap) => {
      setFolders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubFiles = onSnapshot(query(collection(db, 'files')), (snap) => {
      setFiles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubFolders(); unsubFiles(); };
  }, []);

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await addDoc(collection(db, 'folders'), {
      name: newFolderName,
      parentId: currentFolderId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setNewFolderName("");
    setIsAddingFolder(false);
  };

  const deleteFolder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteDoc(doc(db, 'folders', id));
  };
  
  const deleteFile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteDoc(doc(db, 'files', id));
  };

  const saveFileContent = async () => {
    if (!editingFile) return;
    await updateDoc(doc(db, 'files', editingFile.id), {
      content: editingFile.content,
      updatedAt: serverTimestamp()
    });
    setEditingFile(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(file.name);

    if (!isImg && file.size > 800 * 1024) {
      alert("Не-графические файлы ограничены 800 KB. Загружайте текстовые или сжатые файлы.");
      return;
    }

    try {
      const user = auth.currentUser;
      let base64 = "";
      let finalSize = formatSize(file.size);
      
      if (isImg) {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = event => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let { width, height } = img;
              const MAX = 1200;
              if (width > height && width > MAX) { height *= MAX / width; width = MAX; }
              else if (height > MAX) { width *= MAX / height; height = MAX; }
              canvas.width = width; canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = reject;
            img.src = event.target?.result as string;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        // Approximate the base64 size back to bytes
        const approxBytes = Math.round((base64.length * 3) / 4);
        finalSize = formatSize(approxBytes);

        if (approxBytes > 1000 * 1024) {
            alert("Изображение все еще слишком велико после сжатия. Пожалуйста, сожмите его вручную.");
            return;
        }

      } else {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      await addDoc(collection(db, 'files'), {
        name: file.name,
        parentId: currentFolderId,
        size: finalSize,
        type: file.type || 'application/octet-stream',
        content: base64,
        uploaderId: user?.uid || null,
        uploaderName: user?.displayName || user?.email || 'Unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      await logActivity(isImg ? "загрузил(а) фото" : "загрузил(а) файл", file.name);
    } catch (err) {
      console.error("Upload error", err);
      alert("Ошибка при загрузке. Файл может быть слишком большим.");
    }
    
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const currentFolders = folders.filter(f => f.parentId === currentFolderId);
  const currentFiles = files.filter(f => f.parentId === currentFolderId);

  const handleFileClick = (f: any) => {
    const isImage = f.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.name);
    if (isImage) {
      setViewingFile(f);
    } else if (f.type?.startsWith('text/') || f.name.endsWith('.txt')) {
      setEditingFile(f);
    } else {
      // Just download or show preview for other files
      const a = document.createElement('a');
      a.href = f.content;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-5 border-b border-white/[0.08] pb-6 mb-8">
        <div>
          <h2 className="text-3xl sm:text-4xl font-serif text-white tracking-wide">Хранилище</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">Общие файлы и директории</p>
        </div>
        
        <div className="flex w-full sm:w-auto items-center gap-2 sm:space-x-3">
          <button onClick={() => setIsAddingFolder(true)} className="btn-secondary flex-1 sm:flex-none py-2.5 px-3 sm:px-5 text-sm flex justify-center items-center gap-2">
            <FolderIcon className="w-4 h-4" /> Папка
          </button>
          
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary flex-1 sm:flex-none py-2.5 px-3 sm:px-5 text-sm flex justify-center items-center gap-2">
             <Upload className="w-4 h-4"/> Загрузить
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-2 text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-6">
         <button onClick={() => setCurrentFolderId(null)} className="hover:text-white transition-colors">Пространство</button>
      </div>

      {isAddingFolder && (
        <form onSubmit={createFolder} className="glass-card p-4 flex gap-3 mb-8">
           <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Имя папки..." className="flex-grow bg-transparent px-4 py-2 text-sm text-white focus:outline-none placeholder-zinc-600" autoFocus />
           <button type="submit" className="btn-primary px-4 py-2 text-xs">Создать</button>
           <button type="button" onClick={() => setIsAddingFolder(false)} className="btn-secondary px-4 py-2 text-xs">Отмена</button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {currentFolders.map(f => (
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            key={f.id} 
            onClick={() => setCurrentFolderId(f.id)} 
            className="glass-card p-6 flex flex-col justify-between cursor-pointer group h-40"
          >
             <div className="flex justify-between items-start">
               <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.02)] flex items-center justify-center group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all duration-500">
                 <FolderIcon className="text-zinc-500 group-hover:text-indigo-400 w-5 h-5 flex-shrink-0 transition-colors" strokeWidth={1.5} />
               </div>
               <button onClick={(e) => deleteFolder(f.id, e)} className="opacity-0 group-hover:opacity-100 bg-white/5 hover:bg-red-500/20 p-2 rounded-full text-zinc-600 hover:text-red-400 transition-all"><X className="w-3.5 h-3.5" /></button>
             </div>
             <div className="mt-4">
               <span className="text-sm tracking-wide font-medium text-zinc-300 group-hover:text-white transition-colors truncate block">{f.name}</span>
               <span className="text-[10px] text-zinc-600 uppercase tracking-widest mt-1 block">Папка</span>
             </div>
          </motion.div>
        ))}

        {currentFiles.map(f => (
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            key={f.id} 
            onClick={() => handleFileClick(f)} 
            className="glass-card p-6 flex flex-col justify-between cursor-pointer group h-40"
          >
             <div className="flex justify-between items-start">
               <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.02)] flex flex-shrink-0 items-center justify-center group-hover:bg-sky-500/10 group-hover:border-sky-500/30 group-hover:shadow-[0_0_20px_rgba(14,165,233,0.2)] transition-all duration-500">
                 {(() => {
                   const isImage = f.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(f.name);
                   if (isImage) return (
                     <div 
                       className="w-full h-full rounded-full bg-cover bg-center opacity-70 group-hover:opacity-100 transition-opacity" 
                       style={{ backgroundImage: `url(${f.content})` }} 
                     />
                   );
                   return <File className="text-zinc-500 group-hover:text-sky-400 w-5 h-5 flex-shrink-0 transition-colors" strokeWidth={1.5} />;
                 })()}
               </div>
               <button onClick={(e) => deleteFile(f.id, e)} className="opacity-0 group-hover:opacity-100 bg-white/5 hover:bg-red-500/20 p-2 rounded-full text-zinc-600 hover:text-red-400 transition-all"><X className="w-3.5 h-3.5" /></button>
             </div>
             <div className="overflow-hidden mt-4">
               <p className="text-sm font-medium truncate text-zinc-300 group-hover:text-white transition-colors">{f.name}</p>
               <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 font-mono">{f.size}</p>
             </div>
          </motion.div>
        ))}
        {currentFolders.length === 0 && currentFiles.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-white/10 rounded-[2rem]">
            <FolderIcon className="w-8 h-8 mb-4 opacity-50" strokeWidth={1} />
            <p className="text-sm font-light">Директория пуста</p>
          </div>
        )}
      </div>

      {editingFile && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-0 sm:p-4 sm:p-8">
           <div className="glass-panel w-full sm:max-w-4xl h-full sm:h-[85vh] sm:rounded-[2rem] flex flex-col p-4 sm:p-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 sm:pb-6 border-b border-white/[0.05]">
                 <div className="overflow-hidden w-full">
                   <h3 className="text-lg sm:text-xl font-serif text-white tracking-wide mb-1 truncate">{editingFile.name}</h3>
                   <p className="text-[10px] sm:text-xs text-zinc-500 font-mono">{editingFile.size}</p>
                 </div>
                 <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={saveFileContent} className="btn-primary flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-xs flex justify-center items-center gap-2"><Save className="w-3.5 h-3.5"/> Сохранить</button>
                    <button onClick={() => setEditingFile(null)} className="btn-secondary flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-xs">Закрыть</button>
                 </div>
              </div>
              <textarea 
                value={editingFile.content} 
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                className="flex-grow mt-4 sm:mt-6 bg-transparent rounded-xl text-xs sm:text-sm font-mono text-zinc-300 resize-none outline-none leading-relaxed"
                placeholder="Начните печатать..."
              />
           </div>
        </div>
      )}

      {viewingFile && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-4" onClick={() => setViewingFile(null)}>
            <div className="w-full max-w-5xl flex justify-end pb-4">
               <button onClick={() => setViewingFile(null)} className="text-white hover:text-zinc-300">
                 <X className="w-8 h-8" />
               </button>
            </div>
            <img src={viewingFile.content} alt={viewingFile.name} className="w-auto h-auto max-w-full max-h-[65vh] object-contain rounded-xl shadow-2xl mb-6" onClick={e => e.stopPropagation()} />
            
            <div className="w-full max-w-5xl flex flex-col sm:flex-row justify-between items-start sm:items-center text-white gap-4" onClick={e => e.stopPropagation()}>
               <div className="flex flex-col min-w-0 w-full sm:w-auto">
                 <span className="font-medium text-base sm:text-lg truncate max-w-full">{viewingFile.name}</span>
                 <span className="text-xs sm:text-sm text-zinc-400 truncate max-w-full">Загрузил: {users[viewingFile.uploaderId]?.username || viewingFile.uploaderName || 'Неизвестный'}</span>
               </div>
               <a href={viewingFile.content} download={viewingFile.name} className="btn-primary w-full sm:w-auto px-6 py-3 text-sm flex justify-center items-center rounded-xl font-medium shrink-0">
                 Скачать
               </a>
            </div>
        </div>
      )}
    </div>
  );
}

