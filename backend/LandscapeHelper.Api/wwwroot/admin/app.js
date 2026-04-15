const API = window.location.origin;
const ADMIN_TOKEN_KEY = 'admin_token';
const ADMIN_USER_KEY = 'admin_user';
let currentFilter = '';
let currentRequestId = null;
let currentLang = localStorage.getItem('admin_lang') || 'en';
let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
let adminUser = null;
try { adminUser = JSON.parse(localStorage.getItem(ADMIN_USER_KEY) || 'null'); } catch {}

function authHeaders(extra = {}) {
  const h = { ...extra };
  if (adminToken) h['Authorization'] = `Bearer ${adminToken}`;
  return h;
}

async function authedFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: authHeaders(opts.headers || {}),
  });
  if (res.status === 401 || res.status === 403) {
    adminLogout();
    throw new Error('Your session expired. Please sign in again.');
  }
  return res;
}

function showLoginGate() {
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('admin-content').classList.add('hidden');
  document.getElementById('user-bar').classList.add('hidden');
}

function showAdminDashboard() {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('admin-content').classList.remove('hidden');
  const userBar = document.getElementById('user-bar');
  userBar.classList.remove('hidden');
  if (adminUser) document.getElementById('user-email').textContent = adminUser.email;
}

function adminLogout() {
  adminToken = null;
  adminUser = null;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  showLoginGate();
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const errorEl = document.getElementById('admin-login-error');
  errorEl.textContent = '';
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Sign in failed.'; return; }
    if (!data.user?.isAdmin) {
      errorEl.textContent = 'That account is not an admin.';
      return;
    }
    adminToken = data.token;
    adminUser = data.user;
    localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(adminUser));
    showAdminDashboard();
    loadRequests();
    applyTranslations(document);
  } catch (err) {
    errorEl.textContent = 'Network error. Try again.';
  }
}

// Separate caches for the two providers so they don't stomp on each other
// (OpenAI-translated free text and Google-translated UI labels may differ
// for the same source string).
const labelCache = {};   // Google — UI labels
const contentCache = {}; // OpenAI — user/AI-generated content
const LABEL_CACHE_PREFIX = 'admin_labels_';
const CONTENT_CACHE_PREFIX = 'admin_content_';

// DOM elements
const requestList = document.getElementById('request-list');
const detailPanel = document.getElementById('detail-panel');
const detailContent = document.getElementById('detail-content');
const backBtn = document.getElementById('back-btn');
const deleteBtn = document.getElementById('delete-btn');
const langSelect = document.getElementById('lang-select');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  populateLanguageDropdown();
  await loadCachedTranslations(currentLang);
  setupFilters();
  backBtn.addEventListener('click', showList);
  deleteBtn.addEventListener('click', deleteCurrentRequest);
  langSelect.addEventListener('change', onLanguageChange);
  document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
  document.getElementById('logout-btn').addEventListener('click', adminLogout);

  // Show login gate if not authenticated; otherwise proceed into dashboard.
  if (adminToken && adminUser?.isAdmin) {
    showAdminDashboard();
    loadRequests();
  } else {
    showLoginGate();
  }
  applyTranslations(document);
});

function populateLanguageDropdown() {
  langSelect.innerHTML = (window.GOOGLE_LANGUAGES || []).map(l =>
    `<option value="${l.code}" ${l.code === currentLang ? 'selected' : ''}>${l.name}</option>`
  ).join('');
}

async function loadCachedTranslations(lang) {
  if (lang === 'en') return;
  try {
    const l = localStorage.getItem(LABEL_CACHE_PREFIX + lang);
    if (l) Object.assign(labelCache, JSON.parse(l));
  } catch {}
  try {
    const c = localStorage.getItem(CONTENT_CACHE_PREFIX + lang);
    if (c) Object.assign(contentCache, JSON.parse(c));
  } catch {}
}

async function onLanguageChange(e) {
  currentLang = e.target.value;
  localStorage.setItem('admin_lang', currentLang);

  // Reset in-memory caches and repopulate from storage for the new language
  Object.keys(labelCache).forEach(k => delete labelCache[k]);
  Object.keys(contentCache).forEach(k => delete contentCache[k]);

  if (currentLang !== 'en') {
    await loadCachedTranslations(currentLang);
  }

  // Re-translate static labels
  await applyTranslations(document);

  // Re-render current view with fresh translations applied
  if (currentRequestId) {
    viewRequest(currentRequestId);
  } else {
    loadRequests();
  }
}

// Translate any element with [data-i18n] under `root` via Google (UI labels).
// The first time it sees an element, it records its English text in data-original.
async function applyTranslations(root) {
  const elements = root.querySelectorAll('[data-i18n]');
  if (!elements.length) return;

  const toTranslate = [];
  const elList = [];

  elements.forEach(el => {
    let original = el.getAttribute('data-original');
    if (original === null) {
      original = el.textContent.trim();
      el.setAttribute('data-original', original);
    }
    if (!original) return;
    if (currentLang === 'en') {
      el.textContent = original;
      return;
    }
    if (labelCache[original]) {
      el.textContent = labelCache[original];
    } else {
      toTranslate.push(original);
      elList.push(el);
    }
  });

  if (toTranslate.length === 0) return;

  try {
    const translated = await fetchTranslations(toTranslate, currentLang, 'label');
    translated.forEach((t, i) => {
      const src = toTranslate[i];
      labelCache[src] = t;
      elList[i].textContent = t;
    });
    persistCache('label');
  } catch (err) {
    console.error('Label translation failed', err);
  }
}

// Translate UI labels (Google). Synchronous accessor via labelCache.
async function translateLabelsMany(sources) {
  return _translateMany(sources, 'label');
}

// Translate user/AI-generated content (OpenAI). Used for project titles, descriptions, steps, etc.
async function translateContentMany(sources) {
  return _translateMany(sources, 'content');
}

// Back-compat wrapper — default dynamic strings route to OpenAI
async function translateMany(sources) {
  return translateContentMany(sources);
}

async function _translateMany(sources, kind) {
  if (currentLang === 'en' || !sources.length) return sources.slice();
  const cache = kind === 'label' ? labelCache : contentCache;
  const missing = [];
  const missingIndexes = [];
  const result = new Array(sources.length);
  sources.forEach((s, i) => {
    if (!s) { result[i] = s; return; }
    if (cache[s]) { result[i] = cache[s]; }
    else { missing.push(s); missingIndexes.push(i); }
  });
  if (missing.length === 0) return result;
  try {
    const translated = await fetchTranslations(missing, currentLang, kind);
    translated.forEach((t, i) => {
      cache[missing[i]] = t;
      result[missingIndexes[i]] = t;
    });
    persistCache(kind);
  } catch (err) {
    console.error(`${kind} translation failed`, err);
    missingIndexes.forEach(i => { result[i] = sources[i]; });
  }
  return result;
}

async function fetchTranslations(texts, target, kind) {
  const endpoint = kind === 'label' ? '/api/translate' : '/api/translate-content';
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target, source: kind === 'label' ? 'en' : 'auto' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Translate failed ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.translations || texts;
}

function persistCache(kind) {
  try {
    if (kind === 'label')
      localStorage.setItem(LABEL_CACHE_PREFIX + currentLang, JSON.stringify(labelCache));
    else
      localStorage.setItem(CONTENT_CACHE_PREFIX + currentLang, JSON.stringify(contentCache));
  } catch {}
}

// Synchronous lookups for inlined template strings — cache-only
function tr(s) {
  if (!s || currentLang === 'en') return s;
  return contentCache[s] || s;
}
function trLabel(s) {
  if (!s || currentLang === 'en') return s;
  return labelCache[s] || s;
}

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.status;
      loadRequests();
    });
  });
}

async function loadRequests() {
  const url = currentFilter
    ? `${API}/api/help-requests?status=${currentFilter}`
    : `${API}/api/help-requests`;

  try {
    const res = await authedFetch(url);
    const data = await res.json();
    await renderList(data);
  } catch (err) {
    requestList.innerHTML = `<div class="empty-state"><h2 data-i18n>Error loading requests</h2><p data-i18n>Could not connect to the API.</p></div>`;
    applyTranslations(requestList);
  }
}

async function renderList(requests) {
  if (!requests.length) {
    requestList.innerHTML = `<div class="empty-state"><h2 data-i18n>No requests found</h2><p data-i18n>Help requests from the app will appear here.</p></div>`;
    await applyTranslations(requestList);
    return;
  }

  // Titles are user-entered → OpenAI; status words are UI labels → Google
  const titles = requests.map(r => r.projectTitle || '');
  const statuses = requests.map(r => (r.status || '').replace('_', ' '));
  const [translatedTitles, translatedStatuses] = await Promise.all([
    translateContentMany(titles),
    translateLabelsMany(statuses),
  ]);

  requestList.innerHTML = requests.map((r, i) => `
    <div class="request-card" onclick="viewRequest(${r.id})">
      <div class="request-card-header">
        <span class="request-card-title">${escapeHtml(translatedTitles[i] || r.projectTitle)}</span>
        <span class="status-badge status-${r.status}">${escapeHtml(translatedStatuses[i])}</span>
      </div>
      <div class="request-card-info">
        <span>${escapeHtml(r.customerName)}</span>
        <span>${escapeHtml(r.customerEmail)}</span>
        <span>${escapeHtml(r.customerPhone)}</span>
        <span>${new Date(r.createdAt).toLocaleDateString()}</span>
        ${r.followUpDate ? `<span data-dyn="followup">Follow-up: ${new Date(r.followUpDate).toLocaleDateString()}</span>` : ''}
      </div>
    </div>
  `).join('');
}

async function viewRequest(id) {
  try {
    const res = await authedFetch(`${API}/api/help-requests/${id}`);
    const data = await res.json();
    currentRequestId = id;
    await renderDetail(data);
    requestList.style.display = 'none';
    document.querySelector('.filters').style.display = 'none';
    detailPanel.classList.remove('hidden');
  } catch (err) {
    alert('Failed to load request details.');
  }
}

function showList() {
  detailPanel.classList.add('hidden');
  requestList.style.display = 'flex';
  document.querySelector('.filters').style.display = 'flex';
  currentRequestId = null;
  loadRequests();
}

async function renderDetail(data) {
  let projectData = {};
  try { projectData = JSON.parse(data.projectData); } catch {}

  const steps = (projectData.steps || []).map(s => typeof s === 'string' ? s : s.text);
  const tools = projectData.tools_and_materials || [];
  const safetyTips = projectData.safety_tips || [];
  const whenPro = projectData.when_to_call_pro || [];

  // User-entered + AI-generated content → OpenAI
  const userContent = [
    data.projectTitle || '',
    data.userDescription || '',
    data.notes || '',
    projectData.difficulty || '',
    projectData.estimated_time || '',
    projectData.estimated_cost || '',
    ...steps,
    ...tools,
    ...safetyTips,
    ...whenPro,
  ];
  // Status word is a UI label → Google
  const statusLabel = (data.status || '').replace('_', ' ');

  await Promise.all([
    translateContentMany(userContent),
    translateLabelsMany([statusLabel]),
  ]);

  const T = {
    submitted: 'Submitted',
    customer: 'Customer',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    userDescription: 'User Description',
    photo: 'Photo',
    projectOverview: 'Project Overview',
    difficulty: 'Difficulty',
    time: 'Time',
    cost: 'Cost',
    steps: 'Steps',
    toolsMaterials: 'Tools & Materials',
    safetyTips: 'Safety Tips',
    whenToCallPro: 'When to Call a Pro',
    manageRequest: 'Manage Request',
    status: 'Status',
    newStatus: 'New',
    inProgress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    notes: 'Notes',
    notesPlaceholder: 'Add notes about this request...',
    followupDate: 'Follow-up Date',
    saveChanges: 'Save Changes',
    na: 'N/A',
  };

  // UI labels → Google
  const labelKeys = Object.keys(T);
  const labelSources = labelKeys.map(k => T[k]);
  const translatedLabels = await translateLabelsMany(labelSources);
  labelKeys.forEach((k, i) => { T[k] = translatedLabels[i]; });

  detailContent.innerHTML = `
    <div class="detail-section">
      <h2>${escapeHtml(tr(data.projectTitle))}</h2>
      <span class="status-badge status-${data.status}" style="margin-bottom:12px;display:inline-block">${escapeHtml(trLabel((data.status || '').replace('_', ' ')))}</span>
      <p style="color:#94A3B8;margin-top:8px">${T.submitted} ${new Date(data.createdAt).toLocaleString()}</p>
    </div>

    <div class="detail-section">
      <h3>${T.customer}</h3>
      <div class="customer-info">
        <div class="info-card"><label>${T.name}</label><p>${escapeHtml(data.customerName)}</p></div>
        <div class="info-card"><label>${T.email}</label><p><a href="mailto:${escapeHtml(data.customerEmail)}" style="color:#FCA004">${escapeHtml(data.customerEmail)}</a></p></div>
        <div class="info-card"><label>${T.phone}</label><p><a href="tel:${escapeHtml(data.customerPhone)}" style="color:#FCA004">${escapeHtml(data.customerPhone)}</a></p></div>
      </div>
    </div>

    ${data.userDescription ? `
    <div class="detail-section">
      <h3>${T.userDescription}</h3>
      <div class="description-text">${escapeHtml(tr(data.userDescription))}</div>
    </div>` : ''}

    ${data.imageBase64 ? `
    <div class="detail-section">
      <h3>${T.photo}</h3>
      <img class="thumbnail" src="data:image/jpeg;base64,${data.imageBase64}" alt="Project photo">
    </div>` : ''}

    <div class="detail-section">
      <h3>${T.projectOverview}</h3>
      <div class="project-overview">
        <div class="overview-stat"><span class="stat-label">${T.difficulty}</span><div class="stat-value">${escapeHtml(tr(projectData.difficulty) || T.na)}</div></div>
        <div class="overview-stat"><span class="stat-label">${T.time}</span><div class="stat-value">${escapeHtml(tr(projectData.estimated_time) || T.na)}</div></div>
        <div class="overview-stat"><span class="stat-label">${T.cost}</span><div class="stat-value">${escapeHtml(tr(projectData.estimated_cost) || T.na)}</div></div>
      </div>
    </div>

    ${steps.length ? `
    <div class="detail-section">
      <h3>${T.steps}</h3>
      <div class="steps-list">
        ${steps.map((s, i) => `<div class="step-item"><span class="step-number">${i + 1}</span><span class="step-text">${escapeHtml(tr(s))}</span></div>`).join('')}
      </div>
    </div>` : ''}

    ${tools.length ? `
    <div class="detail-section">
      <h3>${T.toolsMaterials}</h3>
      <div class="tools-list">${tools.map(t => `<span class="tag">${escapeHtml(tr(t))}</span>`).join('')}</div>
    </div>` : ''}

    ${safetyTips.length ? `
    <div class="detail-section">
      <h3>${T.safetyTips}</h3>
      <div class="safety-list">${safetyTips.map(t => `<span class="tag">${escapeHtml(tr(t))}</span>`).join('')}</div>
    </div>` : ''}

    ${whenPro.length ? `
    <div class="detail-section">
      <h3>${T.whenToCallPro}</h3>
      <div class="pro-list">${whenPro.map(t => `<span class="tag">${escapeHtml(tr(t))}</span>`).join('')}</div>
    </div>` : ''}

    <div class="detail-section">
      <h3>${T.manageRequest}</h3>
      <div class="edit-form">
        <div class="form-group">
          <label>${T.status}</label>
          <select id="edit-status">
            <option value="new" ${data.status === 'new' ? 'selected' : ''}>${T.newStatus}</option>
            <option value="in_progress" ${data.status === 'in_progress' ? 'selected' : ''}>${T.inProgress}</option>
            <option value="completed" ${data.status === 'completed' ? 'selected' : ''}>${T.completed}</option>
            <option value="cancelled" ${data.status === 'cancelled' ? 'selected' : ''}>${T.cancelled}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${T.notes}</label>
          <textarea id="edit-notes" placeholder="${escapeAttr(T.notesPlaceholder)}">${escapeHtml(tr(data.notes) || '')}</textarea>
        </div>
        <div class="form-group">
          <label>${T.followupDate}</label>
          <input type="date" id="edit-followup" value="${data.followUpDate ? data.followUpDate.split('T')[0] : ''}">
        </div>
        <button class="save-btn" onclick="saveChanges()">${T.saveChanges}</button>
      </div>
    </div>
  `;
}

async function saveChanges() {
  if (!currentRequestId) return;

  const status = document.getElementById('edit-status').value;
  const notes = document.getElementById('edit-notes').value;
  const followUpDate = document.getElementById('edit-followup').value || null;

  try {
    const res = await authedFetch(`${API}/api/help-requests/${currentRequestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes, followUpDate }),
    });
    if (res.ok) {
      const updated = await res.json();
      await renderDetail(updated);
      const btn = document.querySelector('.save-btn');
      const [savedLabel, normalLabel] = await translateLabelsMany(['Saved!', 'Save Changes']);
      btn.textContent = savedLabel;
      btn.style.background = '#00B894';
      setTimeout(() => { btn.textContent = normalLabel; btn.style.background = ''; }, 1500);
    }
  } catch (err) {
    alert('Failed to save changes.');
  }
}

async function deleteCurrentRequest() {
  if (!currentRequestId) return;
  const confirmMsg = (await translateLabelsMany(['Are you sure you want to delete this request? This cannot be undone.']))[0];
  if (!confirm(confirmMsg)) return;

  try {
    const res = await authedFetch(`${API}/api/help-requests/${currentRequestId}`, { method: 'DELETE' });
    if (res.ok) {
      showList();
    }
  } catch (err) {
    alert('Failed to delete request.');
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
