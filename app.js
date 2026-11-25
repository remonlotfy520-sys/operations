import { loadApi } from './data.js';
import * as L from './logic.js';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
let toastT;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 4500 : 2200);
}
function modal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const monthStart = () => L.todayISO().slice(0, 8) + '01';
const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label ?? v)}</option>`;
const can = (p) => user && (user.role === 'admin' || !!user.perms?.[p]);
const isAdmin = () => user?.role === 'admin';

// ---------- state ----------
let api, user = null, settings = L.withDefaults(null), learned = [];
let view = 'entry';
let form, editingId = null, formErrors = [], saving = false, focusTag = null;
const tagDraft = { diagnoses: '', procedures: '' };
const listF = { from: monthStart(), to: L.todayISO(), specialtyId: '', categoryId: '', status: '', finance: '', q: '' };
let listOps = [];
let dailyDate = L.todayISO();
const dashF = { preset: 'month', from: monthStart(), to: L.todayISO(), specialtyId: '' };

function blankForm(keep = {}) {
  if (typeof tagDraft !== 'undefined') { tagDraft.diagnoses = ''; tagDraft.procedures = ''; }
  return {
    date: keep.date || L.todayISO(), time: nowTime(), patientName: '', mrn: '', specialtyId: '', consultant: '',
    anesthetist: '', diagnoses: [], procedures: [], categoryId: '', room: '', anesthesiaType: '',
    externalCompany: false, company: '', supplyType: '', waitingList: false, finance: '', contractEntity: '',
    from: '', to: '', notes: '', status: 'done', postponeReason: '',
  };
}
form = blankForm();

// ---------- boot ----------
(async function boot() {
  try { api = await loadApi(); } catch (e) { app.innerHTML = `<div class="login"><div class="card errors">تعذر تحميل البرنامج: ${esc(e.message)}</div></div>`; return; }
  api.onAuth(async (u, err) => {
    user = u;
    if (!u) return renderLogin(err);
    try {
      [settings, learned] = await Promise.all([api.getSettings(), api.listLearned()]);
    } catch (e) { toast(e.message, true); }
    if (view === 'settings' && !isAdmin()) view = 'entry';
    renderShell();
  });
})();

// ---------- login ----------
async function renderLogin(err) {
  let setup = false;
  try { setup = await api.needsSetup(); } catch { /* offline */ }
  app.innerHTML = `
  ${api.mode === 'demo' ? '<div class="demo-bar">وضع التجربة — البيانات محفوظة على هذا الجهاز فقط. الدخول: admin / admin123</div>' : ''}
  <div class="login"><div class="card">
    <h2>إدارة العمليات</h2>
    <div class="sub">${esc(settings.hospitalName)}</div>
    ${err ? `<div class="errors" style="margin-top:12px">${esc(err)}</div>` : ''}
    ${setup ? `
      <p class="hint" style="margin-top:12px">أول تشغيل: أنشئ حساب الأدمن الرئيسي.</p>
      <form id="setup-form">
        <div class="field"><label>الاسم</label><input type="text" name="name" required></div>
        <div class="field"><label>اسم المستخدم</label><input type="text" name="username" required autocomplete="username"></div>
        <div class="field"><label>كلمة المرور (6 أحرف على الأقل)</label><input type="password" name="password" required minlength="6" autocomplete="new-password"></div>
        <button class="btn">إنشاء حساب الأدمن</button>
      </form>` : `
      <form id="login-form">
        <div class="field"><label>اسم المستخدم</label><input type="text" name="username" required autocomplete="username" autocapitalize="off"></div>
        <div class="field"><label>كلمة المرور</label><input type="password" name="password" required autocomplete="current-password"></div>
        <button class="btn">دخول</button>
      </form>`}
  </div></div>`;
  const f = $('#login-form') || $('#setup-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const b = f.querySelector('button'); b.disabled = true;
    try {
      if (setup) await api.bootstrapAdmin(d); else await api.login(d.username, d.password);
    } catch (ex) { toast(ex.message, true); b.disabled = false; }
  });
}

// ---------- shell ----------
function tabs() {
  const t = [['entry', editingId ? 'تعديل عملية' : 'تسجيل عملية'], ['list', 'القائمة'], ['daily', 'لستة اليوم']];
  if (can('dashboard')) t.push(['dash', 'الإحصائيات']);
  if (isAdmin()) t.push(['settings', 'الإعدادات']);
  return t;
}
function renderShell() {
  app.innerHTML = `
  ${api.mode === 'demo' ? '<div class="demo-bar">وضع التجربة — البيانات على هذا الجهاز فقط (لم يتم ربط Firebase بعد)</div>' : ''}
  <header class="top">
    <div class="top-row">
      <h1>إدارة العمليات <span class="sub" style="color:#cfe6ee">${esc(settings.hospitalName)}</span></h1>
      <span class="who">${esc(user.name)}${isAdmin() ? ' (أدمن)' : ''}</span>
      <button class="ghost" data-act="pwd">كلمة المرور</button>
      <button class="ghost" data-act="logout">خروج</button>
    </div>
    <nav class="tabs" id="tabs"></nav>
  </header>
  <main id="view"></main>`;
  go(view);
}
function renderTabs() {
  $('#tabs').innerHTML = tabs().map(([k, l]) => `<button data-go="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('');
}
async function go(v) {
  if (v !== 'entry' && editingId) { editingId = null; form = blankForm(); formErrors = []; }
  view = v; renderTabs();
  const el = $('#view');
  if (v === 'entry') renderEntry();
  else if (v === 'list') { el.innerHTML = '<div class="loading">جاري التحميل…</div>'; await loadList(); renderList(); }
  else if (v === 'daily') { el.innerHTML = '<div class="loading">جاري التحميل…</div>'; await renderDaily(); }
  else if (v === 'dash') { el.innerHTML = '<div class="loading">جاري التحميل…</div>'; await renderDash(); }
  else if (v === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

// ---------- entry form ----------
const spec = () => settings.specialties.find((s) => s.id === form.specialtyId);
const cat = () => settings.categories.find((c) => c.id === form.categoryId);
const finObj = () => settings.finance.find((f) => f.name === form.finance);

function chips(field, options, extraCls = () => '') {
  return `<div class="chips">${options.map(([v, label]) => {
    const on = String(form[field]) === String(v);
    return `<button type="button" class="chip ${on ? 'on ' + extraCls(v) : ''}" data-chip="${field}" data-val="${esc(v)}">${esc(label)}</button>`;
  }).join('')}</div>`;
}
function select(field, list, placeholder = '— اختر —') {
  const vals = list.includes(form[field]) || !form[field] ? list : [form[field], ...list];
  return `<select data-field="${field}">${opt('', placeholder, !form[field])}${vals.map((v) => opt(v, v, v === form[field])).join('')}</select>`;
}
function tagBox(key, label) {
  const disabled = !form.specialtyId;
  return `<div class="field tags" data-tagbox="${key}">
    <label class="req">${label}</label>
    <div class="tag-list">${form[key].map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-untag="${key}" data-i="${i}" aria-label="حذف">×</button></span>`).join('')}</div>
    <div class="tag-row">
      <input type="text" data-tag="${key}" value="${esc(tagDraft[key])}" placeholder="${disabled ? 'اختر التخصص أولًا' : 'اكتب للبحث أو إضافة جديد…'}" ${disabled ? 'disabled' : ''} autocomplete="off">
      <button type="button" class="btn sec sm" data-addtag="${key}" ${disabled ? 'disabled' : ''}>إضافة</button>
    </div>
    <div class="sugg" hidden></div>
    ${form[key].length ? '' : `<span class="hint">يمكن إضافة أكثر من ${key === 'diagnoses' ? 'تشخيص' : 'عملية'}</span>`}
  </div>`;
}
function termPool(key) {
  const type = key === 'diagnoses' ? 'dx' : 'op';
  return [...(settings[key][form.specialtyId] || []), ...learned.filter((l) => l.type === type && l.specialtyId === form.specialtyId).map((l) => l.text)];
}

function renderEntry() {
  const s = spec(), c = cat(), f = finObj();
  // once errors are showing, keep them in sync with what's still missing
  if (formErrors.length) formErrors = L.validateOp(L.cleanOp(form, settings), settings);
  $('#view').innerHTML = `
  ${editingId ? `<div class="card" style="background:var(--warn-bg)"><b>تعديل سجل:</b> ${esc(form.patientName)} — ${fmtDate(form.date)}</div>` : ''}
  ${formErrors.length ? `<div class="errors"><b>استكمل البيانات التالية:</b><ul>${formErrors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><h3>المريض</h3><div class="grid">
    <div class="field"><label class="req">اليوم</label><input type="date" data-field="date" value="${esc(form.date)}"></div>
    <div class="field"><label class="req">الوقت</label><input type="time" data-field="time" value="${esc(form.time)}"></div>
    <div class="field"><label class="req">اسم المريض</label><input type="text" data-field="patientName" value="${esc(form.patientName)}"></div>
    <div class="field"><label class="req">الرقم الطبي</label><input type="text" inputmode="numeric" data-field="mrn" value="${esc(form.mrn)}"></div>
  </div></div>

  <div class="card"><h3>التخصص والفريق</h3>
    <div class="field"><label class="req">التخصص</label>${chips('specialtyId', settings.specialties.map((x) => [x.id, x.name]))}</div>
    <div class="grid" style="margin-top:12px">
      <div class="field"><label class="req">الاستشاري</label>${s ? select('consultant', settings.consultants[s.id] || []) : '<select disabled><option>اختر التخصص أولًا</option></select>'}
        ${s && !(settings.consultants[s.id] || []).length ? '<span class="hint">لا يوجد استشاريين لهذا التخصص — أضفهم من الإعدادات</span>' : ''}</div>
      <div class="field"><label>طبيب التخدير</label>${select('anesthetist', settings.anesthetists)}</div>
    </div>
  </div>

  <div class="card"><h3>التشخيص والعملية</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
    ${tagBox('diagnoses', 'التشخيص')}
    ${tagBox('procedures', 'نوع العملية')}
  </div></div>

  <div class="card"><h3>العمليات والغرفة والتخدير</h3>
    <div class="field"><label class="req">العمليات</label>${chips('categoryId', settings.categories.map((x) => [x.id, x.name]))}</div>
    <div class="field" style="margin-top:12px"><label class="req">رقم الغرفة</label>${c ? chips('room', c.rooms.map((r) => [r, r])) : '<span class="hint">اختر نوع العمليات أولًا</span>'}</div>
    <div class="field" style="margin-top:12px"><label class="req">نوع التخدير</label>${chips('anesthesiaType', settings.anesthesiaTypes.map((x) => [x, x]))}</div>
  </div>

  <div class="card"><h3>المعاملة والمستلزمات</h3>
    <div class="field"><label class="req">المعاملة المالية</label>${chips('finance', settings.finance.map((x) => [x.name, x.name]))}</div>
    ${f?.entities ? `<div class="field" style="margin-top:12px;max-width:420px"><label class="req">جهة التعاقد</label>${select('contractEntity', settings.contractEntities)}</div>` : ''}
    <div class="grid" style="margin-top:12px">
      <div class="field"><label>شركة خارجية</label>${chips('externalCompany', [[true, 'نعم'], [false, 'لا']])}</div>
      <div class="field"><label>قوائم انتظار</label>${chips('waitingList', [[true, 'نعم'], [false, 'لا']])}</div>
    </div>
    ${form.externalCompany ? `<div class="grid" style="margin-top:12px">
      <div class="field"><label class="req">اسم الشركة</label>${select('company', settings.companies)}</div>
      <div class="field"><label>نوع المستلزم</label>${chips('supplyType', settings.supplyTypes.map((x) => [x, x]))}</div>
    </div>` : ''}
  </div>

  <div class="card"><h3>الحركة والحالة</h3>
    <div class="grid">
      <div class="field"><label>قادم من</label>${select('from', settings.locations)}</div>
      <div class="field"><label>خروج إلى</label>${select('to', settings.locations)}</div>
    </div>
    <div class="field" style="margin-top:12px"><label class="req">الحالة</label>${chips('status', [['done', 'تمت'], ['postponed', 'تأجيل']], (v) => (v === 'done' ? 'ok' : 'bad'))}</div>
    ${form.status === 'postponed' ? `<div class="field" style="margin-top:12px;max-width:520px"><label class="req">سبب التأجيل</label>
      <input type="text" data-field="postponeReason" list="pp-reasons" value="${esc(form.postponeReason)}" placeholder="اختر أو اكتب السبب">
      <datalist id="pp-reasons">${settings.postponeReasons.map((r) => opt(r)).join('')}</datalist>
      ${chips('postponeReason', settings.postponeReasons.map((r) => [r, r]))}</div>` : ''}
    <div class="field" style="margin-top:12px"><label>ملاحظات</label><textarea data-field="notes">${esc(form.notes)}</textarea></div>
  </div>

  <div class="save-bar">
    <button class="btn" data-act="save" ${saving ? 'disabled' : ''}>${editingId ? 'حفظ التعديل' : 'حفظ العملية'}</button>
    ${editingId ? '<button class="btn sec" data-act="cancel-edit">إلغاء</button>' : '<button class="btn sec" data-act="clear" style="flex:0 0 auto">مسح الخانات</button>'}
  </div>`;
  if (focusTag) { const i = $(`[data-tag="${focusTag}"]`); if (i) i.focus(); focusTag = null; }
}

function setChip(field, raw) {
  let v = raw;
  if (field === 'externalCompany' || field === 'waitingList') v = raw === 'true';
  const prev = form[field];
  if (field === 'supplyType' && prev === v) v = ''; // tap again to unselect
  form[field] = v;
  if (field === 'specialtyId' && prev !== v) { form.consultant = ''; form.diagnoses = []; form.procedures = []; tagDraft.diagnoses = ''; tagDraft.procedures = ''; }
  if (field === 'categoryId' && prev !== v) { const c = cat(); form.room = c && c.rooms.length === 1 ? c.rooms[0] : ''; }
  if (field === 'finance' && prev !== v) form.contractEntity = '';
  if (field === 'externalCompany' && !v) { form.company = ''; form.supplyType = ''; }
  if (field === 'status' && v === 'done') form.postponeReason = '';
  renderEntry();
}

function addTag(key, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return;
  // reuse existing spelling if the term is already known
  const known = termPool(key).find((x) => L.normalizeTerm(x) === L.normalizeTerm(t));
  form[key] = L.uniqueTerms([...form[key], known || t]);
  tagDraft[key] = '';
  focusTag = key;
  renderEntry();
}

function showSugg(input) {
  const key = input.dataset.tag;
  const box = input.closest('.tags').querySelector('.sugg');
  const q = input.value;
  const list = L.suggest(termPool(key), q, 10, form[key]);
  const exact = list.some((x) => L.normalizeTerm(x) === L.normalizeTerm(q));
  let html = list.map((x) => `<button type="button" data-sugg="${key}" data-val="${esc(x)}">${esc(x)}</button>`).join('');
  if (q.trim() && !exact) html += `<button type="button" class="new" data-sugg="${key}" data-val="${esc(q.trim())}">+ إضافة "${esc(q.trim())}" كجديد</button>`;
  box.innerHTML = html;
  box.hidden = !html;
}

function flushPendingTags() {
  for (const key of ['diagnoses', 'procedures']) {
    const t = tagDraft[key].trim();
    if (t && form.specialtyId) {
      const known = termPool(key).find((x) => L.normalizeTerm(x) === L.normalizeTerm(t));
      form[key] = L.uniqueTerms([...form[key], known || t]);
    }
    tagDraft[key] = '';
  }
}

async function saveForm() {
  if (saving) return;
  flushPendingTags();
  const clean = L.cleanOp(form, settings);
  formErrors = L.validateOp(clean, settings);
  if (formErrors.length) { renderEntry(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  saving = true; renderEntry();
  try {
    if (editingId) await api.updateOp(editingId, clean);
    else await api.addOp(clean);
    const nt = L.newTerms(clean, settings, learned);
    if (nt.length) {
      await api.addLearned(nt);
      learned.push(...nt.map((t) => ({ ...t, id: L.learnedId(t) })));
    }
    const wasEdit = !!editingId;
    toast(wasEdit ? 'تم حفظ التعديل' : `تم حفظ عملية ${clean.patientName}`);
    editingId = null; formErrors = []; form = blankForm({ date: clean.date });
    saving = false;
    if (wasEdit) return go('list');
    renderTabs(); renderEntry(); window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { saving = false; renderEntry(); toast(e.message, true); }
}

// ---------- list ----------
async function loadList() {
  try { listOps = await api.listOps({ from: listF.from, to: listF.to }); } catch (e) { listOps = []; toast(e.message, true); }
}
function filteredList() { return L.filterOps(listOps, listF); }
const badge = (o) => (o.status === 'done' ? '<span class="badge ok">تمت</span>' : '<span class="badge bad">تأجيل</span>');

function renderList() {
  const rows = filteredList();
  const st = L.computeStats(rows);
  const consultants = listF.specialtyId ? settings.consultants[listF.specialtyId] || [] : [];
  $('#view').innerHTML = `
  <div class="card">
    <div class="filters">
      <div class="field"><label>من</label><input type="date" data-lf="from" value="${listF.from}"></div>
      <div class="field"><label>إلى</label><input type="date" data-lf="to" value="${listF.to}"></div>
      <div class="field"><label>التخصص</label><select data-lf="specialtyId">${opt('', 'الكل')}${settings.specialties.map((s) => opt(s.id, s.name, s.id === listF.specialtyId)).join('')}</select></div>
      ${consultants.length ? `<div class="field"><label>الاستشاري</label><select data-lf="consultant">${opt('', 'الكل')}${consultants.map((c) => opt(c, c, c === listF.consultant)).join('')}</select></div>` : ''}
      <div class="field"><label>العمليات</label><select data-lf="categoryId">${opt('', 'الكل')}${settings.categories.map((c) => opt(c.id, c.name, c.id === listF.categoryId)).join('')}</select></div>
      <div class="field"><label>الحالة</label><select data-lf="status">${opt('', 'الكل')}${opt('done', 'تمت', listF.status === 'done')}${opt('postponed', 'تأجيل', listF.status === 'postponed')}</select></div>
      <div class="field"><label>المعاملة</label><select data-lf="finance">${opt('', 'الكل')}${settings.finance.map((f) => opt(f.name, f.name, f.name === listF.finance)).join('')}</select></div>
      <div class="field"><label>بحث</label><input type="search" data-lf="q" value="${esc(listF.q)}" placeholder="اسم / رقم طبي / عملية"></div>
    </div>
    <div class="actions" style="margin-top:12px;justify-content:space-between">
      <span><b>${st.total}</b> سجل — تمت ${st.done} — تأجيل ${st.postponed}</span>
      ${can('export') ? `<span class="actions"><button class="btn sec sm" data-act="xlsx">تصدير Excel</button><button class="btn sec sm" data-act="pdf">PDF / طباعة</button></span>` : ''}
    </div>
  </div>
  <div class="card">
    ${rows.length ? `
    <div class="table-wrap resp"><table>
      <thead><tr><th>اليوم</th><th>المريض</th><th>التخصص / الاستشاري</th><th>التشخيص</th><th>العملية</th><th>الغرفة</th><th>المعاملة</th><th>الحالة</th></tr></thead>
      <tbody>${rows.map((o) => `<tr data-open="${o.id}">
        <td>${fmtDate(o.date)}<div class="sub">${esc(o.time)}</div></td>
        <td>${esc(o.patientName)}<div class="sub">${esc(o.mrn)}</div></td>
        <td>${esc(o.specialty)}<div class="sub">${esc(o.consultant)}</div></td>
        <td>${esc((o.diagnoses || []).join('، '))}</td>
        <td>${esc((o.procedures || []).join('، '))}</td>
        <td>${esc(o.room)}<div class="sub">${esc(o.category)}</div></td>
        <td>${esc(o.finance)}${o.contractEntity ? `<div class="sub">${esc(o.contractEntity)}</div>` : ''}</td>
        <td>${badge(o)}</td></tr>`).join('')}</tbody></table></div>
    <div class="cards-m">${rows.map((o) => `<div class="op-card" data-open="${o.id}">
      <div class="r1"><span>${esc(o.patientName)}</span>${badge(o)}</div>
      <div class="sub">${fmtDate(o.date)} ${esc(o.time)} — ${esc(o.mrn)}</div>
      <div>${esc(o.specialty)} — ${esc(o.consultant)}</div>
      <div class="sub">${esc((o.procedures || []).join('، '))} — ${esc(o.room)}</div></div>`).join('')}</div>`
    : '<div class="empty">لا توجد سجلات في هذه الفترة</div>'}
  </div>`;
}

function opDetails(o) {
  const row = L.toRow(o);
  return `<div class="details"><h3 style="margin-top:0">${esc(o.patientName)}</h3><dl>
    ${Object.entries(row).filter(([, v]) => v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
    ${o.updatedByName ? `<dt>آخر تعديل</dt><dd>${esc(o.updatedByName)}</dd>` : ''}
  </dl>
  ${isAdmin() ? `<div class="actions" style="margin-top:16px">
    <button class="btn" data-edit="${o.id}">تعديل</button>
    <button class="btn danger" data-del="${o.id}">حذف</button></div>` : '<p class="hint" style="margin-top:14px">التعديل والحذف للأدمن فقط.</p>'}</div>`;
}

// ---------- exports ----------
let xlsxLoading;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  xlsxLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = () => { xlsxLoading = null; rej(new Error('تعذر تحميل مكتبة Excel — تأكد من الإنترنت')); };
    document.head.appendChild(s);
  });
  return xlsxLoading;
}
async function exportXlsx(rows, name) {
  try {
    await loadXLSX();
    const X = window.XLSX;
    const ws = X.utils.json_to_sheet(rows.map(L.toRow), { header: L.EXPORT_COLUMNS.map((c) => c[1]) });
    ws['!cols'] = L.EXPORT_COLUMNS.map(([k]) => ({ wch: ['diagnoses', 'procedures', 'notes', 'patientName'].includes(k) ? 30 : 14 }));
    const wb = X.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    X.utils.book_append_sheet(wb, ws, 'العمليات');
    X.writeFile(wb, `${name}.xlsx`);
  } catch (e) { toast(e.message, true); }
}
function printTable(title, meta, rows, cols) {
  $('#print').innerHTML = `<h2>${esc(title)}</h2><div class="meta">${meta}</div>
    <table><thead><tr>${cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((o) => { const r = L.toRow(o); return `<tr>${cols.map((c) => `<td>${esc(c[0] === '#' ? '' : r[c[1]])}</td>`).join('')}</tr>`; }).join('')}</tbody></table>`;
  setTimeout(() => window.print(), 50);
}

// ---------- daily list ----------
async function renderDaily() {
  let ops = [];
  try { ops = await api.listOps({ from: dailyDate, to: dailyDate }); } catch (e) { toast(e.message, true); }
  ops.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const groups = [];
  for (const c of settings.categories) {
    for (const r of c.rooms) {
      const g = ops.filter((o) => o.categoryId === c.id && o.room === r);
      if (g.length) groups.push({ title: `${c.name} — ${r}`, ops: g });
    }
  }
  const rest = ops.filter((o) => !groups.some((g) => g.ops.includes(o)));
  if (rest.length) groups.push({ title: 'أخرى', ops: rest });
  const st = L.computeStats(ops);
  const table = (g) => `<table><thead><tr><th>م</th><th>الوقت</th><th>اسم المريض</th><th>الرقم الطبي</th><th>التخصص</th><th>الاستشاري</th><th>التشخيص</th><th>العملية</th><th>التخدير</th><th>المعاملة</th><th>الحالة</th></tr></thead>
    <tbody>${g.ops.map((o, i) => `<tr data-open="${o.id}"><td>${i + 1}</td><td>${esc(o.time)}</td><td>${esc(o.patientName)}</td><td>${esc(o.mrn)}</td><td>${esc(o.specialty)}</td><td>${esc(o.consultant)}</td><td>${esc((o.diagnoses || []).join('، '))}</td><td>${esc((o.procedures || []).join('، '))}</td><td>${esc(o.anesthesiaType)}</td><td>${esc(o.finance)}</td><td>${o.status === 'done' ? 'تمت' : 'تأجيل' + (o.postponeReason ? ' — ' + esc(o.postponeReason) : '')}</td></tr>`).join('')}</tbody></table>`;
  const summary = `العدد: ${st.total} — تمت: ${st.done} — تأجيل: ${st.postponed}`;
  $('#view').innerHTML = `
  <div class="card actions" style="justify-content:space-between">
    <div class="actions"><div class="field"><label>اليوم</label><input type="date" id="daily-date" value="${dailyDate}"></div></div>
    <div class="actions"><b>${summary}</b>
      ${ops.length ? `<button class="btn sm" data-act="print-daily">طباعة / PDF</button>${can('export') ? '<button class="btn sec sm" data-act="xlsx-daily">Excel</button>' : ''}` : ''}</div>
  </div>
  <p class="hint">شكل اللستة ومكوناتها سيتم تحديدها لاحقًا — هذا شكل مبدئي.</p>
  ${groups.length ? groups.map((g) => `<div class="card"><h3>${esc(g.title)} (${g.ops.length})</h3><div class="table-wrap">${table(g)}</div></div>`).join('') : '<div class="card empty">لا توجد عمليات مسجلة في هذا اليوم</div>'}`;
  $('#daily-date').onchange = (e) => { dailyDate = e.target.value || L.todayISO(); renderDaily(); };
  renderDaily.print = () => {
    $('#print').innerHTML = `<h2>لستة العمليات اليومية — ${esc(settings.hospitalName)}</h2><div class="meta">${fmtDate(dailyDate)} — ${summary}</div>
      ${groups.map((g) => `<h3>${esc(g.title)}</h3>${table(g)}`).join('')}`;
    setTimeout(() => window.print(), 50);
  };
  renderDaily.ops = ops;
}

// ---------- dashboard ----------
function presetRange(p) {
  const t = new Date(); const iso = L.todayISO;
  if (p === 'today') return [iso(t), iso(t)];
  if (p === 'week') { const d = new Date(t); d.setDate(d.getDate() - 6); return [iso(d), iso(t)]; }
  if (p === 'month') return [monthStart(), iso(t)];
  if (p === 'last30') { const d = new Date(t); d.setDate(d.getDate() - 29); return [iso(d), iso(t)]; }
  if (p === 'year') return [`${t.getFullYear()}-01-01`, iso(t)];
  return [dashF.from, dashF.to];
}
function bars(title, data, limit = 12) {
  if (!data.length) return `<div class="card"><h3>${title}</h3><div class="empty" style="padding:14px">لا توجد بيانات</div></div>`;
  const shown = data.slice(0, limit);
  const rest = data.slice(limit).reduce((s, [, n]) => s + n, 0);
  if (rest) shown.push(['أخرى', rest]);
  const max = Math.max(...shown.map((d) => d[1]));
  const total = data.reduce((s, [, n]) => s + n, 0);
  return `<div class="card"><h3>${title}</h3><div class="bars">${shown.map(([k, n]) => `
    <div class="bar-row" title="${esc(k)}: ${n} (${Math.round((n / total) * 100)}%)"><span class="n">${esc(k)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(n / max) * 100}%;display:block"></span></span><span class="c">${n}</span></div>`).join('')}
  </div></div>`;
}
function trend(st, from, to) {
  const days = (new Date(to) - new Date(from)) / 864e5 + 1;
  let data;
  if (days <= 62) {
    const m = new Map(st.byDay);
    data = [];
    for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) { const k = L.todayISO(d); data.push([k, m.get(k) || 0]); }
  } else data = st.byMonth;
  if (!data.length) return '';
  const max = Math.max(1, ...data.map((d) => d[1]));
  const lab = (k) => (k.length === 10 ? fmtDate(k).slice(0, 5) : k);
  return `<div class="card"><h3>عدد العمليات ${days <= 62 ? 'يوميًا' : 'شهريًا'}</h3>
    <div class="vchart">${data.map(([k, n]) => `<div class="col" title="${lab(k)}: ${n}">${n && data.length <= 31 ? `<span class="t">${n}</span>` : ''}<div class="b" style="height:${(n / max) * 100}%"></div></div>`).join('')}</div>
    <div class="vlabels"><span>${lab(data[0][0])}</span><span>${lab(data[data.length - 1][0])}</span></div></div>`;
}
async function renderDash() {
  const [from, to] = presetRange(dashF.preset);
  dashF.from = from; dashF.to = to;
  let ops = [];
  try { ops = await api.listOps({ from, to }); } catch (e) { toast(e.message, true); }
  if (dashF.specialtyId) ops = ops.filter((o) => o.specialtyId === dashF.specialtyId);
  const st = L.computeStats(ops);
  const pr = [['today', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'], ['last30', 'آخر 30 يوم'], ['year', 'هذه السنة'], ['custom', 'مخصص']];
  $('#view').innerHTML = `
  <div class="card"><div class="actions">
    <div class="chips">${pr.map(([k, l]) => `<button class="chip ${dashF.preset === k ? 'on' : ''}" data-preset="${k}">${l}</button>`).join('')}</div>
  </div>
  <div class="filters" style="margin-top:10px">
    ${dashF.preset === 'custom' ? `<div class="field"><label>من</label><input type="date" data-df="from" value="${from}"></div><div class="field"><label>إلى</label><input type="date" data-df="to" value="${to}"></div>` : `<div class="field"><label>الفترة</label><div style="padding:9px 0">${fmtDate(from)} — ${fmtDate(to)}</div></div>`}
    <div class="field"><label>التخصص</label><select data-df="specialtyId">${opt('', 'كل التخصصات')}${settings.specialties.map((s) => opt(s.id, s.name, s.id === dashF.specialtyId)).join('')}</select></div>
  </div></div>
  <div class="kpis">
    <div class="kpi"><div class="v">${st.total}</div><div class="k">إجمالي المسجل</div></div>
    <div class="kpi"><div class="v" style="color:var(--ok)">${st.done}</div><div class="k">تمت</div></div>
    <div class="kpi"><div class="v" style="color:var(--warn)">${st.postponed}</div><div class="k">تأجيل</div></div>
    <div class="kpi"><div class="v">${st.postponeRate}%</div><div class="k">نسبة التأجيل</div></div>
    <div class="kpi"><div class="v">${st.days ? Math.round((st.done / st.days) * 10) / 10 : 0}</div><div class="k">متوسط العمليات / يوم عمل</div></div>
    <div class="kpi"><div class="v">${st.waitingList}</div><div class="k">قوائم انتظار</div></div>
    <div class="kpi"><div class="v">${st.externalCompany}</div><div class="k">بشركة خارجية</div></div>
  </div>
  ${trend(st, from, to)}
  <p class="hint">التوزيعات التالية للعمليات التي <b>تمت</b> فقط. التأجيلات في بطاقاتها الخاصة.</p>
  <div class="dash">
    ${bars('حسب التخصص', st.bySpecialty)}
    ${bars('حسب الاستشاري', st.byConsultant)}
    ${bars('حسب الغرفة', st.byRoom)}
    ${bars('حسب نوع العمليات', st.byCategory)}
    ${bars('المعاملة المالية', st.byFinance)}
    ${bars('جهات التعاقد', st.byContract)}
    ${bars('نوع التخدير', st.byAnesthesia)}
    ${bars('أطباء التخدير', st.byAnesthetist)}
    ${bars('الشركات الخارجية', st.byCompany)}
    ${bars('نوع المستلزمات', st.bySupply)}
    ${bars('أكثر العمليات', st.byProcedure, 10)}
    ${bars('أكثر التشخيصات', st.byDiagnosis, 10)}
    ${bars('أسباب التأجيل', st.postponeReasons)}
    ${bars('التأجيل حسب التخصص', st.postponedBySpecialty)}
  </div>`;
}

// ---------- settings ----------
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function listEditor(path, placeholder = 'إضافة…') {
  const list = getPath(settings, path) || [];
  return `<div class="le">${list.map((x, i) => `<span class="item">${esc(x)}
      <button title="تعديل الاسم" data-le-ren="${path}" data-i="${i}">✎</button>
      <button class="del" title="حذف" data-le-del="${path}" data-i="${i}">×</button></span>`).join('') || '<span class="hint">القائمة فارغة</span>'}</div>
    <form class="le-add" data-le-add="${path}"><input type="text" placeholder="${placeholder}"><button class="btn sm">إضافة</button></form>
    <span class="hint">يمكن إضافة أكثر من عنصر مرة واحدة بالفصل بينهم بـ ؛ أو سطر جديد</span>`;
}
async function persist(msg = 'تم الحفظ') {
  try { await api.saveSettings(settings); toast(msg); } catch (e) { toast(e.message, true); settings = await api.getSettings(); }
  const open = [...document.querySelectorAll('details.set[open]')].map((d) => d.dataset.k);
  renderSettings(open);
}
let usersCache = null;
async function renderSettings(open = []) {
  const o = (k) => (open.includes(k) ? 'open' : '');
  const specBlocks = settings.specialties.map((s) => `
    <div class="sub-block"><h4><span>${esc(s.name)}</span><span class="actions">
      <button class="btn sec sm" data-spec-ren="${s.id}">تعديل الاسم</button><button class="btn danger sm" data-spec-del="${s.id}">حذف التخصص</button></span></h4>
      <div class="lbl">الاستشاريين</div>${listEditor(`consultants.${s.id}`, 'اسم الاستشاري')}
      <div class="lbl" style="margin-top:10px">التشخيصات</div>${listEditor(`diagnoses.${s.id}`, 'تشخيص')}
      <div class="lbl" style="margin-top:10px">العمليات</div>${listEditor(`procedures.${s.id}`, 'عملية')}
    </div>`).join('');
  const catBlocks = settings.categories.map((c, i) => `
    <div class="sub-block"><h4><span>${esc(c.name)}</span><span class="actions">
      <button class="btn sec sm" data-cat-ren="${i}">تعديل الاسم</button><button class="btn danger sm" data-cat-del="${i}">حذف</button></span></h4>
      <div class="lbl">الغرف</div>${listEditor(`categories.${i}.rooms`, 'اسم/رقم الغرفة')}</div>`).join('');
  const finRows = settings.finance.map((f, i) => `<div class="actions" style="margin-bottom:6px">
      <span class="item" style="background:#f1f4f8;border-radius:8px;padding:6px 10px;min-width:140px">${esc(f.name)}</span>
      <label><input type="checkbox" data-fin-ent="${i}" ${f.entities ? 'checked' : ''}> لها جهات (تظهر قائمة الجهات)</label>
      <button class="btn sec sm" data-fin-ren="${i}">تعديل</button><button class="btn danger sm" data-fin-del="${i}">حذف</button></div>`).join('');
  const learnedBySpec = settings.specialties.map((s) => {
    const items = learned.filter((l) => l.specialtyId === s.id);
    if (!items.length) return '';
    return `<div class="sub-block"><h4>${esc(s.name)}</h4><div class="le">${items.map((l) => `<span class="item">${l.type === 'dx' ? 'تشخيص' : 'عملية'}: ${esc(l.text)}
      <button title="نقل للقائمة الرسمية" data-learn-move="${l.id}">⇧</button><button class="del" title="حذف" data-learn-del="${l.id}">×</button></span>`).join('')}</div></div>`;
  }).join('');

  $('#view').innerHTML = `
  <details class="set" data-k="general" ${o('general')}><summary>عام</summary><div class="in">
    <div class="field" style="max-width:420px"><label>اسم المستشفى</label>
      <form class="le-add" id="hosp-form"><input type="text" value="${esc(settings.hospitalName)}"><button class="btn sm">حفظ</button></form></div>
  </div></details>
  <details class="set" data-k="specs" ${o('specs')}><summary>التخصصات (الاستشاريين / التشخيصات / العمليات)</summary><div class="in">
    ${specBlocks}
    <form class="le-add" id="spec-add"><input type="text" placeholder="اسم تخصص جديد"><button class="btn sm">إضافة تخصص</button></form>
  </div></details>
  <details class="set" data-k="cats" ${o('cats')}><summary>العمليات والغرف</summary><div class="in">
    ${catBlocks}
    <form class="le-add" id="cat-add"><input type="text" placeholder="نوع عمليات جديد"><button class="btn sm">إضافة</button></form>
  </div></details>
  <details class="set" data-k="anes" ${o('anes')}><summary>التخدير</summary><div class="in">
    <div class="lbl">أطباء التخدير</div>${listEditor('anesthetists', 'اسم طبيب التخدير')}
    <div class="lbl" style="margin-top:12px">أنواع التخدير</div>${listEditor('anesthesiaTypes')}
  </div></details>
  <details class="set" data-k="fin" ${o('fin')}><summary>المعاملات المالية وجهات التعاقد</summary><div class="in">
    ${finRows}
    <form class="le-add" id="fin-add" style="margin-bottom:14px"><input type="text" placeholder="نوع معاملة جديد"><button class="btn sm">إضافة</button></form>
    <div class="lbl">جهات التعاقد</div>${listEditor('contractEntities', 'اسم الجهة')}
  </div></details>
  <details class="set" data-k="comp" ${o('comp')}><summary>الشركات الخارجية والمستلزمات</summary><div class="in">
    <div class="lbl">الشركات</div>${listEditor('companies', 'اسم الشركة')}
    <div class="lbl" style="margin-top:12px">أنواع المستلزمات</div>${listEditor('supplyTypes')}
  </div></details>
  <details class="set" data-k="loc" ${o('loc')}><summary>قادم من / خروج إلى</summary><div class="in">${listEditor('locations', 'دور / قسم')}</div></details>
  <details class="set" data-k="pp" ${o('pp')}><summary>أسباب التأجيل</summary><div class="in">${listEditor('postponeReasons', 'سبب')}</div></details>
  <details class="set" data-k="learned" ${o('learned')}><summary>تشخيصات وعمليات أضافها المستخدمون (${learned.length})</summary><div class="in">
    <p class="hint">تظهر كاقتراحات أثناء الكتابة. ⇧ لنقلها للقائمة الرسمية، × لحذفها.</p>${learnedBySpec || '<span class="hint">لا يوجد</span>'}
  </div></details>
  <details class="set" data-k="users" ${o('users')}><summary>المستخدمين والصلاحيات</summary><div class="in" id="users-in"><div class="loading">…</div></div></details>`;
  renderUsers();
}

async function renderUsers() {
  const box = $('#users-in'); if (!box) return;
  try { usersCache = await api.listUsers(); } catch (e) { box.innerHTML = `<div class="errors">${esc(e.message)}</div>`; return; }
  box.innerHTML = `
  <div class="table-wrap"><table class="users"><thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>يرى كل السجلات</th><th>الإحصائيات</th><th>التصدير</th><th>نشط</th></tr></thead>
  <tbody>${usersCache.map((u) => `<tr style="cursor:default">
    <td>${esc(u.name)}</td><td dir="ltr" style="text-align:end">${esc(u.username)}</td>
    <td><select data-urole="${u.uid}">${opt('user', 'مستخدم', u.role === 'user')}${opt('admin', 'أدمن', u.role === 'admin')}</select></td>
    ${['viewAll', 'dashboard', 'export'].map((p) => `<td><input type="checkbox" data-uperm="${u.uid}" data-p="${p}" ${u.role === 'admin' || u.perms?.[p] ? 'checked' : ''} ${u.role === 'admin' ? 'disabled' : ''}></td>`).join('')}
    <td><input type="checkbox" data-uactive="${u.uid}" ${u.active ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>
  <p class="hint">المستخدم العادي يضيف عمليات فقط ولا يعدّل ولا يحذف. لا يمكن تغيير كلمة مرور مستخدم آخر — كل مستخدم يغيّر كلمته من زر "كلمة المرور"، ولو نسيها: أوقف الحساب وأنشئ له اسم مستخدم جديد.</p>
  <h4 style="margin:16px 0 8px">إضافة مستخدم</h4>
  <form id="user-add" class="grid">
    <div class="field"><label>الاسم</label><input type="text" name="name" required></div>
    <div class="field"><label>اسم المستخدم</label><input type="text" name="username" required autocapitalize="off"></div>
    <div class="field"><label>كلمة المرور</label><input type="text" name="password" required minlength="6"></div>
    <div class="field"><label>الدور</label><select name="role">${opt('user', 'مستخدم')}${opt('admin', 'أدمن')}</select></div>
    <div class="field"><label>الصلاحيات</label>
      <label><input type="checkbox" name="viewAll"> يرى كل السجلات</label>
      <label><input type="checkbox" name="dashboard"> الإحصائيات</label>
      <label><input type="checkbox" name="export"> التصدير</label></div>
    <div class="field" style="justify-content:end"><button class="btn">إضافة المستخدم</button></div>
  </form>`;
}

function splitInput(v) { return v.split(/[؛;\n]+/).map((x) => x.trim()).filter(Boolean); }

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-open], [data-go]');
  if (!t) {
    if (!e.target.closest('.tags')) document.querySelectorAll('.sugg').forEach((s) => (s.hidden = true));
    return;
  }
  const d = t.dataset;
  if (d.go) return go(d.go);
  if (d.act === 'close-modal') return closeModal();
  if (d.act === 'logout') { editingId = null; form = blankForm(); return api.logout(); }
  if (d.act === 'pwd') {
    modal(`<h3 style="margin-top:0">تغيير كلمة المرور</h3><form id="pwd-form" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label>كلمة المرور الجديدة</label><input type="password" name="p" minlength="6" required autocomplete="new-password"></div>
      <div class="field"><label>تأكيد</label><input type="password" name="p2" minlength="6" required autocomplete="new-password"></div>
      <button class="btn">حفظ</button></form>`);
    return;
  }
  // entry
  if (d.chip) return setChip(d.chip, d.val);
  if (d.untag) { form[d.untag].splice(+d.i, 1); return renderEntry(); }
  if (d.addtag) { const i = $(`[data-tag="${d.addtag}"]`); return addTag(d.addtag, i.value); }
  if (d.sugg) return addTag(d.sugg, d.val);
  if (d.act === 'save') return saveForm();
  if (d.act === 'clear') { if (confirm('مسح كل الخانات؟')) { form = blankForm({ date: form.date }); formErrors = []; renderEntry(); } return; }
  if (d.act === 'cancel-edit') { editingId = null; form = blankForm(); formErrors = []; return go('list'); }
  // list
  if (d.open) {
    const o = listOps.find((x) => x.id === d.open) || (renderDaily.ops || []).find((x) => x.id === d.open);
    if (o) modal(opDetails(o));
    return;
  }
  if (d.edit) {
    const o = listOps.find((x) => x.id === d.edit) || (renderDaily.ops || []).find((x) => x.id === d.edit);
    closeModal();
    editingId = o.id; formErrors = [];
    form = { ...blankForm(), ...structuredClone(o) };
    view = 'entry'; renderTabs(); renderEntry(); window.scrollTo(0, 0);
    return;
  }
  if (d.del) {
    if (!confirm('حذف هذا السجل نهائيًا؟ لا يمكن التراجع.')) return;
    try { await api.deleteOp(d.del); closeModal(); toast('تم الحذف'); await go(view); } catch (ex) { toast(ex.message, true); }
    return;
  }
  if (d.act === 'xlsx') return exportXlsx(filteredList(), `عمليات_${listF.from}_${listF.to}`);
  if (d.act === 'pdf') {
    const rows = filteredList().slice().reverse();
    const cols = [['date', 'اليوم'], ['time', 'الوقت'], ['patientName', 'اسم المريض'], ['mrn', 'الرقم الطبي'], ['specialty', 'التخصص'], ['consultant', 'الاستشاري'], ['diagnoses', 'التشخيص'], ['procedures', 'العملية'], ['room', 'الغرفة'], ['anesthesiaType', 'نوع التخدير'], ['finance', 'المعاملة المالية'], ['from', 'قادم من'], ['to', 'خروج إلى'], ['status', 'الحالة'], ['postponeReason', 'سبب التأجيل']];
    return printTable(`سجل العمليات — ${settings.hospitalName}`, `من ${fmtDate(listF.from)} إلى ${fmtDate(listF.to)} — ${rows.length} سجل`, rows, cols);
  }
  if (d.act === 'print-daily') return renderDaily.print();
  if (d.act === 'xlsx-daily') return exportXlsx(renderDaily.ops || [], `لستة_${dailyDate}`);
  // dashboard
  if (d.preset) { dashF.preset = d.preset; return renderDash(); }
  // settings
  if (d.leDel) {
    const list = getPath(settings, d.leDel);
    if (!confirm(`حذف "${list[+d.i]}"؟`)) return;
    list.splice(+d.i, 1); return persist('تم الحذف');
  }
  if (d.leRen) {
    const list = getPath(settings, d.leRen);
    const v = prompt('الاسم الجديد', list[+d.i]);
    if (v && v.trim()) { list[+d.i] = v.trim(); return persist(); }
    return;
  }
  if (d.specRen) {
    const s = settings.specialties.find((x) => x.id === d.specRen);
    const v = prompt('اسم التخصص', s.name); if (v && v.trim()) { s.name = v.trim(); return persist(); }
    return;
  }
  if (d.specDel) {
    const s = settings.specialties.find((x) => x.id === d.specDel);
    if (!confirm(`حذف تخصص "${s.name}" بكل قوائمه؟ (السجلات القديمة لن تتأثر)`)) return;
    settings.specialties = settings.specialties.filter((x) => x.id !== s.id);
    for (const k of ['consultants', 'diagnoses', 'procedures']) delete settings[k][s.id];
    return persist('تم الحذف');
  }
  if (d.catRen) { const c = settings.categories[+d.catRen]; const v = prompt('الاسم', c.name); if (v && v.trim()) { c.name = v.trim(); return persist(); } return; }
  if (d.catDel) { if (!confirm(`حذف "${settings.categories[+d.catDel].name}"؟`)) return; settings.categories.splice(+d.catDel, 1); return persist('تم الحذف'); }
  if (d.finRen) { const f = settings.finance[+d.finRen]; const v = prompt('الاسم', f.name); if (v && v.trim()) { f.name = v.trim(); return persist(); } return; }
  if (d.finDel) { if (!confirm(`حذف "${settings.finance[+d.finDel].name}"؟`)) return; settings.finance.splice(+d.finDel, 1); return persist('تم الحذف'); }
  if (d.learnDel || d.learnMove) {
    const id = d.learnDel || d.learnMove;
    const l = learned.find((x) => x.id === id);
    try {
      if (d.learnMove) {
        const key = l.type === 'dx' ? 'diagnoses' : 'procedures';
        settings[key][l.specialtyId] = L.uniqueTerms([...(settings[key][l.specialtyId] || []), l.text]);
        await api.saveSettings(settings);
      }
      await api.deleteLearned(id);
      learned = learned.filter((x) => x.id !== id);
      toast(d.learnMove ? 'تم النقل للقائمة الرسمية' : 'تم الحذف');
      renderSettings(['learned']);
    } catch (ex) { toast(ex.message, true); }
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.id === 'pwd-form') {
    e.preventDefault();
    const { p, p2 } = Object.fromEntries(new FormData(f));
    if (p !== p2) return toast('كلمتا المرور غير متطابقتين', true);
    try { await api.changePassword(p); closeModal(); toast('تم تغيير كلمة المرور'); } catch (ex) { toast(ex.message, true); }
    return;
  }
  if (f.dataset.leAdd) {
    e.preventDefault();
    const items = splitInput(f.querySelector('input').value);
    if (!items.length) return;
    const path = f.dataset.leAdd;
    const parts = path.split('.');
    const parent = getPath(settings, parts.slice(0, -1).join('.')) || settings;
    const key = parts[parts.length - 1];
    parent[key] = L.uniqueTerms([...(parent[key] || []), ...items]);
    return persist('تمت الإضافة');
  }
  if (f.id === 'hosp-form') { e.preventDefault(); settings.hospitalName = f.querySelector('input').value.trim(); await persist(); return renderShell(); }
  if (f.id === 'spec-add') {
    e.preventDefault();
    const name = f.querySelector('input').value.trim(); if (!name) return;
    const id = L.slugId('sp');
    settings.specialties.push({ id, name });
    settings.consultants[id] = []; settings.diagnoses[id] = []; settings.procedures[id] = [];
    return persist('تمت إضافة التخصص');
  }
  if (f.id === 'cat-add') {
    e.preventDefault();
    const name = f.querySelector('input').value.trim(); if (!name) return;
    settings.categories.push({ id: L.slugId('cat'), name, rooms: [] });
    return persist('تمت الإضافة');
  }
  if (f.id === 'fin-add') {
    e.preventDefault();
    const name = f.querySelector('input').value.trim(); if (!name) return;
    settings.finance.push({ name, entities: false });
    return persist('تمت الإضافة');
  }
  if (f.id === 'user-add') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const b = f.querySelector('button'); b.disabled = true;
    try {
      await api.createUser({
        username: d.username, password: d.password, name: d.name, role: d.role,
        perms: { viewAll: !!d.viewAll, dashboard: !!d.dashboard, export: !!d.export },
      });
      toast('تمت إضافة المستخدم'); renderUsers();
    } catch (ex) { toast(ex.message, true); b.disabled = false; }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.field) { form[t.dataset.field] = t.value; return; }
  if (t.dataset.tag) { tagDraft[t.dataset.tag] = t.value; return showSugg(t); }
  if (t.dataset.lf === 'q') { listF.q = t.value; clearTimeout(t._d); t._d = setTimeout(() => { renderList(); const i = $('[data-lf="q"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); }
});

document.addEventListener('focusin', (e) => { if (e.target.dataset?.tag && e.target.value.trim()) showSugg(e.target); });
document.addEventListener('focusout', (e) => {
  if (!e.target.dataset?.tag) return;
  const box = e.target.closest('.tags')?.querySelector('.sugg');
  setTimeout(() => { if (box && !box.contains(document.activeElement)) box.hidden = true; }, 200);
});
// keep focus in the input when tapping a suggestion so the list doesn't vanish before the click
document.addEventListener('mousedown', (e) => { if (e.target.closest('.sugg')) e.preventDefault(); });

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.dataset?.tag && e.key === 'Enter') {
    e.preventDefault();
    const box = t.closest('.tags').querySelector('.sugg button');
    // Enter picks the top suggestion if the text matches it partially, else adds typed text
    const q = t.value.trim();
    if (!q) return;
    const first = box && !box.classList.contains('new') ? box.dataset.val : null;
    addTag(t.dataset.tag, first && L.normalizeTerm(first).startsWith(L.normalizeTerm(q)) ? first : q);
  }
  if (e.key === 'Escape') { document.querySelectorAll('.sugg').forEach((s) => (s.hidden = true)); if (!$('#modal').hidden) closeModal(); }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.field && t.tagName === 'SELECT') { form[t.dataset.field] = t.value; return; }
  if (t.dataset.lf && t.dataset.lf !== 'q') {
    listF[t.dataset.lf] = t.value;
    if (t.dataset.lf === 'specialtyId') listF.consultant = '';
    if (t.dataset.lf === 'from' || t.dataset.lf === 'to') await loadList();
    return renderList();
  }
  if (t.dataset.df) { dashF[t.dataset.df] = t.value; return renderDash(); }
  if (t.dataset.finEnt !== undefined) { settings.finance[+t.dataset.finEnt].entities = t.checked; return persist(); }
  const uid = t.dataset.urole || t.dataset.uperm || t.dataset.uactive;
  if (uid) {
    const u = usersCache.find((x) => x.uid === uid);
    let patch;
    if (t.dataset.urole) patch = { role: t.value };
    else if (t.dataset.uperm) patch = { perms: { viewAll: false, dashboard: false, export: false, ...u.perms, [t.dataset.p]: t.checked } };
    else patch = { active: t.checked };
    try { await api.updateUser(uid, patch); toast('تم الحفظ'); } catch (ex) { toast(ex.message, true); }
    renderUsers();
  }
});

$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
