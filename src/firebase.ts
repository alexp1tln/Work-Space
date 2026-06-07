import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Messaging is only supported in certain contexts (like when served over HTTPS/localhost and generic browser support)
export const messagingPromise = isSupported().then(supported => {
  if (supported) {
    return getMessaging(app);
  }
  return null;
});
