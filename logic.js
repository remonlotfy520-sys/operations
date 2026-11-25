// Pure logic: defaults, validation, stats, filtering, suggestions.
// No DOM, no network — unit tested with `node --test tests/`.

export const DEFAULT_SETTINGS = {
  hospitalName: 'مستشفى الشيخ زايد آل نهيان',
  specialties: [
    { id: 'ortho', name: 'عظام' },
    { id: 'gen', name: 'جراحة عامة' },
    { id: 'gyn', name: 'نسا وتوليد' },
    { id: 'oph', name: 'رمد' },
    { id: 'uro', name: 'مسالك بولية' },
    { id: 'ent', name: 'أنف وأذن وحنجرة' },
    { id: 'gi', name: 'مناظير جهاز هضمي' },
  ],
  consultants: { ortho: [], gen: [], gyn: [], oph: [], uro: [], ent: [], gi: [] },
  diagnoses: {
    ortho: ['كسر عنق الفخذ', 'كسر جسم عظمة الفخذ', 'كسر الساق', 'كسر الكاحل', 'كسر الكعبرة', 'خشونة الركبة', 'خشونة الفخذ', 'قطع الرباط الصليبي الأمامي', 'قطع الغضروف الهلالي'],
    gen: ['التهاب الزائدة الدودية', 'حصوات المرارة', 'فتق إربي', 'فتق سري'],
    gyn: ['ولادة قيصرية', 'ورم ليفي بالرحم', 'كيس على المبيض'],
    oph: ['مياه بيضاء', 'مياه زرقاء'],
    uro: ['حصوة بالحالب', 'تضخم البروستاتا'],
    ent: ['تضخم اللوزتين', 'انحراف الحاجز الأنفي'],
    gi: ['نزيف جهاز هضمي علوي', 'دوالي المريء'],
  },
  procedures: {
    ortho: ['تثبيت داخلي بشريحة ومسامير', 'مسمار نخاعي', 'تغيير مفصل ركبة كلي', 'تغيير مفصل فخذ كلي', 'تغيير مفصل فخذ جزئي', 'منظار ركبة', 'إعادة بناء الرباط الصليبي', 'تثبيت خارجي', 'إزالة شرائح ومسامير'],
    gen: ['استئصال الزائدة الدودية', 'استئصال المرارة بالمنظار', 'إصلاح فتق بشبكة'],
    gyn: ['ولادة قيصرية', 'استئصال ورم ليفي', 'منظار رحمي'],
    oph: ['فاكو وزرع عدسة', 'عملية مياه زرقاء'],
    uro: ['منظار حالب وتفتيت', 'استئصال البروستاتا بالمنظار'],
    ent: ['استئصال اللوزتين', 'تعديل الحاجز الأنفي'],
    gi: ['منظار علوي', 'منظار سفلي', 'ربط دوالي المريء'],
  },
  categories: [
    { id: 'major', name: 'عمليات كبرى', rooms: ['غرفة 1', 'غرفة 2', 'غرفة 3'] },
    { id: 'third', name: 'عمليات الدور الثالث', rooms: ['نسا', 'رمد'] },
    { id: 'er', name: 'طوارئ', rooms: ['طوارئ', 'مناظير جهاز هضمي'] },
  ],
  anesthetists: [],
  anesthesiaTypes: ['كلي', 'نصفي', 'موضعي'],
  finance: [
    { name: 'نقدي', entities: false },
    { name: 'تأمين صحي', entities: false },
    { name: 'نفقة دولة', entities: false },
    { name: 'تعاقدات', entities: true },
  ],
  contractEntities: [],
  companies: [],
  supplyTypes: ['شرائح ومسامير', 'مفاصل'],
  locations: ['الدور الثالث', 'الدور الرابع اقتصادي', 'جراحة', 'طوارئ', 'رعاية'],
  postponeReasons: ['عدم لياقة المريض', 'عدم توفر مستلزمات', 'عدم توفر سرير رعاية', 'رفض المريض', 'ضيق الوقت'],
};

/** Fill any missing keys of a stored settings object from the defaults. */
export function withDefaults(s) {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (!s) return out;
  for (const k of Object.keys(s)) out[k] = s[k];
  for (const sp of out.specialties) {
    for (const key of ['consultants', 'diagnoses', 'procedures']) {
      if (!out[key][sp.id]) out[key][sp.id] = [];
    }
  }
  return out;
}

/** Arabic-aware normalisation for matching / de-duplication. */
export function normalizeTerm(s) {
  return String(s ?? '')
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Unique list (first spelling wins) by normalised key, empty entries dropped. */
export function uniqueTerms(list) {
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const clean = String(t ?? '').replace(/\s+/g, ' ').trim();
    const k = normalizeTerm(clean);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(clean);
  }
  return out;
}

/** Type-ahead suggestions: prefix matches first, then contains; excludes already picked. */
export function suggest(list, q, limit = 8, exclude = []) {
  const nq = normalizeTerm(q);
  const ex = new Set(exclude.map(normalizeTerm));
  const pool = uniqueTerms(list).filter((t) => !ex.has(normalizeTerm(t)));
  if (!nq) return pool.slice(0, limit);
  const starts = [], contains = [];
  for (const t of pool) {
    const n = normalizeTerm(t);
    if (n.startsWith(nq)) starts.push(t);
    else if (n.includes(nq)) contains.push(t);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Returns Arabic error messages; empty array = valid. */
export function validateOp(op, settings) {
  const e = [];
  const s = withDefaults(settings);
  if (!op.date) e.push('اختر اليوم');
  if (!op.time) e.push('اختر الوقت');
  if (!String(op.patientName || '').trim()) e.push('اكتب اسم المريض');
  if (!String(op.mrn || '').trim()) e.push('اكتب الرقم الطبي');
  if (!op.specialtyId) e.push('اختر التخصص');
  if (!op.consultant) e.push('اختر الاستشاري');
  if (!op.diagnoses || op.diagnoses.length === 0) e.push('أضف تشخيصًا واحدًا على الأقل');
  if (!op.procedures || op.procedures.length === 0) e.push('أضف عملية واحدة على الأقل');
  const cat = s.categories.find((c) => c.id === op.categoryId);
  if (!cat) e.push('اختر نوع العمليات (كبرى / الدور الثالث / طوارئ)');
  else if (!cat.rooms.includes(op.room)) e.push('اختر رقم الغرفة');
  if (!op.anesthesiaType) e.push('اختر نوع التخدير');
  if (!op.finance) e.push('اختر المعاملة المالية');
  const fin = s.finance.find((f) => f.name === op.finance);
  if (fin && fin.entities && !op.contractEntity) e.push('اختر جهة التعاقد');
  if (op.externalCompany && !op.company) e.push('اختر اسم الشركة الخارجية');
  if (op.status !== 'done' && op.status !== 'postponed') e.push('حدد: تمت أم تأجيل');
  if (op.status === 'postponed' && !String(op.postponeReason || '').trim()) e.push('اكتب سبب التأجيل');
  return e;
}

/** Remove fields that no longer apply (e.g. company when externalCompany=false). */
export function cleanOp(op, settings) {
  const s = withDefaults(settings);
  const o = { ...op };
  o.patientName = String(o.patientName || '').replace(/\s+/g, ' ').trim();
  o.mrn = String(o.mrn || '').trim();
  o.diagnoses = uniqueTerms(o.diagnoses || []);
  o.procedures = uniqueTerms(o.procedures || []);
  o.specialty = s.specialties.find((x) => x.id === o.specialtyId)?.name || o.specialty || '';
  o.category = s.categories.find((x) => x.id === o.categoryId)?.name || o.category || '';
  if (!o.externalCompany) { o.company = ''; o.supplyType = ''; }
  const fin = s.finance.find((f) => f.name === o.finance);
  if (!fin || !fin.entities) o.contractEntity = '';
  if (o.status !== 'postponed') o.postponeReason = '';
  o.waitingList = !!o.waitingList;
  o.externalCompany = !!o.externalCompany;
  o.notes = String(o.notes || '').trim();
  return o;
}

function count(ops, keyFn) {
  const m = new Map();
  for (const o of ops) {
    const keys = [].concat(keyFn(o)).filter((k) => k !== undefined && k !== null && k !== '');
    for (const k of keys) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'ar'));
}

export function computeStats(ops) {
  const total = ops.length;
  const postponed = ops.filter((o) => o.status === 'postponed').length;
  const done = ops.filter((o) => o.status === 'done').length;
  const done_ = ops.filter((o) => o.status === 'done');
  const byDay = count(ops, (o) => o.date).sort((a, b) => a[0].localeCompare(b[0]));
  const byMonth = count(ops, (o) => (o.date || '').slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    total,
    done,
    postponed,
    postponeRate: total ? Math.round((postponed / total) * 1000) / 10 : 0,
    waitingList: ops.filter((o) => o.waitingList).length,
    externalCompany: ops.filter((o) => o.externalCompany).length,
    days: byDay.length,
    byDay,
    byMonth,
    bySpecialty: count(done_, (o) => o.specialty),
    byConsultant: count(done_, (o) => o.consultant),
    byRoom: count(done_, (o) => o.room),
    byCategory: count(done_, (o) => o.category),
    byAnesthesia: count(done_, (o) => o.anesthesiaType),
    byAnesthetist: count(done_, (o) => o.anesthetist),
    byFinance: count(done_, (o) => o.finance),
    byContract: count(done_, (o) => o.contractEntity),
    byCompany: count(done_.filter((o) => o.externalCompany), (o) => o.company),
    bySupply: count(done_.filter((o) => o.externalCompany), (o) => o.supplyType),
    byProcedure: count(done_, (o) => o.procedures || []),
    byDiagnosis: count(done_, (o) => o.diagnoses || []),
    postponeReasons: count(ops.filter((o) => o.status === 'postponed'), (o) => o.postponeReason),
    postponedBySpecialty: count(ops.filter((o) => o.status === 'postponed'), (o) => o.specialty),
  };
}

export function filterOps(ops, f = {}) {
  const q = normalizeTerm(f.q);
  return ops.filter((o) => {
    if (f.from && o.date < f.from) return false;
    if (f.to && o.date > f.to) return false;
    if (f.specialtyId && o.specialtyId !== f.specialtyId) return false;
    if (f.consultant && o.consultant !== f.consultant) return false;
    if (f.categoryId && o.categoryId !== f.categoryId) return false;
    if (f.status && o.status !== f.status) return false;
    if (f.finance && o.finance !== f.finance) return false;
    if (q) {
      const hay = normalizeTerm([o.patientName, o.mrn, o.consultant, ...(o.diagnoses || []), ...(o.procedures || [])].join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

/** New diagnoses/procedures in op that are not already known for its specialty. */
export function newTerms(op, settings, learned) {
  const s = withDefaults(settings);
  const out = [];
  for (const [type, key] of [['dx', 'diagnoses'], ['op', 'procedures']]) {
    const known = new Set([
      ...(s[key][op.specialtyId] || []),
      ...learned.filter((l) => l.type === type && l.specialtyId === op.specialtyId).map((l) => l.text),
    ].map(normalizeTerm));
    for (const t of op[key] || []) {
      const n = normalizeTerm(t);
      if (n && !known.has(n)) { known.add(n); out.push({ type, specialtyId: op.specialtyId, text: t }); }
    }
  }
  return out;
}

/** Stable id for a learned term so the same term is never stored twice. */
export function learnedId(t) {
  const str = `${t.type}|${t.specialtyId}|${normalizeTerm(t.text)}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return `${t.type}_${t.specialtyId}_${h.toString(36)}`;
}

export function todayISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function slugId(prefix = 'x') {
  return prefix + '_' + Math.random().toString(36).slice(2, 8);
}

/** Flatten ops into rows for Excel/print. */
export const EXPORT_COLUMNS = [
  ['date', 'اليوم'], ['time', 'الوقت'], ['patientName', 'اسم المريض'], ['mrn', 'الرقم الطبي'],
  ['specialty', 'التخصص'], ['consultant', 'الاستشاري'], ['anesthetist', 'طبيب التخدير'],
  ['diagnoses', 'التشخيص'], ['procedures', 'العملية'], ['category', 'نوع العمليات'], ['room', 'الغرفة'],
  ['anesthesiaType', 'نوع التخدير'], ['externalCompany', 'شركة خارجية'], ['company', 'اسم الشركة'],
  ['supplyType', 'نوع المستلزم'], ['waitingList', 'قوائم انتظار'], ['finance', 'المعاملة المالية'],
  ['contractEntity', 'جهة التعاقد'], ['from', 'قادم من'], ['to', 'خروج إلى'], ['status', 'الحالة'],
  ['postponeReason', 'سبب التأجيل'], ['notes', 'ملاحظات'], ['createdByName', 'سجّلها'],
];

export function toRow(o) {
  const r = {};
  for (const [k, label] of EXPORT_COLUMNS) {
    let v = o[k];
    if (Array.isArray(v)) v = v.join(' + ');
    if (k === 'externalCompany' || k === 'waitingList') v = v ? 'نعم' : 'لا';
    if (k === 'status') v = v === 'done' ? 'تمت' : v === 'postponed' ? 'تأجيل' : '';
    r[label] = v ?? '';
  }
  return r;
}
