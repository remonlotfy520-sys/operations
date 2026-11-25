// Firebase backend (Auth + Firestore). Permissions are enforced by firestore.rules.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updatePassword,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, getDocs,
  query, where, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, USER_EMAIL_DOMAIN } from './config.js';
import { withDefaults, learnedId } from './logic.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/** Usernames may be Arabic; Firebase emails must be ASCII, so hex-encode when needed. */
export function usernameToEmail(username) {
  const u = username.trim().toLowerCase();
  const local = /^[a-z0-9._-]+$/.test(u)
    ? u
    : 'x' + [...new TextEncoder().encode(u)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${local}@${USER_EMAIL_DOMAIN}`;
}

const arErr = (e) => {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  if (c.includes('email-already-in-use')) return new Error('اسم المستخدم موجود بالفعل');
  if (c.includes('weak-password')) return new Error('كلمة المرور ضعيفة (6 أحرف على الأقل)');
  if (c.includes('requires-recent-login')) return new Error('سجّل خروج ثم دخول مرة أخرى ثم أعد المحاولة');
  if (c.includes('permission-denied')) return new Error('غير مسموح لك بهذا الإجراء');
  if (c.includes('too-many-requests')) return new Error('محاولات كثيرة — انتظر قليلًا');
  return e instanceof Error ? e : new Error(String(e));
};
const wrap = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { throw arErr(e); } };

let current = null;

export const firebaseApi = {
  mode: 'firebase',
  needsSetup: wrap(async () => !(await getDoc(doc(db, 'meta', 'setup'))).exists()),
  bootstrapAdmin: wrap(async ({ username, password, name }) => {
    const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
    const b = writeBatch(db);
    b.set(doc(db, 'users', cred.user.uid), {
      username: username.trim().toLowerCase(), name, role: 'admin', active: true,
      perms: { viewAll: true, dashboard: true, export: true },
    });
    b.set(doc(db, 'meta', 'setup'), { adminUid: cred.user.uid, at: serverTimestamp() });
    await b.commit();
    // onAuthStateChanged fired before the profile existed — load it now.
    current = { uid: cred.user.uid, username: username.trim().toLowerCase(), name, role: 'admin', active: true, perms: { viewAll: true, dashboard: true, export: true } };
    firebaseApi._cb?.(current);
  }),
  onAuth(cb) {
    firebaseApi._cb = cb;
    onAuthStateChanged(auth, async (u) => {
      if (!u) { current = null; return cb(null); }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (!snap.exists()) { current = null; return; } // being bootstrapped
        const p = { uid: u.uid, ...snap.data() };
        if (!p.active) { await signOut(auth); current = null; return cb(null, 'هذا الحساب موقوف'); }
        current = p; cb(current);
      } catch (e) { current = null; cb(null, arErr(e).message); }
    });
  },
  login: wrap(async (username, password) => { await signInWithEmailAndPassword(auth, usernameToEmail(username), password); }),
  logout: wrap(async () => { await signOut(auth); }),
  changePassword: wrap(async (p) => { await updatePassword(auth.currentUser, p); }),
  getSettings: wrap(async () => {
    const s = await getDoc(doc(db, 'settings', 'main'));
    return withDefaults(s.exists() ? s.data() : null);
  }),
  saveSettings: wrap(async (s) => { await setDoc(doc(db, 'settings', 'main'), s); }),
  listOps: wrap(async ({ from, to } = {}) => {
    const all = current.role === 'admin' || current.perms?.viewAll;
    let q;
    if (all) {
      const c = [];
      if (from) c.push(where('date', '>=', from));
      if (to) c.push(where('date', '<=', to));
      q = query(collection(db, 'ops'), ...c);
    } else {
      q = query(collection(db, 'ops'), where('createdBy', '==', current.uid));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || '' }))
      .filter((o) => (!from || o.date >= from) && (!to || o.date <= to));
  }),
  addOp: wrap(async (op) => {
    const rec = { ...op, createdBy: current.uid, createdByName: current.name, createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, 'ops'), rec);
    return { ...rec, id: ref.id, createdAt: new Date().toISOString() };
  }),
  updateOp: wrap(async (id, patch) => {
    const { id: _i, createdAt, ...rest } = patch;
    await updateDoc(doc(db, 'ops', id), { ...rest, updatedAt: serverTimestamp(), updatedByName: current.name });
  }),
  deleteOp: wrap(async (id) => { await deleteDoc(doc(db, 'ops', id)); }),
  listUsers: wrap(async () => (await getDocs(collection(db, 'users'))).docs.map((d) => ({ uid: d.id, ...d.data() }))),
  createUser: wrap(async ({ username, password, name, role, perms }) => {
    // A second app instance creates the account without signing the admin out.
    const sec = initializeApp(firebaseConfig, 'sec-' + Date.now());
    try {
      const secAuth = getAuth(sec);
      const cred = await createUserWithEmailAndPassword(secAuth, usernameToEmail(username), password);
      await signOut(secAuth);
      await setDoc(doc(db, 'users', cred.user.uid), { username: username.trim().toLowerCase(), name, role, perms, active: true });
    } finally { await deleteApp(sec); }
  }),
  updateUser: wrap(async (uid, patch) => {
    if (uid === current.uid && ((patch.role && patch.role !== 'admin') || patch.active === false)) throw new Error('لا يمكنك إيقاف أو تخفيض حسابك أنت');
    await updateDoc(doc(db, 'users', uid), patch);
  }),
  listLearned: wrap(async () => (await getDocs(collection(db, 'learned'))).docs.map((d) => ({ id: d.id, ...d.data() }))),
  addLearned: async (items) => {
    for (const t of items) {
      try {
        await setDoc(doc(db, 'learned', learnedId(t)), { type: t.type, specialtyId: t.specialtyId, text: t.text, createdBy: current.uid, createdAt: serverTimestamp() });
      } catch { /* already exists (update not allowed) — fine */ }
    }
  },
  deleteLearned: wrap(async (id) => { await deleteDoc(doc(db, 'learned', id)); }),
};
