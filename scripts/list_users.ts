import { collection, getDocs } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../src/firebase.js';

async function listUsers() {
  try {
      await signInWithEmailAndPassword(auth, 'cleanup@app.local', 'password').catch(async () => {
          await createUserWithEmailAndPassword(auth, 'cleanup@app.local', 'password');
      });
  } catch (e) {
      console.error("Auth error", e);
  }

  const usersSnap = await getDocs(collection(db, 'users'));
  for (const d of usersSnap.docs) {
    console.log("ID:", d.id, "Username:", d.data().username, "Email:", d.data().email);
  }
  process.exit(0);
}
listUsers();
