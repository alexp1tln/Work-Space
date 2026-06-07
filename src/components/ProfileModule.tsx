import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, messagingPromise } from '../firebase';
import { getToken } from 'firebase/messaging';
import { User } from 'firebase/auth';
import { Settings, Shield, UploadCloud, Bell, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

export function ProfileModule({ user }: { user: User }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  
  const [permission, setPermission] = useState<string>('Notification' in window ? Notification.permission : 'unsupported');
  const [testSent, setTestSent] = useState(false);
  const [testMessage, setTestMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const res = await Notification.requestPermission();
    setPermission(res);
    
    if (res === 'granted' && 'serviceWorker' in navigator) {
       try {
          // Explicitly register the service worker as it wasn't registered in main.tsx
          const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          await navigator.serviceWorker.ready;
          
          let fcmWorked = false;
          try {
             // 1. Try FCM First
             const messaging = await messagingPromise;
             const fcmVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
             if (messaging && fcmVapidKey) {
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
                            subscription: { fcmToken },
                            userId: user.uid
                        })
                    });
                    fcmWorked = true;
                    setTestMessage('Уведомления (FCM) успешно настроены! Нажмите Test Push для проверки.');
                    setPermission('granted');
                 }
             }
          } catch (e) {
             console.warn('FCM setup failed', e);
          }

          if (fcmWorked) return;

          const keyRes = await fetch('/api/push/vapid-public-key');
          if (keyRes.ok) {
             const { publicKey } = await keyRes.json();
             
             const urlBase64ToUint8Array = (base64String: string) => {
                 try {
                     const padding = '='.repeat((4 - base64String.length % 4) % 4);
                     const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
                     const rawData = window.atob(base64);
                     const outputArray = new Uint8Array(rawData.length);
                     for (let i = 0; i < rawData.length; ++i) {
                         outputArray[i] = rawData.charCodeAt(i);
                     }
                     return outputArray;
                 } catch (e) {
                     console.error('Failed to parse VAPID key', e);
                     throw e;
                 }
             };

             const convertedKey = urlBase64ToUint8Array(publicKey);
             let sub = await reg.pushManager.getSubscription();
             if (sub) {
                 const subKey = sub.options.applicationServerKey;
                 if (subKey) {
                     const subKeyArr = new Uint8Array(subKey);
                     let match = subKeyArr.length === convertedKey.length;
                     if (match) {
                         for (let i = 0; i < convertedKey.length; i++) {
                             if (subKeyArr[i] !== convertedKey[i]) {
                                 match = false;
                                 break;
                             }
                         }
                     }
                     if (!match) {
                         console.log('Stale VAPID key detected, unsubscribing...');
                         await sub.unsubscribe();
                         sub = null;
                     }
                 } else {
                     await sub.unsubscribe();
                     sub = null;
                 }
             }

             if (!sub) {
                sub = await reg.pushManager.subscribe({
                   userVisibleOnly: true,
                   applicationServerKey: convertedKey
                });
             }
             
             await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub, userId: user.uid })
             });
             console.log('Synchronized via manual trigger');
          }
       } catch (e) {
          console.error('Subscription error: ', e);
       }
    }
  };

  const triggerTestPush = async () => {
    setTestSent(true);
    setTestMessage("Связь с сервером установлена. Отправка сигнала...");
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });
      
      if (!res.ok) {
        let errText = "";
        try {
          const errData = await res.json();
          errText = errData.error || errData.message || JSON.stringify(errData);
        } catch {
          errText = await res.text();
        }
        throw new Error(`Ошибка сервера (${res.status}): ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      setTestMessage(data.message || "Тест запущен!");
    } catch (e: any) {
      setTestMessage(`Ошибка сети (или сервера): ${e.message || e}`);
      console.error("Push test error:", e);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      const d = await getDoc(doc(db, "users", user.uid));
      if (d.exists()) {
        setProfile(d.data());
        setStatus(d.data().status || "");
        setAvatarUrl(d.data().avatarUrl || "");
        setUsername(d.data().username || "");
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const saveProfile = async () => {
    await updateDoc(doc(db, "users", user.uid), {
      status,
      avatarUrl,
      username,
      updatedAt: new Date().toISOString()
    });
    setProfile({ ...profile, status, avatarUrl, username });
    setIsEditing(false);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
           setAvatarUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
     }
  };

  if (loading) return <div className="text-center mt-20 text-zinc-600 uppercase tracking-widest text-[10px] animate-pulse">Синхронизация Профиля...</div>;

  return (
    <div className="space-y-8 pb-56">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/[0.08] pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-serif text-white tracking-wide">Профиль</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">Управление личностью оператора</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="md:col-span-1 glass-card p-8 flex flex-col items-center justify-center text-center">
            <div className="relative group mb-6">
              <div className="w-28 h-28 rounded-full border border-white/10 flex items-center justify-center overflow-hidden bg-white/[0.02] shadow-[0_0_30px_rgba(255,255,255,0.05)] group-hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] transition-all duration-500">
                  {avatarUrl ? (
                     <motion.img 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        src={avatarUrl} 
                        alt="Avatar" 
                        className="w-full h-full object-cover" 
                      />
                  ) : (
                     <span className="text-4xl font-serif text-white">{profile?.username?.charAt(0) || user.email?.charAt(0) || "?"}</span>
                  )}
              </div>
              {isEditing && (
                <div onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm cursor-pointer border border-white/20">
                   <UploadCloud className="w-6 h-6 text-white mb-1" />
                   <span className="text-[9px] uppercase tracking-wider text-white">Изменить</span>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleAvatarSelect} className="hidden" accept="image/*" />
            </div>
            
            <h3 className="text-xl font-medium tracking-wide text-white mb-1 font-serif">{profile?.username || "Неизвестно"}</h3>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono mb-6">{user.email?.replace("@promtsupport.space", "") || "Гостевой ID"}</p>
            
            <div className="w-full bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 space-y-3 text-left">
               <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-mono">
                  <span className="text-zinc-500">Статус</span>
                  <span className="text-white font-medium flex items-center gap-2">
                     {profile?.updatedAt && (new Date().getTime() - new Date(profile.updatedAt).getTime() < 5 * 60000) ? (
                        <><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> В сети</>
                     ) : (
                        <><div className="w-1.5 h-1.5 rounded-full bg-zinc-500"></div> Оффлайн</>
                     )}
                  </span>
               </div>
            </div>
         </div>

         <div className="md:col-span-2 space-y-6">
            <div className="glass-card p-8">
               <div className="flex items-center justify-between pb-6 border-b border-white/[0.05] mb-6">
                  <span className="text-sm tracking-wide font-medium text-white flex items-center gap-3"><Settings className="w-4 h-4 text-zinc-500" /> Настройки Профиля</span>
                  <button onClick={() => isEditing ? saveProfile() : setIsEditing(true)} className="btn-secondary py-2 px-5 text-xs border border-white/[0.08]">
                    {isEditing ? "Сохранить" : "Редактировать Профиль"}
                  </button>
               </div>
               
               <div className="space-y-6 max-w-md">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Имя пользователя (Никнейм)</label>
                    {isEditing ? (
                       <input value={username} onChange={e=>setUsername(e.target.value)} className="w-full bg-transparent border border-white/10 rounded-xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" placeholder="Введите имя..." />
                    ) : (
                       <div className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-5 py-3 text-sm text-zinc-300">
                         {profile?.username || "Имя не установлено"}
                       </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Оперативный Статус</label>
                    {isEditing ? (
                       <input value={status} onChange={e=>setStatus(e.target.value)} className="w-full bg-transparent border border-white/10 rounded-xl px-5 py-3 text-sm text-white outline-none focus:border-white/30" />
                    ) : (
                       <div className="w-full bg-white/[0.02] border border-white/[0.05] rounded-xl px-5 py-3 text-sm text-zinc-300">
                         {profile?.status || "Статус не установлен"}
                       </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Оформление Системы</label>
                    <div className="flex gap-4">
                       <button className="flex-1 bg-white/10 border border-white/20 rounded-xl py-3 text-xs text-white font-medium cursor-default shadow-sm">Midnight Pro</button>
                       <button className="flex-1 bg-transparent border border-white/5 rounded-xl py-3 text-xs text-zinc-600 font-medium cursor-not-allowed">Stark Light (Заблокировано)</button>
                    </div>
                  </div>
               </div>
            </div>

            <div className="glass-card p-8 space-y-6">
                <div className="flex items-center gap-3 border-b border-white/[0.05] pb-4">
                  <Bell className="w-5 h-5 text-amber-400" />
                  <span className="text-sm tracking-wide font-medium text-white">Круглосуточные Push-Уведомления (24/7)</span>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">
                   Вы добавили приложение на экран «Домой» (PWA). Чтобы получать уведомления моментально, даже когда приложение полностью закрыто или телефон заблокирован, настройте системные push-уведомления:
                </p>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/[0.02] border border-white/[0.05] p-5 rounded-2xl">
                   <div>
                      <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Статус разрешений в браузере</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        permission === 'granted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        permission === 'denied' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {permission === 'granted' ? 'Разрешено' : permission === 'denied' ? 'Заблокировано' : 'Не установлено'}
                      </span>
                   </div>

                   {permission !== 'granted' && (
                     <button onClick={requestNotificationPermission} className="btn-secondary py-2 px-4 text-xs border border-white/[0.08] text-white cursor-pointer">
                        Предоставить доступ
                     </button>
                   )}
                </div>

                {permission === 'granted' && (
                  <div className="space-y-4">
                     <span className="block text-[10px] uppercase tracking-widest text-zinc-500">Диагностика доставки 24/7</span>
                     
                     <div className="flex flex-col gap-3">
                        <button 
                          onClick={triggerTestPush}
                          className="w-full bg-white/10 hover:bg-white/15 text-white active:scale-98 transition-all font-medium py-3 rounded-xl text-xs flex items-center justify-center gap-2 border border-white/10 cursor-pointer"
                        >
                           <RefreshCw className={`w-3.5 h-3.5 ${testSent ? 'animate-spin' : ''}`} />
                           Запустить тест фоновой доставки
                        </button>
                        
                        {testMessage && (
                          <motion.div 
                             initial={{ opacity: 0, y: 5 }}
                             animate={{ opacity: 1, y: 0 }}
                             className="text-[11px] text-zinc-400 text-center bg-black/40 border border-white/5 p-3 rounded-xl italic leading-relaxed"
                          >
                             {testMessage}
                          </motion.div>
                        )}
                        
                        <p className="text-[10px] text-zinc-500 text-center uppercase tracking-wider font-light leading-relaxed">
                          * Нажмите кнопку, затем быстро заблокируйте телефон или сверните приложение. Через 3 секунды поступит пуш!
                        </p>
                     </div>
                  </div>
                )}
             </div>

             <div className="glass-card p-6 bg-white/[0.01]">
                <span className="text-xs tracking-wider font-medium text-zinc-400 flex items-center gap-2 mb-3"><Shield className="w-3.5 h-3.5" /> Уровень Безопасности</span>
                <p className="text-[11px] text-zinc-600 leading-relaxed max-w-lg">
                  Терминал защищен сквозными изолированными структурами данных. Внешние запросы блокируются. Ваш токен сеанса не подлежит передаче.
                </p>
             </div>
          </div>
       </div>
    </div>
  );
}
