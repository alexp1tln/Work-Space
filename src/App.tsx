import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { auth, db, messagingPromise } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Folder, Layers, Calendar, Lock, LogOut, Activity, User as UserIcon, Users, Bell } from 'lucide-react';
import { StorageModule } from './components/StorageModule';
import { TasksModule } from './components/TasksModule';
import { CalendarModule } from './components/CalendarModule';
import { SafeModule } from './components/SafeModule';
import { ProfileModule } from './components/ProfileModule';
import { NetworkModule } from './components/NetworkModule';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("storage");
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    // ИСПРАВЛЕНИЕ: убран heartbeat (каждую минуту писал в Firestore = 167K writes)
    // ИСПРАВЛЕНИЕ: заменён onSnapshot на getDoc для профиля (достаточно один раз при входе)
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) setUserProfile(snap.data());
        } catch (e) {
          console.error('Failed to load profile', e);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Request permission once logged in
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().then(() => {
            registerPushSubscription();
        });
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(() => {
            if ('Notification' in window && Notification.permission === 'granted') {
                registerPushSubscription();
            }
        }).catch(err => {
            console.log('Service Worker registration failed: ', err);
        });
    }

    const registerPushSubscription = async () => {
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                // Wait for generic Service Worker (for fallback web-push)
                const reg = await navigator.serviceWorker.ready;

                // --- 1. FCM Initialisation (if configured) ---
                try {
                  const messaging = await messagingPromise;
                  const fcmVapidKey = (await import('../firebase-applet-config.json')).fcmVapidKey;

                  if (messaging && fcmVapidKey) {
                     // Register messaging Service worker explicitly
                     const fcmReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                     const fcmToken = await getToken(messaging, { 
                        vapidKey: fcmVapidKey,
                        serviceWorkerRegistration: fcmReg
                     });
                     if (fcmToken) {
                        await fetch('/api/push/subscribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                subscription: { fcmToken }, // Send FCM token securely
                                userId: user.uid
                            })
                        });
                        console.log('FCM Device synchronized successfully!');
                        onMessage(messaging, (payload) => {
                          console.log('FCM Foreground message: ', payload);
                        });
                        return; // Quit early and skip web-push fallback since FCM worked
                     }
                  }
                } catch (e) {
                  console.warn('FCM setup skipped/failed, falling back to web-push...', e);
                }

                // --- 2. Fallback Web-push initialization ---
                const res = await fetch('/api/push/vapid-public-key');
                const { publicKey } = await res.json();

                const urlBase64ToUint8Array = (base64String: string) => {
                    const padding = '='.repeat((4 - base64String.length % 4) % 4);
                    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                    const rawData = window.atob(base64);
                    const outputArray = new Uint8Array(rawData.length);
                    for (let i = 0; i < rawData.length; ++i) {
                        outputArray[i] = rawData.charCodeAt(i);
                    }
                    return outputArray;
                };

                let sub = await reg.pushManager.getSubscription();
                if (sub) {
                    try {
                        const currentKey = sub.options.applicationServerKey
                            ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey as ArrayBuffer)))
                                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
                            : null;
                        const newKey = publicKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                        if (currentKey !== newKey) {
                            await sub.unsubscribe();
                            sub = null;
                        }
                    } catch {
                        await sub.unsubscribe();
                        sub = null;
                    }
                }

                if (!sub) {
                    sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(publicKey)
                    });
                }

                await fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscription: sub.toJSON(), userId: user.uid })
                });
                console.log('Device synchronized successfully with fallback background push engine!');
            }
        } catch (e) {
            console.warn('Background push sync skipped:', e);
        }
    };

    const showNotification = async (title: string, options: NotificationOptions) => {
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                if (reg) {
                    await reg.showNotification(title, options);
                    return;
                }
            }
            new Notification(title, options);
        } catch (e) {
            console.log("Notification fallback failed", e);
        }
    };

    // ИСПРАВЛЕНИЕ: оставлены только 2 лёгких слушателя с limit(1) для foreground-уведомлений
    let isInitialMessages = true;
    const unsubMessages = onSnapshot(query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(1)), (snap) => {
        if (isInitialMessages) { isInitialMessages = false; return; }
        snap.docChanges().forEach(change => {
             if (change.type === 'added') {
                 const data = change.doc.data();
                 if (data.senderId !== user.uid && 'Notification' in window && Notification.permission === 'granted') {
                     if (document.hidden) {
                         showNotification('Новое сообщение 💬', {
                             body: `${data.senderName || 'Аноним'}: ${data.content || data.text || ''}`,
                             icon: '/icon-512.png'
                         });
                      }
                 }
             }
        });
    });

    return () => {
        unsubMessages();
    };
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!username || !password) return;
    
    let email = username;
    if (!username.includes('@')) {
       const safeName = username.split('').map(c => c.charCodeAt(0).toString(16)).join('');
       email = `${safeName}@app.local`;
    }

    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: username });
        const profileData = {
             username,
             email,
             theme: "dark",
             status: "Active operator",
             avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cred.user.uid}`,
             createdAt: new Date().toISOString(),
             updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, "users", cred.user.uid), profileData);
        setUserProfile(profileData);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const snap = await getDoc(doc(db, "users", cred.user.uid));
        if (snap.exists()) setUserProfile(snap.data());
      }
    } catch (e: any) {
      setAuthError(e.message.replace("Firebase:", "Системная ошибка:").replace("auth/invalid-credential", "Неверный логин или пароль").replace("auth/email-already-in-use", "Логин уже используется"));
    }
  };

  const logout = () => signOut(auth);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-black"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div></div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#030303] relative overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
          <div className="absolute -top-[10%] -left-[10%] w-[60vw] h-[60vw] border-[1px] border-indigo-500/10 rounded-full" />
          <div className="absolute top-[20%] -right-[20%] w-[70vw] h-[70vw] border-[1px] border-purple-500/10 rounded-full" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.15)_0%,transparent_70%)] rounded-full pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm flex flex-col items-center relative p-8 glass-panel rounded-[2.5rem]"
        >
          <div className="relative z-10 flex flex-col items-center w-full">
            <div className="w-48 h-48 sm:w-64 sm:h-64 mb-8 flex items-center justify-center relative">
              <div className="absolute inset-2 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)] rounded-full" />
              <img src="https://i.ibb.co/Lz5djnMx/Promt-Support-logo-2-P-S-removebg-preview.png" alt="PS" className="w-40 h-40 sm:w-56 sm:h-56 object-contain drop-shadow-lg relative z-10" />
            </div>
            <h1 className="text-3xl font-medium tracking-tight text-white mb-2 font-serif text-center">
              Prompt <span className="italic text-zinc-500">&</span> Support
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-12 font-medium">
              Защищенное Пространство
            </p>

            <form onSubmit={handleAuth} className="w-full space-y-4">
               <div>
                  <input required value={username} onChange={e=>setUsername(e.target.value)} type="text" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white outline-none focus:border-white/30 focus:bg-white/[0.05] transition-all placeholder-zinc-600" placeholder="Имя Оператора" />
               </div>
               <div>
                  <input required value={password} onChange={e=>setPassword(e.target.value)} type="password" className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-sm text-white outline-none focus:border-white/30 focus:bg-white/[0.05] transition-all placeholder-zinc-600" placeholder="Код Доступа" />
               </div>

               {authError && <div className="text-[11px] text-red-400 text-center py-2">{authError}</div>}

               <button type="submit" className="w-full btn-primary py-4 mt-2">
                 <span className="text-sm font-semibold tracking-wide">{isRegistering ? "Создать Профиль" : "Авторизоваться"}</span>
               </button>
            </form>

            <button type="button" onClick={() => { setIsRegistering(!isRegistering); setAuthError(""); }} className="mt-8 text-[11px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
               {isRegistering ? "Вернуться к Авторизации" : "Создать новые учетные данные"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "storage": return <StorageModule />;
      case "tasks": return <TasksModule />;
      case "chronos": return <CalendarModule />;
      case "network": return <NetworkModule />;
      case "safe": return <SafeModule />;
      case "profile": return <ProfileModule user={user} onProfileUpdate={setUserProfile} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-[#030303] pb-32 overflow-x-hidden selection:bg-indigo-500/30">
      
      <div className="fixed inset-0 z-0 pointer-events-none flex items-center justify-center opacity-30">
         <div className="absolute w-[150vw] h-[150vw]">
            <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0%,transparent_60%)] rounded-full" />
            <div className="absolute bottom-[20%] right-[20%] w-[30%] h-[30%] bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.1)_0%,transparent_60%)] rounded-full" />
            <div className="absolute top-[40%] right-[30%] w-[20%] h-[20%] bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.1)_0%,transparent_60%)] rounded-full" />
         </div>
      </div>

      <header className="px-4 sm:px-12 pt-6 sm:pt-8 flex items-center justify-between z-40 relative">
        <div className="flex items-center gap-2 sm:space-x-4">
          <div className="flex items-center justify-center shrink-0">
            <img src="https://i.ibb.co/Lz5djnMx/Promt-Support-logo-2-P-S-removebg-preview.png" alt="PS" className="h-16 sm:h-24 md:h-32 w-auto object-contain opacity-90 drop-shadow-md" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-xl font-serif font-medium tracking-wide text-white leading-tight whitespace-nowrap">
              Prompt <span className="italic text-zinc-500">&</span> Support
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
           {userProfile && (
             <button onClick={() => setActiveTab('profile')} className="flex items-center gap-2 sm:gap-3 py-1.5 px-2 sm:px-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors max-w-[120px] sm:max-w-[200px]">
               <div className="w-7 h-7 shrink-0 rounded-full bg-white/10 overflow-hidden">
                 {userProfile.avatarUrl ? <img src={userProfile.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-3.5 h-3.5 mx-auto mt-1.5 text-zinc-400" />}
               </div>
               <span className="text-[10px] sm:text-xs font-medium text-white pr-1 sm:pr-2 truncate">{userProfile.username || 'Профиль'}</span>
             </button>
           )}
           <button onClick={logout} className="w-10 h-10 shrink-0 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
             <LogOut className="w-4 h-4 ml-1" />
           </button>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto w-full px-6 sm:px-12 pt-4 sm:pt-12 pb-64 flex-grow relative z-10">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-sm sm:max-w-md flex justify-center"
      >
        <div className="glass-panel rounded-full px-2 py-2 flex items-center gap-1 sm:gap-2 pointer-events-auto overflow-x-auto hide-scrollbar max-w-full shadow-2xl">
          {[
            { id: "storage", icon: Folder, label: "Хранилище", color: "hover:text-amber-400 hover:bg-amber-400/10" },
            { id: "tasks", icon: Layers, label: "Задачи", color: "hover:text-sky-400 hover:bg-sky-400/10" },
            { id: "chronos", icon: Calendar, label: "Время", color: "hover:text-emerald-400 hover:bg-emerald-400/10" },
            { id: "network", icon: Users, label: "Команда", color: "hover:text-fuchsia-400 hover:bg-fuchsia-400/10" },
            { id: "safe", icon: Lock, label: "Ключи", color: "hover:text-indigo-400 hover:bg-indigo-400/10" },
            { id: "profile", icon: UserIcon, label: "Профиль", color: "hover:text-purple-400 hover:bg-purple-400/10" }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative group flex flex-col items-center justify-center shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full transition-all duration-300 ${activeTab === tab.id ? 'bg-white/10 text-white shadow-inner scale-110' : `text-zinc-500 scale-100 ${tab.color}`}`}
            >
              {(tab.id === 'profile' && userProfile?.avatarUrl) ? (
                 <img src={userProfile.avatarUrl} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" alt="Avatar" />
              ) : (
                 <tab.icon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" strokeWidth={1.5} />
              )}
              {activeTab === tab.id && <motion.div layoutId="dock-indicator" className="absolute -bottom-1.5 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />}
              
              <div className="absolute -top-14 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-300 glass-panel text-white text-[10px] px-3 py-1.5 shadow-lg pointer-events-none whitespace-nowrap font-medium tracking-wide border-t border-white/20">
                {tab.label}
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
