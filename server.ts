import express from 'express';
import path from 'path';
import fs from 'fs';
import webPush from 'web-push'; // Fallback only
import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, query, orderBy, limit, doc, setDoc, getDocs, where, deleteDoc, getDoc } from 'firebase/firestore';
import { createServer as createViteServer } from 'vite';

// Read firebase configuration from config file
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase App (Client SDK for DB listeners)
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(firebaseApp);

// Initialize Firebase Admin (Server SDK for FCM)
let fcmAvailable = false;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    fcmAvailable = true;
    console.log('Firebase Admin initialized for FCM.');
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY missing. FCM server push will be unavailable.');
  }
} catch (err) {
  console.error('Failed to initialize Firebase Admin:', err);
}

// Fallback VAPID Keys for testing without FCM
const vapidPath = path.join(process.cwd(), 'vapid.json');
let vapidKeys: { publicKey: string; privateKey: string };
if (fs.existsSync(vapidPath)) {
  vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
} else {
  vapidKeys = webPush.generateVAPIDKeys();
  fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys, null, 2));
}

webPush.setVapidDetails(
  'mailto:vbbubuludu@gmail.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Authenticate server client so it complies with firestore.rules
const authenticateServer = async () => {
  try {
    await signInWithEmailAndPassword(auth, 'system-notifications@app.local', 'SecureSystemPassword123!').catch(async (authErr: any) => {
      fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[AUTH INFO] Sign-in failed, trying to create system user: ${authErr.message}\n`);
      await createUserWithEmailAndPassword(auth, 'system-notifications@app.local', 'SecureSystemPassword123!');
    });
    console.log('Firebase system-notifications user authenticated successfully');
    fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[AUTH SUCCESS] system-notifications authenticated\n`);
  } catch (e: any) {
    console.error('Firebase server sign in failed. Retrying in 5 seconds...', e);
    fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[AUTH ERROR] Firebase sign-in/up failed: ${e.message}. Retrying in 5s\n`);
    setTimeout(authenticateServer, 5000);
  }
};

async function sendPushToUser(userId: string, title: string, body: string, data: any = {}) {
  try {
    const q = query(collection(db, 'push_subscriptions'), where('userId', '==', userId));
    const snap = await getDocs(q);
    
    const sendPromises = snap.docs.map(async (docSnap) => {
      const sub = docSnap.data();
      
      // Try FCM first
      if (sub.fcmToken && fcmAvailable) {
        try {
          await admin.messaging().send({
            token: sub.fcmToken,
            notification: { title, body },
            data: { url: data.url || '/' }
          });
          console.log(`FCM sent successfully to ${docSnap.id}`);
          return;
        } catch (err: any) {
          console.error(`FCM failed for ${docSnap.id}:`, err.message);
          if (err.code === 'messaging/registration-token-not-registered') {
             await deleteDoc(doc(db, 'push_subscriptions', docSnap.id));
          }
        }
      }
      
      // Fallback to web-push
      if (sub.endpoint && sub.keys) {
        const subscription = { endpoint: sub.endpoint, keys: sub.keys };
        try {
          await webPush.sendNotification(subscription, JSON.stringify({ title, body, data }));
          console.log(`Web-push sent successfully to ${docSnap.id}`);
        } catch (err: any) {
          console.error(`Web-push failed for ${docSnap.id}:`, err.message);
          if (err.statusCode === 410 || err.statusCode === 404) {
            await deleteDoc(doc(db, 'push_subscriptions', docSnap.id));
          }
        }
      }
    });
    
    await Promise.all(sendPromises);
  } catch (e) {
    console.error('Error sending push to user:', userId, e);
  }
}

async function sendPushToAllExcept(excludeUserId: string, title: string, body: string, data: any = {}) {
  try {
    const snap = await getDocs(collection(db, 'push_subscriptions'));
    
    const sendPromises = snap.docs.map(async (docSnap) => {
      const sub = docSnap.data();
      if (sub.userId === excludeUserId) return;
      
      // Try FCM first
      if (sub.fcmToken && fcmAvailable) {
        try {
          await admin.messaging().send({
            token: sub.fcmToken,
            notification: { title, body },
            data: { url: data.url || '/' }
          });
          console.log(`FCM sent to ${docSnap.id}`);
          return;
        } catch (err: any) {
          if (err.code === 'messaging/registration-token-not-registered') {
             await deleteDoc(doc(db, 'push_subscriptions', docSnap.id));
          }
        }
      }
      
      if (sub.endpoint && sub.keys) {
        const subscription = { endpoint: sub.endpoint, keys: sub.keys };
        try {
          await webPush.sendNotification(subscription, JSON.stringify({ title, body, data }));
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await deleteDoc(doc(db, 'push_subscriptions', docSnap.id));
          }
        }
      }
    });
    
    await Promise.all(sendPromises);
  } catch (e) {
    console.error('Error sending push to all except:', excludeUserId, e);
  }
}

// Start listeners for database entries
const setupDatabaseListeners = () => {
  const serverBootTime = new Date().toISOString();
  console.log(`Database watchers monitoring entries created after: ${serverBootTime}`);

  // Monitor Direct Messages
  let initialMessages = true;
  onSnapshot(query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(1)), (snap) => {
    if (initialMessages) { initialMessages = false; return; }
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const timeStr = typeof data.createdAt === 'string' ? data.createdAt : (data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '');
        if (timeStr && timeStr > serverBootTime) {
          const title = 'Новое сообщение 💬';
          let senderName = 'Коллега';
          try {
            const senderSnap = await getDoc(doc(db, 'users', data.senderId));
            if (senderSnap.exists()) senderName = senderSnap.data().username || senderSnap.data().email || 'Коллега';
          } catch(e) {}
          const formattedBody = `${senderName}: ${data.content || 'Файл/фото или сообщение'}`;
          if (data.receiverId) {
            await sendPushToUser(data.receiverId, title, formattedBody, { url: '/?tab=network' });
          } else {
            await sendPushToAllExcept(data.senderId, title, formattedBody, { url: '/?tab=network' });
          }
        }
      }
    });
  });

  // Monitor New Tasks
  let initialTasks = true;
  onSnapshot(query(collection(db, 'tasks'), orderBy('createdAt', 'desc'), limit(1)), (snap) => {
    if (initialTasks) { initialTasks = false; return; }
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const timeStr = typeof data.createdAt === 'string' ? data.createdAt : (data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '');
        if (timeStr && timeStr > serverBootTime) {
          const title = 'Новая задача 📋';
          const body = `${data.title} (Ответственный: ${data.assignee || 'Не назначен'})`;
          // Assuming we notify everyone or logic can be complex, let's notify everyone
          await sendPushToAllExcept('', title, body, { url: '/?tab=tasks' });
        }
      }
    });
  });

  // Monitor New Files
  let initialFiles = true;
  onSnapshot(query(collection(db, 'files'), orderBy('createdAt', 'desc'), limit(1)), (snap) => {
    if (initialFiles) { initialFiles = false; return; }
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const timeStr = typeof data.createdAt === 'string' ? data.createdAt : (data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '');
        if (timeStr && timeStr > serverBootTime) {
          await sendPushToAllExcept('', 'Новый файл загружен 📁', data.name, { url: '/?tab=storage' });
        }
      }
    });
  });

  // Monitor New Keys (safeEntries)
  let initialKeys = true;
  onSnapshot(query(collection(db, 'safeEntries'), orderBy('createdAt', 'desc'), limit(1)), (snap) => {
    if (initialKeys) { initialKeys = false; return; }
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const timeStr = typeof data.createdAt === 'string' ? data.createdAt : (data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '');
        if (timeStr && timeStr > serverBootTime) {
          await sendPushToAllExcept('', 'Опубликован доступ 🔑', data.title, { url: '/?tab=keys' });
        }
      }
    });
  });

  // Deadline & Events Checker (runs every minute)
  setInterval(async () => {
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // Check Tasks Deadlines
    try {
      const tasksSnap = await getDocs(collection(db, 'tasks'));
      tasksSnap.forEach(async (docSnap) => {
        const t = docSnap.data();
        if (t.status !== 'done' && t.deadline && typeof t.deadline === 'string' && t.deadline !== 'ASAP') {
           const dlDate = new Date(t.deadline);
           // Notified flag protects against spamming
           if (!t.deadlineNotified && dlDate > now && dlDate <= thresholdDate) {
              await sendPushToAllExcept('', '🔥 Дедлайн близко!', `Задача "${t.title}" должна быть выполнена к ${t.deadline}`, { url: '/?tab=tasks' });
              await updateDoc(doc(db, 'tasks', docSnap.id), { deadlineNotified: true });
           }
        }
      });
    } catch(e) {}

    // Check Events Deadlines
    try {
      const eventsSnap = await getDocs(collection(db, 'events'));
      eventsSnap.forEach(async (docSnap) => {
        const e = docSnap.data();
        if (e.date && typeof e.date === 'string') {
           const evDate = new Date(e.date);
           if (!e.eventNotified && evDate > now && evDate <= thresholdDate) {
              await sendPushToAllExcept('', '📅 Приближается событие', `${e.title} состоится ${e.date}`, { url: '/?tab=calendar' });
              await updateDoc(doc(db, 'events', docSnap.id), { eventNotified: true });
           }
        }
      });
    } catch(e) {}
  }, 60000);
};

async function start() {
  try {
    fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[START] Server boot sequence initiated at ${new Date().toISOString()}\n`);
  } catch (err) {
    console.error('Initial log write failed', err);
  }

  await authenticateServer();
  setupDatabaseListeners();

  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logger to help diagnose background issues
  app.use((req, res, next) => {
    try {
      const logMsg = `[${new Date().toISOString()}] ${req.method} ${req.url} (Body: ${JSON.stringify(req.body)})\n`;
      fs.appendFileSync(path.join(process.cwd(), 'server.log'), logMsg);
    } catch (err) {
      console.error('Logging failed', err);
    }
    next();
  });

  // API Route - Serve firebase-applet-config for service worker
  app.get('/firebase-applet-config.json', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'firebase-applet-config.json'));
  });

  // API Route - Get Public VAPID Key
  app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // API Route - Subscribe Device for Push Notifications
  app.post('/api/push/subscribe', async (req, res) => {
    const { subscription, userId } = req.body;
    if (!subscription || !userId) {
      return res.status(400).json({ error: 'Missing subscription or userId' });
    }

    try {
      // Securely construct a firestore document id from the push endpoint to avoid duplicates
      const endpointOrToken = subscription.endpoint || subscription.fcmToken;
      if (!endpointOrToken) return res.status(400).json({ error: 'Missing push endpoint/token' });
      const subId = Buffer.from(endpointOrToken).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(-100);
      
      const subRef = doc(db, 'push_subscriptions', subId);
      await setDoc(subRef, {
        userId,
        fcmToken: subscription.fcmToken || null,
        endpoint: subscription.endpoint || null,
        keys: subscription.keys || null,
        createdAt: new Date().toISOString()
      });
      console.log(`Device subscribed successfully for userId: ${userId}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Failed to persist subscriptions:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route - Trigger background push test for testing closed-app delivery
  app.post('/api/push/test', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[ERROR] Missing userId in /api/push/test\n`);
        return res.status(400).json({ error: 'Missing userId' });
      }

      fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[INFO] Triggering push test for user ${userId}\n`);
      console.log(`Triggering background push test for userId: ${userId} in 3 seconds`);
      
      setTimeout(async () => {
        try {
          await sendPushToUser(
            userId,
            'Тестовый сигнал 🧪',
            'Фоновые push-уведомления работают круглосуточно (24/7), когда приложение закрыто!'
          );
        } catch (subErr: any) {
          fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[ERROR OUT] Background send failed: ${subErr.message}\n`);
        }
      }, 3000);

      res.json({
        success: true,
        message: 'Тест запущен. Сверните приложение или заблокируйте экран. Сигнал поступит через 3 секунды.'
      });
    } catch (e: any) {
      fs.appendFileSync(path.join(process.cwd(), 'server.log'), `[FATAL] /api/push/test error: ${e.message}\n`);
      res.status(500).json({ error: e.message });
    }
  });

  // Integrate Vite for development, or serve built assets in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fullstack PWA application running round-the-clock on http://localhost:${PORT}`);
  });
}

start();
