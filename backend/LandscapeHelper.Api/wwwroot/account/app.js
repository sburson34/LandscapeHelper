const API = window.location.origin;
const TOKEN_KEY = 'lh_user_token';
const USER_KEY = 'lh_user_info';

const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const detailSection = document.getElementById('detail-section');
const userBar = document.getElementById('user-bar');
const userEmail = document.getElementById('user-email');
const sessionList = document.getElementById('session-list');
const detailContent = document.getElementById('detail-content');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

let token = localStorage.getItem(TOKEN_KEY);
let user = null;
try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch {}

document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      loginForm.classList.toggle('hidden', tab !== 'login');
      registerForm.classList.toggle('hidden', tab !== 'register');
      loginError.textContent = '';
      registerError.textContent = '';
    });
  });

  loginForm.addEventListener('submit', handleLogin);
  registerForm.addEventListener('submit', handleRegister);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('back-btn').addEventListener('click', () => {
    detailSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
  });

  if (token) {
    showDashboard();
  } else {
    showAuth();
  }
});

function showAuth() {
  authSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  detailSection.classList.add('hidden');
  userBar.classList.add('hidden');
}

function showDashboard() {
  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  detailSection.classList.add('hidden');
  userBar.classList.remove('hidden');
  if (user) userEmail.textContent = user.email;
  loadSessions();
}

async function handleLogin(e) {
  e.preventDefault();
  loginError.textContent = '';
  const fd = new FormData(loginForm);
  const body = { email: fd.get('email'), password: fd.get('password') };
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { loginError.textContent = data.error || 'Login failed.'; return; }
    token = data.token;
    user = data.user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    showDashboard();
  } catch (err) {
    loginError.textContent = 'Network error. Try again.';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  registerError.textContent = '';
  const fd = new FormData(registerForm);
  const body = {
    email: fd.get('email'),
    password: fd.get('password'),
    displayName: fd.get('displayName') || null,
  };
  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { registerError.textContent = data.error || 'Registration failed.'; return; }
    token = data.token;
    user = data.user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    showDashboard();
  } catch (err) {
    registerError.textContent = 'Network error. Try again.';
  }
}

function handleLogout() {
  token = null;
  user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  showAuth();
}

async function authedFetch(url) {
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 401) {
    handleLogout();
    throw new Error('Session expired. Please sign in again.');
  }
  return res;
}

async function loadSessions() {
  sessionList.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await authedFetch(`${API}/api/house-advice/mine`);
    if (!res.ok) throw new Error('Failed to load');
    const sessions = await res.json();
    renderSessions(sessions);
  } catch (err) {
    sessionList.innerHTML = `<div class="empty-state"><h3>${escapeHtml(err.message)}</h3></div>`;
  }
}

function renderSessions(sessions) {
  if (!sessions.length) {
    sessionList.innerHTML = `
      <div class="empty-state">
        <h3>No advice yet</h3>
        <p>Open the Landscape Helper app, sign in with the same email, and run a Whole House Advice. Your results will appear here.</p>
      </div>
    `;
    return;
  }

  sessionList.innerHTML = sessions.map(s => {
    const date = new Date(s.createdAt).toLocaleString();
    return `
      <div class="session-card" onclick="viewSession(${s.id})">
        <div class="session-card-header">
          <strong>${s.photoCount} photo${s.photoCount === 1 ? '' : 's'}</strong>
          <span class="session-card-date">${date}</span>
        </div>
        ${s.budget ? `<div class="session-card-meta"><strong>Budget:</strong> ${escapeHtml(s.budget)}</div>` : ''}
        ${s.ideas ? `<div class="session-card-meta"><strong>Ideas:</strong> ${escapeHtml(truncate(s.ideas, 120))}</div>` : ''}
        ${s.overallNotes ? `<div class="session-card-notes">${escapeHtml(truncate(s.overallNotes, 180))}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function viewSession(id) {
  detailContent.innerHTML = '<p class="muted">Loading…</p>';
  dashboardSection.classList.add('hidden');
  detailSection.classList.remove('hidden');
  try {
    const res = await authedFetch(`${API}/api/house-advice/${id}`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    renderDetail(data);
  } catch (err) {
    detailContent.innerHTML = `<div class="empty-state"><h3>${escapeHtml(err.message)}</h3></div>`;
  }
}

window.viewSession = viewSession;

function renderDetail(data) {
  const date = new Date(data.createdAt).toLocaleString();
  const suggestions = (data.suggestions && data.suggestions.suggestions) || [];

  // Group photos by side
  const sides = ['front', 'left', 'back', 'right'];
  const photosBySide = {};
  sides.forEach(s => photosBySide[s] = []);
  (data.photos || []).forEach(p => {
    if (!photosBySide[p.side]) photosBySide[p.side] = [];
    photosBySide[p.side].push(p);
  });

  let html = `
    <div class="detail-meta">
      <h2>House Advice — ${date}</h2>
      <div class="meta-row">
        ${data.budget ? `<div><label>Budget</label><p>${escapeHtml(data.budget)}</p></div>` : ''}
        ${data.ideas ? `<div style="flex:1; min-width: 200px"><label>Ideas considered</label><p>${escapeHtml(data.ideas)}</p></div>` : ''}
      </div>
      ${data.overallNotes ? `<div class="overall-notes">${escapeHtml(data.overallNotes)}</div>` : ''}
    </div>
  `;

  // Photos by side
  sides.forEach(side => {
    const photos = photosBySide[side];
    if (!photos.length) return;
    html += `
      <div class="photos-section">
        <h3>${capitalize(side)} of house — ${photos.length} photo${photos.length === 1 ? '' : 's'}</h3>
        <div class="photo-grid">
          ${photos.map(p => `
            <div class="photo-card">
              <img src="${p.dataUrl}" alt="${side} of house">
              <div class="photo-card-side">${side}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  // Suggestions
  if (suggestions.length) {
    html += `<div class="suggestions-section"><h3 class="section-heading" style="font-size:18px; margin-bottom:14px">${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}</h3>`;
    suggestions.forEach(s => {
      const complexity = (s.complexity || '').toLowerCase();
      html += `
        <div class="suggestion-card">
          <div class="suggestion-header">
            <div>
              <div class="suggestion-title">${escapeHtml(s.title || 'Suggestion')}</div>
              ${s.area ? `<div class="suggestion-area">${escapeHtml(s.area)}</div>` : ''}
            </div>
            ${s.complexity ? `<span class="complexity-badge complexity-${complexity}">${escapeHtml(s.complexity)}</span>` : ''}
          </div>
          ${s.description ? `<div class="suggestion-desc">${escapeHtml(s.description)}</div>` : ''}
          <div class="suggestion-meta">
            ${s.estimated_cost ? `<span>💰 ${escapeHtml(s.estimated_cost)}</span>` : ''}
            ${s.estimated_time ? `<span>⏱ ${escapeHtml(s.estimated_time)}</span>` : ''}
            ${s.diy_friendly !== undefined ? `<span>${s.diy_friendly ? '🔧 DIY Friendly' : '👷 Hire a Pro'}</span>` : ''}
          </div>
          ${s.materials && s.materials.length ? `
            <div class="section-heading">Materials</div>
            <div class="chip-row">${s.materials.map(m => `<span class="chip">${escapeHtml(m)}</span>`).join('')}</div>
          ` : ''}
          ${s.steps && s.steps.length ? `
            <div class="section-heading">Steps</div>
            <div class="steps-list">
              ${s.steps.map((step, i) => `<div class="step-row"><div class="step-num">${i + 1}</div><div class="step-text">${escapeHtml(step)}</div></div>`).join('')}
            </div>
          ` : ''}
          ${s.pro_tip ? `<div class="pro-tip"><strong>💡 Pro tip:</strong> ${escapeHtml(s.pro_tip)}</div>` : ''}
        </div>
      `;
    });
    html += `</div>`;
  }

  detailContent.innerHTML = html;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.substring(0, n) + '…' : str;
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
