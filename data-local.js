// Demo backend: everything in this browser's localStorage. Mirrors the Firestore rules.
import { DEFAULT_SETTINGS, withDefaults, learnedId } from './logic.js';

const K = (k) => 'opsapp_demo_' + k;
const read = (k, d) => { try { const v = localStorage.getItem(K(k)); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(K(k), JSON.stringify(v));
const uid = () => Math.random().toString(36).slice(2, 12);

function seed() {
  if (read('users', null)) return;
  write('users', [{
    uid: 'admin', username: 'admin', password: 'admin123', name: 'مدير النظام', role: 'admin', active: true,
    perms: { viewAll: true, dashboard: true, export: true },
  }]);
  write('settings', structuredClone(DEFAULT_SETTINGS));
  write('ops', []);
  write('learned', []);
}

let current = null;
let listeners = [];
const emit = () => listeners.forEach((cb) => cb(current));
const need = (admin) => {
  if (!current) throw new Error('غير مسجل الدخول');
  if (admin && current.role !== 'admin') throw new Error('غير مسموح — للأدمن فقط');
};
const strip = (u) => { const { password, ...rest } = u; return rest; };

export const localApi = {
  mode: 'demo',
  async needsSetup() { seed(); return false; },
  async bootstrapAdmin() { throw new Error('غير مطلوب في وضع التجربة'); },
  onAuth(cb) {
    seed();
    listeners.push(cb);
    const sid = sessionStorage.getItem(K('session'));
    const u = read('users', []).find((x) => x.uid === sid && x.active);
    current = u ? strip(u) : null;
    setTimeout(() => cb(current), 0);
  },
  async login(username, password) {
    seed();
    const u = read('users', []).find((x) => x.username === username.trim().toLowerCase() && x.password === password);
    if (!u) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    if (!u.active) throw new Error('هذا الحساب موقوف');
    sessionStorage.setItem(K('session'), u.uid);
    current = strip(u); emit();
  },
  async logout() { sessionStorage.removeItem(K('session')); current = null; emit(); },
  async changePassword(p) {
    need();
    const users = read('users', []);
    users.find((x) => x.uid === current.uid).password = p;
    write('users', users);
  },
  async getSettings() { need(); return withDefaults(read('settings', null)); },
  async saveSettings(s) { need(true); write('settings', s); },
  async listOps({ from, to } = {}) {
    need();
    const all = read('ops', []);
    const mine = current.role === 'admin' || current.perms?.viewAll ? all : all.filter((o) => o.createdBy === current.uid);
    return mine.filter((o) => (!from || o.date >= from) && (!to || o.date <= to));
  },
  async addOp(op) {
    need();
    const ops = read('ops', []);
    const rec = { ...op, id: uid(), createdBy: current.uid, createdByName: current.name, createdAt: new Date().toISOString() };
    ops.push(rec); write('ops', ops); return rec;
  },
  async updateOp(id, patch) {
    need(true);
    const ops = read('ops', []);
    const i = ops.findIndex((o) => o.id === id);
    if (i < 0) throw new Error('السجل غير موجود');
    ops[i] = { ...ops[i], ...patch, updatedAt: new Date().toISOString(), updatedByName: current.name };
    write('ops', ops);
  },
  async deleteOp(id) { need(true); write('ops', read('ops', []).filter((o) => o.id !== id)); },
  async listUsers() { need(true); return read('users', []).map(strip); },
  async createUser({ username, password, name, role, perms }) {
    need(true);
    const users = read('users', []);
    const un = username.trim().toLowerCase();
    if (users.some((u) => u.username === un)) throw new Error('اسم المستخدم موجود بالفعل');
    users.push({ uid: uid(), username: un, password, name, role, perms, active: true });
    write('users', users);
  },
  async updateUser(id, patch) {
    need(true);
    if (id === current.uid && (patch.role && patch.role !== 'admin' || patch.active === false)) throw new Error('لا يمكنك إيقاف أو تخفيض حسابك أنت');
    const users = read('users', []);
    Object.assign(users.find((u) => u.uid === id), patch);
    write('users', users);
  },
  async listLearned() { need(); return read('learned', []); },
  async addLearned(items) {
    need();
    const l = read('learned', []);
    for (const t of items) {
      const id = learnedId(t);
      if (!l.some((x) => x.id === id)) l.push({ ...t, id, createdBy: current.uid });
    }
    write('learned', l);
  },
  async deleteLearned(id) { need(true); write('learned', read('learned', []).filter((x) => x.id !== id)); },
};
