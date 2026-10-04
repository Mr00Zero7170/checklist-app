const STORE_KEY = 'daily-checklist-v2';
const OLD_KEY = 'daily-checklist-v1';
const TIMERS_KEY = 'daily-checklist-timers';
const DEVICE_KEY = 'daily-checklist-device';
const IDENTITY_URL = 'https://esm.sh/@netlify/identity@2.0.0';

const DEFAULT_TASKS = [
  { id: 'dsa',    type: 'check', title: 'Solve 1 DSA question',              sub: 'In the language you are learning', days: null },
  { id: 'typing', type: 'timer', title: 'Typing practice',                   sub: '30 minutes of touch typing', mins: 30, metric: 'WPM', days: null },
  { id: 'duo',    type: 'timer', title: 'Duolingo',                          sub: '15 minutes', mins: 15, days: null },
  { id: 'book',   type: 'book',  title: 'Read The Easy Way to Stop Smoking', sub: 'Read a bit today', progress: 0, days: null }
];
const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365, 500, 1000];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CRAVING_TIPS = [
  'Cravings peak and fade within a few minutes. Just ride this one out.',
  'Sip a glass of cold water slowly.',
  'Nothing is being given up. There is nothing to miss.',
  'Get up and walk around for a minute.',
  'Every craving you get through makes the next one weaker.',
  'Name five things you can see right now.'
];
const DAY_MS = 86400000;

const TICK = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5l3 3 6-7"/></svg>';

// ---------- State ----------

function blankState() {
  return {
    v: 2,
    tasks: DEFAULT_TASKS.map((t) => ({ ...t })),
    days: {},      // dateKey -> [taskId]
    notes: {},     // dateKey -> { taskId: text }
    minutes: {},   // dateKey -> { taskId: minutes timed }
    metrics: {},   // dateKey -> { taskId: number }
    cravings: [],  // timestamps
    quit: { date: '', perDay: 10, packSize: 20, packPrice: 0, currency: '' },
    settings: { theme: 'system', freeze: true, sound: true, reminder: '20:00' },
    updatedAt: 0
  };
}

function normalize(raw) {
  const s = blankState();
  if (!raw || typeof raw !== 'object') return s;
  if (Array.isArray(raw.tasks)) {
    s.tasks = raw.tasks
      .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string')
      .map((t) => ({
        id: t.id,
        type: ['check', 'timer', 'book'].includes(t.type) ? t.type : 'check',
        title: t.title,
        sub: typeof t.sub === 'string' ? t.sub : '',
        mins: Math.max(1, Math.min(600, Number(t.mins) || 15)),
        metric: typeof t.metric === 'string' ? t.metric : '',
        progress: Math.max(0, Math.min(100, Number(t.progress) || 0)),
        days: Array.isArray(t.days) ? t.days.filter((d) => d >= 0 && d <= 6) : null
      }));
  }
  for (const k of ['days', 'notes', 'minutes', 'metrics']) {
    if (raw[k] && typeof raw[k] === 'object') s[k] = raw[k];
  }
  if (Array.isArray(raw.cravings)) s.cravings = raw.cravings.filter((n) => typeof n === 'number');
  if (raw.quit && typeof raw.quit === 'object') s.quit = { ...s.quit, ...raw.quit };
  if (raw.settings && typeof raw.settings === 'object') s.settings = { ...s.settings, ...raw.settings };
  s.updatedAt = Number(raw.updatedAt) || 0;
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
    // Upgrade data saved by the first version of the app.
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const parsed = JSON.parse(old);
      const s = blankState();
      if (parsed && typeof parsed === 'object') {
        s.days = parsed.days || {};
        s.tasks.find((t) => t.id === 'book').progress = Number(parsed.book) || 0;
        s.updatedAt = Date.now();
      }
      return s;
    }
  } catch (e) {}
  return blankState();
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...fallback };
}

let state = loadState();
let timers = loadJSON(TIMERS_KEY, {});             // taskId -> { end } while running, { left } while paused
let device = loadJSON(DEVICE_KEY, {                // settings that belong to this phone only
  signedIn: false, syncedAt: 0, reminderOn: false, localReminderSent: '', email: ''
});

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}
function save() {
  state.updatedAt = Date.now();
  persist();
  scheduleSync();
}
function saveTimers() {
  try { localStorage.setItem(TIMERS_KEY, JSON.stringify(timers)); } catch (e) {}
}
function saveDevice() {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(device)); } catch (e) {}
}

// ---------- Dates & schedule ----------

function keyFor(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}
function dateFor(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  return x;
}
function weekId(d) {
  const offset = (d.getDay() + 6) % 7; // Monday-based weeks
  return keyFor(addDays(d, -offset));
}

let todayKey = keyFor(new Date());

function taskById(id) { return state.tasks.find((t) => t.id === id); }
function isDue(t, d) { return !t.days || t.days.includes(d.getDay()); }
function dueTasks(d, onlyId) {
  return state.tasks.filter((t) => (!onlyId || t.id === onlyId) && isDue(t, d));
}
function doneList(k) { return state.days[k] || []; }
function isDone(k, id) { return doneList(k).includes(id); }
function dayProgress(d, onlyId) {
  const k = keyFor(d);
  const due = dueTasks(d, onlyId);
  const done = due.filter((t) => isDone(k, t.id)).length;
  return { due: due.length, done, complete: due.length > 0 && done === due.length };
}

function earliestKey() {
  let min = todayKey;
  for (const k of Object.keys(state.days)) if (state.days[k].length && k < min) min = k;
  return min;
}

// Walks every day from the first recorded tick to today. Days with nothing scheduled are skipped,
// today never breaks a streak, and (if enabled) one missed day per week is covered by a streak freeze.
function streakInfo(onlyId) {
  const frozen = new Set();
  let run = 0, best = 0, freezeWeek = null;
  const today = dateFor(todayKey);
  for (let d = dateFor(earliestKey()); d <= today; d = addDays(d, 1)) {
    const p = dayProgress(d, onlyId);
    if (p.due === 0) continue;
    const k = keyFor(d);
    if (p.complete) {
      run++;
      best = Math.max(best, run);
    } else if (k === todayKey) {
      continue;
    } else if (state.settings.freeze && run > 0 && freezeWeek !== weekId(d)) {
      freezeWeek = weekId(d);
      frozen.add(k);
    } else {
      run = 0;
    }
  }
  return { current: run, best, frozen, freezeUsedThisWeek: freezeWeek === weekId(today) };
}

// ---------- Mutations ----------

function setDone(k, id, on) {
  const list = doneList(k).filter((x) => x !== id);
  if (on) list.push(id);
  state.days[k] = list;
  save();
}

function setDayValue(bucket, k, id, value) {
  const day = { ...(state[bucket][k] || {}) };
  if (value === '' || value === null || value === undefined) delete day[id];
  else day[id] = value;
  if (Object.keys(day).length) state[bucket][k] = day;
  else delete state[bucket][k];
}

function toggleToday(id) {
  const before = dayProgress(dateFor(todayKey)).complete;
  setDone(todayKey, id, !isDone(todayKey, id));
  render();
  if (!before && dayProgress(dateFor(todayKey)).complete) celebrate();
}

// ---------- Timers ----------

function timerLeft(id) {
  const t = timers[id];
  if (!t) return 0;
  return t.end ? t.end - Date.now() : t.left;
}
function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function timerButtons(t) {
  const tm = timers[t.id];
  if (!tm) {
    return '<button class="timer" type="button" data-action="timer-start" data-id="' + esc(t.id) + '">Start ' + t.mins + ':00</button>';
  }
  const running = !!tm.end;
  return '<button class="timer' + (running ? ' running' : '') + '" type="button" data-action="' + (running ? 'timer-pause' : 'timer-resume') + '" data-id="' + esc(t.id) + '" data-timer="' + esc(t.id) + '">' +
      (running ? 'Pause ' : 'Resume ') + fmt(timerLeft(t.id)) + '</button>' +
    '<button class="link" type="button" data-action="timer-cancel" data-id="' + esc(t.id) + '">Reset timer</button>';
}

let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
function chime() {
  if (!state.settings.sound || !audioCtx) return;
  const now = audioCtx.currentTime;
  [0, 0.35, 0.7].forEach((offset, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = i === 2 ? 1046.5 : 784;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.32);
  });
}

function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    return Notification.requestPermission().catch(() => 'default');
  }
  return Promise.resolve('Notification' in window ? Notification.permission : 'denied');
}
function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [300, 150, 300] }))
    .catch(() => {});
}

function startTimer(id) {
  const t = taskById(id);
  if (!t) return;
  unlockAudio();
  askNotificationPermission();
  timers[id] = { end: Date.now() + t.mins * 60000 };
  saveTimers();
  document.title = 'Daily checklist';
  render();
}

function finishTimer(t) {
  delete timers[t.id];
  saveTimers();
  const before = dayProgress(dateFor(todayKey)).complete;
  const mins = (state.minutes[todayKey] && state.minutes[todayKey][t.id]) || 0;
  setDayValue('minutes', todayKey, t.id, mins + t.mins);
  setDone(todayKey, t.id, true);
  if (t.metric) openNotes.add(t.id);
  chime();
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 700]);
  document.title = 'Time is up: ' + t.title;
  if (document.hidden) notify('Time is up', t.title + ' is done. Nice work.', 'timer-' + t.id);
  else toast('Time is up: ' + t.title + (t.metric ? '. Log your ' + t.metric + ' below.' : ''));
  render();
  if (!before && dayProgress(dateFor(todayKey)).complete) celebrate();
}

function tickTimers() {
  for (const id of Object.keys(timers)) {
    const t = taskById(id);
    if (!t) { delete timers[id]; saveTimers(); continue; }
    if (timers[id].end && Date.now() >= timers[id].end) { finishTimer(t); return; }
  }
  document.querySelectorAll('[data-timer]').forEach((btn) => {
    const id = btn.getAttribute('data-timer');
    if (timers[id] && timers[id].end) btn.textContent = 'Pause ' + fmt(timerLeft(id));
  });
}

// ---------- Helpers ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
function scheduleText(t) {
  if (!t.days || t.days.length === 7) return 'Every day';
  if (t.days.length === 0) return 'Never scheduled';
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter((d) => t.days.includes(d));
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '6,0') return 'Weekends';
  return sorted.map((d) => WEEKDAYS[d]).join(', ');
}
function newId() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

// ---------- Rendering: today ----------

const openNotes = new Set();

function noteBlock(k, t, editable) {
  const note = (state.notes[k] && state.notes[k][t.id]) || '';
  const metric = state.metrics[k] && state.metrics[k][t.id];
  const open = openNotes.has(k + '|' + t.id) || (k === todayKey && openNotes.has(t.id));
  if (!editable) {
    let out = '';
    if (metric !== undefined && t.metric) out += '<div class="note-preview">' + esc(metric + ' ' + t.metric) + '</div>';
    if (note) out += '<div class="note-preview">' + esc(note) + '</div>';
    return out;
  }
  if (!open) {
    let preview = '';
    if (metric !== undefined && t.metric) preview += esc(metric + ' ' + t.metric) + (note ? ' · ' : '');
    if (note) preview += esc(note.length > 90 ? note.slice(0, 90) + '…' : note);
    return '<div class="note-row">' +
      (preview ? '<div class="note-preview">' + preview + '</div>' : '') +
      '<button class="link" type="button" data-action="note-open" data-key="' + k + '" data-id="' + esc(t.id) + '">' +
        (preview ? 'Edit note' : (t.metric ? 'Add note or ' + esc(t.metric) : 'Add note')) +
      '</button></div>';
  }
  return '<div class="note-edit">' +
    (t.metric
      ? '<label class="metric-input"><input type="number" inputmode="decimal" min="0" step="any" data-input="metric" data-key="' + k + '" data-id="' + esc(t.id) + '" value="' + (metric !== undefined ? esc(metric) : '') + '" aria-label="' + esc(t.metric) + '"> ' + esc(t.metric) + '</label>'
      : '') +
    '<textarea data-input="note" data-key="' + k + '" data-id="' + esc(t.id) + '" placeholder="What did you do? Links, thoughts, problem names…" aria-label="Note for ' + esc(t.title) + '">' + esc(note) + '</textarea>' +
    '<div><button class="link" type="button" data-action="note-close" data-key="' + k + '" data-id="' + esc(t.id) + '">Done</button></div>' +
  '</div>';
}

function renderTasks() {
  const today = dateFor(todayKey);
  const due = dueTasks(today);
  const p = dayProgress(today);
  document.getElementById('summary').textContent =
    due.length === 0 ? 'Rest day. Nothing scheduled.' :
    p.complete ? 'All done for today.' : p.done + ' of ' + p.due + ' done';
  document.getElementById('barfill').style.width = (due.length ? p.done / p.due * 100 : 0) + '%';

  if (due.length === 0) {
    document.getElementById('tasks').innerHTML = '<li class="empty">Nothing is scheduled today. Enjoy the rest, or add tasks in Settings.</li>';
    return;
  }

  document.getElementById('tasks').innerHTML = due.map((t) => {
    const done = isDone(todayKey, t.id);
    let sub = t.sub;
    let extra = '';
    if (t.type === 'book') {
      if (t.progress >= 100) {
        sub = 'Finished. Nice work.';
        extra = '<div class="row-actions">' +
          '<button class="btn" type="button" data-action="book-new" data-id="' + esc(t.id) + '">Start a new book</button>' +
          '<button class="btn" type="button" data-action="book-smokefree" data-id="' + esc(t.id) + '">Switch to “Smoke-free today”</button>' +
        '</div>';
      } else {
        extra = '<div class="book-progress">' +
          '<input type="range" min="0" max="100" step="1" value="' + t.progress + '" data-input="book" data-id="' + esc(t.id) + '" aria-label="Book progress">' +
          '<div class="pct" data-pct="' + esc(t.id) + '">' + t.progress + '% read</div>' +
        '</div>';
      }
    }
    return '<li class="task' + (done ? ' done' : '') + '">' +
      '<button class="check" type="button" role="checkbox" aria-checked="' + done + '" aria-label="' + esc(t.title) + '" data-action="toggle" data-id="' + esc(t.id) + '">' + TICK + '</button>' +
      '<div class="body">' +
        '<p class="title" data-action="toggle" data-id="' + esc(t.id) + '">' + esc(t.title) + '</p>' +
        (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') +
        extra +
        noteBlock(todayKey, t, true) +
      '</div>' +
      (t.type === 'timer' ? '<div class="timers">' + timerButtons(t) + '</div>' : '') +
    '</li>';
  }).join('');
}

// ---------- Rendering: smoke-free ----------

function money(n) {
  const c = state.quit.currency || '';
  return c + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderSmoke() {
  const q = state.quit;
  let html = '';
  if (!q.date) {
    html += '<p class="big">Track your smoke-free time</p>' +
      '<p class="muted">Set your quit date to see days smoke-free, cigarettes not smoked and money saved.</p>' +
      '<div class="row-actions"><button class="btn" type="button" data-action="open-settings" data-section="smoke">Set quit date</button></div>';
  } else {
    const start = dateFor(q.date);
    start.setHours(0, 0, 0, 0);
    const elapsed = Date.now() - start.getTime();
    if (elapsed < 0) {
      const n = Math.ceil(-elapsed / DAY_MS);
      html += '<p class="big">Quit day in ' + plural(n, 'day') + '</p><p class="muted">You’ve got this. Keep reading the book until then.</p>';
    } else {
      const days = Math.floor(elapsed / DAY_MS);
      const hours = Math.floor((elapsed % DAY_MS) / 3600000);
      const notSmoked = Math.floor(elapsed / DAY_MS * (Number(q.perDay) || 0));
      const saved = (Number(q.packPrice) || 0) * notSmoked / (Number(q.packSize) || 20);
      html += '<p class="big">' + plural(days, 'day') + ', ' + plural(hours, 'hour') + ' smoke-free</p>' +
        '<p class="muted">' + notSmoked.toLocaleString() + ' cigarettes not smoked' +
        (Number(q.packPrice) > 0 ? ' · ' + esc(money(saved)) + ' saved' : '') + '</p>';
    }
  }

  // Cravings over the last 14 days
  const counts = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(dateFor(todayKey), -i);
    const startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    counts.push(state.cravings.filter((ts) => ts >= startMs && ts < startMs + DAY_MS).length);
  }
  const todayCount = counts[13];
  const weekCount = counts.slice(7).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);
  html += '<button class="btn primary craving-btn" type="button" data-action="craving">I’m having a craving</button>';
  if (state.cravings.length) {
    html += '<p class="muted">Cravings: ' + todayCount + ' today · ' + weekCount + ' in the last 7 days</p>' +
      '<div class="minibars" role="img" aria-label="Cravings per day over the last 14 days: ' + counts.join(', ') + '">' +
        counts.map((c) => '<i class="' + (c ? '' : 'zero') + '" style="height:' + (c ? Math.max(8, c / max * 100) : 6) + '%" title="' + c + '"></i>').join('') +
      '</div><div class="minibar-labels"><span>2 weeks ago</span><span>Today</span></div>';
  }
  document.getElementById('smoke').innerHTML = html;
}

// ---------- Rendering: week, calendar, habits ----------

let calMonth = new Date(dateFor(todayKey).getFullYear(), dateFor(todayKey).getMonth(), 1, 12);

function cellPct(d) {
  const p = dayProgress(d);
  return p.due ? Math.round(p.done / p.due * 100) : 0;
}

function renderWeek(info) {
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = addDays(dateFor(todayKey), -i);
    const k = keyFor(d);
    const p = dayProgress(d);
    const cls = ['day'];
    if (i === 0) cls.push('today');
    if (p.due === 0) cls.push('rest');
    if (info.frozen.has(k)) cls.push('frozen');
    html += '<button type="button" class="' + cls.join(' ') + '" data-action="day-open" data-key="' + k + '" aria-label="' +
      esc(d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ': ' + (p.due ? p.done + ' of ' + p.due + ' done' : 'rest day')) + '">' +
      '<i style="background-size:100% ' + cellPct(d) + '%"></i>' +
      d.toLocaleDateString('en-GB', { weekday: 'short' }) +
    '</button>';
  }
  document.getElementById('days').innerHTML = html;

  let text;
  if (info.current > 0) {
    text = info.current + '-day streak';
    if (info.best > info.current) text += ' · best ' + info.best;
    const next = MILESTONES.find((m) => m > info.current);
    if (next) text += ' · ' + (next - info.current) + ' to ' + next;
  } else {
    text = info.best > 0 ? 'Finish today’s tasks to start a new streak. Best so far: ' + info.best + ' days.' : 'Finish today’s tasks to start a streak.';
  }
  if (state.settings.freeze) text += info.freezeUsedThisWeek ? ' · Freeze used this week' : ' · 1 freeze available this week';
  document.getElementById('streak').textContent = text;
}

function renderCalendar(info) {
  document.getElementById('calTitle').textContent = calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1, 12);
  const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  let html = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l) => '<div class="cal-dow" aria-hidden="true">' + l + '</div>').join('');
  for (let i = 0; i < lead; i++) html += '<div></div>';
  for (let n = 1; n <= daysInMonth; n++) {
    const d = new Date(calMonth.getFullYear(), calMonth.getMonth(), n, 12);
    const k = keyFor(d);
    const future = k > todayKey;
    const p = dayProgress(d);
    const pct = future ? 0 : cellPct(d);
    const cls = ['cal-cell'];
    if (k === todayKey) cls.push('today');
    if (future) cls.push('future');
    if (p.due === 0) cls.push('rest');
    if (pct >= 60) cls.push('full');
    if (info.frozen.has(k)) cls.push('frozen');
    const bg = pct ? 'background:color-mix(in srgb, var(--accent) ' + pct + '%, transparent)' : '';
    html += '<button type="button" class="' + cls.join(' ') + '" style="' + bg + '" data-action="day-open" data-key="' + k + '"' +
      (future ? ' disabled' : '') + ' aria-label="' + esc(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) + ': ' + (p.due ? pct + '% done' : 'rest day')) + '">' + n + '</button>';
  }
  document.getElementById('cal').innerHTML = html;
  const nextBtn = document.querySelector('[data-action="cal-next"]');
  nextBtn.disabled = calMonth.getFullYear() === dateFor(todayKey).getFullYear() && calMonth.getMonth() === dateFor(todayKey).getMonth();
}

function sparkline(values) {
  const w = 300, h = 48, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : pad + i * (w - pad * 2) / (values.length - 1);
    const y = h - pad - (v - min) / span * (h - pad * 2);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const last = pts[pts.length - 1];
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="Trend of the last ' + values.length + ' entries">' +
    '<polyline points="' + pts.map((p) => p.join(',')).join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
    '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" fill="var(--accent)"/>' +
  '</svg>';
}

function renderHabits() {
  if (!state.tasks.length) {
    document.getElementById('habits').innerHTML = '<p class="empty">Add tasks in Settings to see stats here.</p>';
    return;
  }
  const today = dateFor(todayKey);
  document.getElementById('habits').innerHTML = state.tasks.map((t) => {
    const info = streakInfo(t.id);
    let due = 0, done = 0;
    for (let i = 0; i < 30; i++) {
      const d = addDays(today, -i);
      if (!isDue(t, d)) continue;
      const k = keyFor(d);
      if (i === 0 && !isDone(k, t.id)) continue; // today isn't over yet
      due++;
      if (isDone(k, t.id)) done++;
    }
    const stats = [
      ['Current streak', info.current],
      ['Best streak', info.best],
      ['Last 30 days', due ? Math.round(done / due * 100) + '%' : '–']
    ];
    if (t.type === 'timer') {
      let total = 0;
      for (const k of Object.keys(state.minutes)) total += Number(state.minutes[k][t.id]) || 0;
      stats.push(['Time logged', total >= 60 ? (total / 60).toFixed(1) + ' h' : total + ' min']);
    }
    if (t.type === 'book') stats.push(['Book read', t.progress + '%']);

    let spark = '';
    if (t.metric) {
      const entries = Object.keys(state.metrics).sort()
        .filter((k) => state.metrics[k][t.id] !== undefined && state.metrics[k][t.id] !== '')
        .map((k) => Number(state.metrics[k][t.id])).filter((n) => !isNaN(n)).slice(-30);
      if (entries.length) {
        const best = Math.max(...entries);
        stats.push(['Latest ' + t.metric, entries[entries.length - 1]]);
        stats.push(['Best ' + t.metric, best]);
        if (entries.length > 1) {
          spark = '<div class="spark">' + sparkline(entries) +
            '<div class="cap"><span>' + esc(t.metric) + ', last ' + entries.length + ' sessions</span><span>' + entries[entries.length - 1] + '</span></div></div>';
        }
      } else {
        spark = '<p class="muted">Log your ' + esc(t.metric) + ' after each session to see your progress here.</p>';
      }
    }
    return '<div class="habit"><p class="habit-title">' + esc(t.title) + '</p>' +
      '<div class="stats">' + stats.map((s) => '<div class="stat"><b>' + esc(s[1]) + '</b><span>' + esc(s[0]) + '</span></div>').join('') + '</div>' +
      spark + '</div>';
  }).join('');
}

function render() {
  document.getElementById('date').textContent =
    dateFor(todayKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  renderTasks();
  renderSmoke();
  const info = streakInfo();
  renderWeek(info);
  renderCalendar(info);
  renderHabits();
  renderSyncStatus();
}

// ---------- Celebration ----------

function celebrate() {
  const s = streakInfo().current;
  const milestone = MILESTONES.includes(s);
  toast(milestone ? s + '-day streak! That’s a milestone. 🎉' : 'All done for today' + (s > 1 ? ' · ' + s + '-day streak' : '') + '. 🎉');
  if (navigator.vibrate) navigator.vibrate(milestone ? [100, 60, 100, 60, 300] : 120);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#2B4BD8', '#7C93FF', '#12805C', '#F5A524', '#E5484D', '#4CC79A'];
  const parts = Array.from({ length: milestone ? 220 : 130 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 12 - 4,
    size: 5 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));
  const startT = performance.now();
  function frame(t) {
    const age = t - startT;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (age < 2600) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  requestAnimationFrame(frame);
}

// ---------- Craving / breathing ----------

let breathTimer = null;
function openBreathing() {
  state.cravings.push(Date.now());
  if (state.cravings.length > 3000) state.cravings = state.cravings.slice(-3000);
  save();
  render();
  const el = document.getElementById('breath');
  const circle = document.getElementById('breathCircle');
  const label = document.getElementById('breathLabel');
  const time = document.getElementById('breathTime');
  const tip = document.getElementById('breathTip');
  el.classList.add('open');
  el.querySelector('button').focus();
  const end = Date.now() + 180000;
  let phaseEnd = 0, phase = 'out', tipIndex = Math.floor(Math.random() * CRAVING_TIPS.length);
  tip.textContent = CRAVING_TIPS[tipIndex];
  let lastTip = Date.now();
  function step() {
    const now = Date.now();
    if (now >= phaseEnd) {
      phase = phase === 'in' ? 'out' : 'in';
      phaseEnd = now + (phase === 'in' ? 4000 : 6000);
      circle.className = 'breath-circle ' + phase;
      label.textContent = phase === 'in' ? 'Breathe in' : 'Breathe out';
    }
    if (now - lastTip > 20000) {
      tipIndex = (tipIndex + 1) % CRAVING_TIPS.length;
      tip.textContent = CRAVING_TIPS[tipIndex];
      lastTip = now;
    }
    if (now >= end) {
      time.textContent = 'Well done';
      tip.textContent = 'That craving is behind you. Each one gets easier.';
      clearInterval(breathTimer);
      breathTimer = null;
      circle.className = 'breath-circle';
      label.textContent = 'Done';
      return;
    }
    time.textContent = fmt(end - now);
  }
  clearInterval(breathTimer);
  step();
  breathTimer = setInterval(step, 250);
}
function closeBreathing() {
  clearInterval(breathTimer);
  breathTimer = null;
  document.getElementById('breath').classList.remove('open');
  toast('Craving logged. Well done for getting through it.');
}

// ---------- Day dialog ----------

let dayDlgKey = null;
function openDay(k) {
  if (k > todayKey) return;
  dayDlgKey = k;
  renderDay();
  const dlg = document.getElementById('dayDlg');
  if (!dlg.open) dlg.showModal();
}
function renderDay() {
  const k = dayDlgKey;
  const d = dateFor(k);
  document.getElementById('dayTitle').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const tasks = state.tasks.filter((t) => isDue(t, d) || isDone(k, t.id));
  const info = streakInfo();
  let html = '';
  if (info.frozen.has(k)) html += '<p class="muted">❄ A streak freeze covered this day.</p>';
  if (!tasks.length) html += '<p class="muted">Rest day. Nothing was scheduled.</p>';
  html += tasks.map((t) => {
    const done = isDone(k, t.id);
    const mins = state.minutes[k] && state.minutes[k][t.id];
    return '<div class="day-task">' +
      '<button class="check" type="button" role="checkbox" aria-checked="' + done + '" aria-label="' + esc(t.title) + '" data-action="day-toggle" data-key="' + k + '" data-id="' + esc(t.id) + '">' + TICK + '</button>' +
      '<div class="body"><p class="title" data-action="day-toggle" data-key="' + k + '" data-id="' + esc(t.id) + '">' + esc(t.title) + '</p>' +
        (mins ? '<p class="sub">' + mins + ' min timed</p>' : '') +
        (isDue(t, d) ? '' : '<p class="sub">Not scheduled this day</p>') +
        noteBlock(k, t, true) +
      '</div></div>';
  }).join('');
  if (k !== todayKey) html += '<p class="muted" style="margin-top:14px">Forgot to tick something? Fix it here and your streak updates.</p>';
  document.getElementById('dayBody').innerHTML = html;
}

// ---------- Settings dialog ----------

function openSettings(section) {
  renderSettings();
  const dlg = document.getElementById('settingsDlg');
  if (!dlg.open) dlg.showModal();
  if (section) {
    const el = document.getElementById('set-' + section);
    if (el) el.scrollIntoView({ block: 'start' });
  }
  loadIdentity().then(renderAccount, renderAccount);
}

function renderSettings() {
  const s = state.settings, q = state.quit;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const tasksHtml = state.tasks.map((t, i) =>
    '<div class="task-row">' +
      '<div class="grow"><b>' + esc(t.title) + '</b><span>' + esc(scheduleText(t)) +
        (t.type === 'timer' ? ' · ' + t.mins + ' min timer' : t.type === 'book' ? ' · book' : '') + '</span></div>' +
      '<button class="icon-btn" type="button" data-action="task-up" data-id="' + esc(t.id) + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="icon-btn" type="button" data-action="task-down" data-id="' + esc(t.id) + '" aria-label="Move down"' + (i === state.tasks.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button class="btn" type="button" data-action="task-edit" data-id="' + esc(t.id) + '">Edit</button>' +
    '</div>').join('');

  document.getElementById('settingsBody').innerHTML =
    '<div class="dlg-section" id="set-tasks"><h3>Tasks</h3>' + (tasksHtml || '<p class="muted">No tasks yet.</p>') +
      '<div class="row-actions"><button class="btn primary" type="button" data-action="task-add">Add task</button></div></div>' +

    '<div class="dlg-section" id="set-smoke"><h3>Smoke-free</h3>' +
      '<label class="field"><span>Quit date</span><input type="date" data-setting="quit.date" value="' + esc(q.date) + '"></label>' +
      '<div class="grid2">' +
        '<label class="field"><span>Cigarettes a day (before)</span><input type="number" min="0" inputmode="numeric" data-setting="quit.perDay" value="' + esc(q.perDay) + '"></label>' +
        '<label class="field"><span>Cigarettes per pack</span><input type="number" min="1" inputmode="numeric" data-setting="quit.packSize" value="' + esc(q.packSize) + '"></label>' +
        '<label class="field"><span>Price per pack</span><input type="number" min="0" step="0.01" inputmode="decimal" data-setting="quit.packPrice" value="' + esc(q.packPrice) + '"></label>' +
        '<label class="field"><span>Currency symbol</span><input type="text" maxlength="4" data-setting="quit.currency" value="' + esc(q.currency) + '" placeholder="e.g. ₹, £, $"></label>' +
      '</div></div>' +

    '<div class="dlg-section" id="set-streak"><h3>Streak</h3>' +
      '<label class="check-line"><input type="checkbox" data-setting="settings.freeze"' + (s.freeze ? ' checked' : '') + '> Allow one streak freeze per week</label>' +
      '<p class="muted">If you miss one day in a week, the freeze covers it so your streak keeps going. Days with nothing scheduled never break a streak.</p></div>' +

    '<div class="dlg-section" id="set-alerts"><h3>Timer alerts</h3>' +
      '<label class="check-line"><input type="checkbox" data-setting="settings.sound"' + (s.sound ? ' checked' : '') + '> Play a sound when a timer finishes</label>' +
      '<p class="muted">The phone also vibrates, and shows a notification if the app is in the background.</p>' +
      (perm === 'default' ? '<div class="row-actions"><button class="btn" type="button" data-action="allow-notifications">Allow notifications</button></div>' : '') +
      (perm === 'denied' ? '<p class="msg error">Notifications are blocked. Turn them on for this app in your phone’s settings.</p>' : '') +
    '</div>' +

    '<div class="dlg-section" id="set-reminder"><h3>Daily reminder</h3>' +
      '<label class="field"><span>Remind me at</span><input type="time" data-setting="settings.reminder" value="' + esc(s.reminder) + '"></label>' +
      '<label class="check-line"><input type="checkbox" data-action-change="reminder-toggle"' + (device.reminderOn ? ' checked' : '') + '> Remind me if tasks are still open</label>' +
      '<p class="muted" id="reminderNote">' + (device.signedIn
        ? 'Reminders are sent to this phone even when the app is closed.'
        : 'Sign in below to get reminders when the app is closed. Without an account, reminders only work while the app is open.') + '</p></div>' +

    '<div class="dlg-section" id="set-theme"><h3>Appearance</h3><div class="seg" role="group" aria-label="Theme">' +
      ['system', 'light', 'dark'].map((v) => '<button type="button" data-action="theme" data-value="' + v + '" aria-pressed="' + (s.theme === v) + '">' + v[0].toUpperCase() + v.slice(1) + '</button>').join('') +
    '</div></div>' +

    '<div class="dlg-section" id="set-account"><h3>Account &amp; sync</h3><div id="accountBox"><p class="muted">Loading…</p></div></div>' +

    '<div class="dlg-section" id="set-backup"><h3>Backup</h3>' +
      '<p class="muted">Save all your ticks, notes and settings to a file, or restore them from one.</p>' +
      '<div class="row-actions"><button class="btn" type="button" data-action="export">Export backup</button>' +
      '<button class="btn" type="button" data-action="import">Import backup</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden></div></div>';
}

// ---------- Task editor ----------

let editingId = null;
function openTaskEditor(id) {
  editingId = id;
  const t = id ? taskById(id) : { id: '', type: 'check', title: '', sub: '', mins: 15, metric: '', progress: 0, days: null };
  const days = t.days || [0, 1, 2, 3, 4, 5, 6];
  document.getElementById('taskTitle').textContent = id ? 'Edit task' : 'New task';
  document.getElementById('taskBody').innerHTML =
    '<form id="taskForm" class="dlg-section">' +
      '<label class="field"><span>Title</span><input type="text" name="title" required maxlength="80" value="' + esc(t.title) + '"></label>' +
      '<label class="field"><span>Details (optional)</span><input type="text" name="sub" maxlength="120" value="' + esc(t.sub) + '"></label>' +
      '<label class="field"><span>Type</span><select name="type">' +
        [['check', 'Tick off'], ['timer', 'Timer'], ['book', 'Book with progress']].map((o) =>
          '<option value="' + o[0] + '"' + (t.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select></label>' +
      '<label class="field" data-only="timer"><span>Minutes</span><input type="number" name="mins" min="1" max="600" inputmode="numeric" value="' + t.mins + '"></label>' +
      '<label class="field"><span>Number to log after each session (optional, e.g. WPM, pages)</span><input type="text" name="metric" maxlength="16" value="' + esc(t.metric || '') + '"></label>' +
      '<div class="field"><span>Days</span><div class="chips">' +
        [1, 2, 3, 4, 5, 6, 0].map((d) => '<label class="chip"><input type="checkbox" name="days" value="' + d + '"' + (days.includes(d) ? ' checked' : '') + '><span>' + WEEKDAYS[d] + '</span></label>').join('') +
      '</div></div>' +
      '<p class="msg error" id="taskError" hidden></p>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Save</button>' +
        (id ? '<button class="btn danger" type="button" data-action="task-delete" data-id="' + esc(id) + '">Delete task</button>' : '') +
      '</div>' +
    '</form>';
  syncTaskFormVisibility();
  document.getElementById('taskDlg').showModal();
}
function syncTaskFormVisibility() {
  const form = document.getElementById('taskForm');
  if (!form) return;
  form.querySelector('[data-only="timer"]').hidden = form.type.value !== 'timer';
}
function saveTaskForm(form) {
  const title = form.title.value.trim();
  const days = Array.from(form.querySelectorAll('input[name="days"]:checked')).map((i) => Number(i.value));
  const err = document.getElementById('taskError');
  if (!title) { err.textContent = 'Give the task a title.'; err.hidden = false; return; }
  if (!days.length) { err.textContent = 'Pick at least one day.'; err.hidden = false; return; }
  const data = {
    title,
    sub: form.sub.value.trim(),
    type: form.type.value,
    mins: Math.max(1, Math.min(600, Number(form.mins.value) || 15)),
    metric: form.metric.value.trim(),
    days: days.length === 7 ? null : days
  };
  if (editingId) {
    Object.assign(taskById(editingId), data);
    if (data.type !== 'timer' && timers[editingId]) { delete timers[editingId]; saveTimers(); }
  } else {
    state.tasks.push({ id: newId(), progress: 0, ...data });
  }
  save();
  document.getElementById('taskDlg').close();
  renderSettings();
  renderAccount();
  render();
}

// ---------- Theme ----------

function applyTheme() {
  const theme = state.settings.theme;
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas[0].content = theme === 'dark' ? '#12161C' : '#F6F8FB';
  metas[1].content = theme === 'light' ? '#F6F8FB' : '#12161C';
}

// ---------- Backup ----------

function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'daily-checklist', exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'checklist-backup-' + todayKey + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup saved.');
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || typeof data !== 'object' || (!Array.isArray(data.tasks) && !data.days)) throw new Error('bad');
      if (!confirm('Replace everything in the app with this backup? This can’t be undone.')) return;
      state = normalize(data);
      save();
      applyTheme();
      renderSettings();
      renderAccount();
      render();
      toast('Backup restored.');
    } catch (e) {
      toast('That file isn’t a checklist backup.');
    }
  };
  reader.readAsText(file);
}

// ---------- Account & sync ----------

let identity = null;
let identityPromise = null;
let currentUser = null;
let syncState = 'idle'; // idle | syncing | error | offline
let syncTimer = null;
let accountMsg = null;  // { text, kind }
let recoveryMode = false;

function loadIdentity() {
  if (!identityPromise) {
    identityPromise = import(IDENTITY_URL).then(async (mod) => {
      identity = mod;
      currentUser = await mod.getUser();
      mod.onAuthChange((event, user) => {
        currentUser = user;
        if (event === 'logout') onSignedOut();
        if (event === 'login' && user) onSignedIn(user);
        renderAccount();
        renderSyncStatus();
      });
      if (currentUser) onSignedIn(currentUser, true);
      else if (device.signedIn) onSignedOut();
      return mod;
    }).catch((e) => {
      identityPromise = null;
      throw e;
    });
  }
  return identityPromise;
}

function onSignedIn(user, quiet) {
  const first = !device.signedIn;
  device.signedIn = true;
  device.email = user.email || '';
  saveDevice();
  syncNow(first).then(() => {
    if (device.reminderOn) enableReminder(true);
  });
  if (!quiet) toast('Signed in as ' + (user.email || 'you') + '.');
}
function onSignedOut() {
  device.signedIn = false;
  device.syncedAt = 0;
  device.email = '';
  saveDevice();
  renderSyncStatus();
}

function hasLocalData() {
  return Object.keys(state.days).some((k) => state.days[k].length) || state.cravings.length > 0 || !!state.quit.date;
}

function applyRemote(data, updatedAt) {
  state = normalize(data);
  state.updatedAt = updatedAt;
  persist();
  device.syncedAt = updatedAt;
  saveDevice();
  applyTheme();
  render();
  if (document.getElementById('settingsDlg').open) { renderSettings(); renderAccount(); }
}

async function syncNow(firstLink) {
  if (!device.signedIn || !navigator.onLine) { renderSyncStatus(); return; }
  if (syncState === 'syncing') return;
  syncState = 'syncing';
  renderSyncStatus();
  try {
    if (identity) await identity.getUser(); // refreshes the session cookie if needed
    const res = await fetch('/api/sync', { credentials: 'same-origin' });
    if (res.status === 401) throw new Error('auth');
    if (!res.ok) throw new Error('http');
    const remote = await res.json();
    const localChanged = state.updatedAt > device.syncedAt;
    if (remote.data && remote.updatedAt > device.syncedAt) {
      if (firstLink && hasLocalData()) {
        const when = new Date(remote.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        if (confirm('Your account already has saved progress (last changed ' + when + ').\n\nOK: use the account’s progress on this phone.\nCancel: keep this phone’s progress and upload it.')) {
          applyRemote(remote.data, remote.updatedAt);
        } else {
          state.updatedAt = Math.max(Date.now(), remote.updatedAt + 1);
          persist();
          await pushState();
        }
      } else if (localChanged && state.updatedAt > remote.updatedAt) {
        await pushState();
      } else {
        applyRemote(remote.data, remote.updatedAt);
      }
    } else if (localChanged || !remote.data) {
      if (!state.updatedAt) { state.updatedAt = Date.now(); persist(); }
      await pushState();
    }
    syncState = 'idle';
  } catch (e) {
    syncState = e && e.message === 'auth' ? 'auth' : 'error';
  }
  renderSyncStatus();
}

async function pushState() {
  const res = await fetch('/api/sync', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: state, updatedAt: state.updatedAt })
  });
  if (res.status === 409) {
    const remote = await res.json();
    applyRemote(remote.data, remote.updatedAt);
    return;
  }
  if (res.status === 401) throw new Error('auth');
  if (!res.ok) throw new Error('http');
  device.syncedAt = state.updatedAt;
  saveDevice();
}

function scheduleSync() {
  if (!device.signedIn) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const run = () => (identity ? syncNow() : loadIdentity().then(() => syncNow(), () => {}));
    run();
  }, 1500);
}

function renderSyncStatus() {
  const el = document.getElementById('syncStatus');
  if (!device.signedIn) { el.textContent = 'Saved on this phone'; return; }
  if (!navigator.onLine) { el.textContent = 'Offline · will sync later'; return; }
  el.textContent = {
    syncing: 'Syncing…',
    error: 'Couldn’t sync · will retry',
    auth: 'Sign in again to sync',
    idle: state.updatedAt > device.syncedAt ? 'Waiting to sync' : 'Synced'
  }[syncState] || '';
}

function renderAccount() {
  const box = document.getElementById('accountBox');
  if (!box) return;
  const msg = accountMsg ? '<p class="msg ' + accountMsg.kind + '">' + esc(accountMsg.text) + '</p>' : '';
  if (!identity) {
    box.innerHTML = '<p class="muted">' + (navigator.onLine ? 'Couldn’t load sign-in right now. Try again in a moment.' : 'You’re offline. Connect to the internet to sign in.') + '</p>' + msg;
    return;
  }
  if (recoveryMode && currentUser) {
    box.innerHTML = '<form id="recoveryForm"><label class="field"><span>New password</span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>' +
      '<div class="row-actions"><button class="btn primary" type="submit">Set new password</button></div></form>' + msg;
    return;
  }
  if (currentUser) {
    box.innerHTML = '<p>Signed in as <b>' + esc(currentUser.email || '') + '</b></p>' +
      '<p class="muted">Your progress is saved to your account and syncs across your devices.</p>' +
      '<div class="row-actions"><button class="btn" type="button" data-action="sync-now">Sync now</button>' +
      '<button class="btn danger" type="button" data-action="sign-out">Sign out</button></div>' + msg;
    return;
  }
  box.innerHTML =
    '<p class="muted">Optional. Sign in to back up your progress online, sync it across devices and get reminders when the app is closed.</p>' +
    '<form id="authForm">' +
      '<label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>' +
      '<label class="field"><span>Password</span><input type="password" name="password" minlength="8" required autocomplete="current-password"></label>' +
      '<div class="row-actions"><button class="btn primary" type="submit" name="mode" value="login">Sign in</button>' +
      '<button class="btn" type="submit" name="mode" value="signup">Create account</button>' +
      '<button class="link" type="button" data-action="forgot">Forgot password?</button></div>' +
    '</form>' + msg;
}

function authErrorText(e) {
  if (e && e.name === 'MissingIdentityError') return 'Accounts aren’t available on this site yet.';
  const status = e && e.status;
  if (status === 401) return 'Wrong email or password, or the email isn’t confirmed yet.';
  if (status === 403) return 'New accounts aren’t allowed right now.';
  if (status === 422) return 'Check your email and password (at least 8 characters).';
  return (e && e.message) || 'Something went wrong. Try again.';
}

async function handleAuthSubmit(form, mode) {
  const email = form.email.value.trim();
  const password = form.password.value;
  accountMsg = null;
  form.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    const id = await loadIdentity();
    if (mode === 'signup') {
      const user = await id.signup(email, password);
      if (!user.emailVerified) accountMsg = { text: 'Check your email and tap the link to confirm your account.', kind: 'ok' };
    } else {
      await id.login(email, password);
    }
  } catch (e) {
    accountMsg = { text: authErrorText(e), kind: 'error' };
  }
  renderAccount();
}

async function handleAuthCallback() {
  if (!/(access_token|confirmation_token|recovery_token|invite_token|email_change_token)=/.test(location.hash)) return;
  try {
    const id = await loadIdentity();
    const result = await id.handleAuthCallback();
    if (!result) return;
    currentUser = result.user || currentUser;
    if (result.type === 'confirmation') toast('Email confirmed. You’re signed in.');
    if (result.type === 'recovery') {
      recoveryMode = true;
      openSettings('account');
    }
    if (result.type === 'email_change') toast('Email address updated.');
  } catch (e) {
    toast(authErrorText(e));
  }
}

// ---------- Reminders ----------

function reminderMinutes() {
  const [h, m] = (state.settings.reminder || '20:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function urlB64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function enableReminder(quiet) {
  const perm = await askNotificationPermission();
  if (perm !== 'granted') {
    device.reminderOn = false;
    saveDevice();
    if (!quiet) toast('Allow notifications to get reminders.');
    if (document.getElementById('settingsDlg').open) renderSettings(), renderAccount();
    return;
  }
  device.reminderOn = true;
  saveDevice();
  if (!device.signedIn || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (!quiet) toast('Reminder on. It works while the app is open.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await fetch('/api/push/key').then((r) => r.json());
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        reminderMinutes: reminderMinutes(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      })
    });
    if (!res.ok) throw new Error('subscribe');
    if (!quiet) toast('Reminder set for ' + state.settings.reminder + '.');
  } catch (e) {
    if (!quiet) toast('Couldn’t set up the reminder on this phone. It still works while the app is open.');
  }
}

async function disableReminder() {
  device.reminderOn = false;
  saveDevice();
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = reg.pushManager && (await reg.pushManager.getSubscription());
      if (sub) {
        if (device.signedIn) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint })
          }).catch(() => {});
        }
        await sub.unsubscribe();
      }
    }
  } catch (e) {}
  toast('Reminder off.');
}

// Fallback while the app is open (and the only option without an account).
function checkLocalReminder() {
  if (!device.reminderOn || device.localReminderSent === todayKey) return;
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < reminderMinutes()) return;
  const p = dayProgress(dateFor(todayKey));
  device.localReminderSent = todayKey;
  saveDevice();
  if (device.signedIn || p.due === 0 || p.complete) return; // the server sends it for signed-in users
  const left = p.due - p.done;
  notify('Daily checklist', (left === 1 ? '1 task' : left + ' tasks') + ' left today. You’ve got this.', 'reminder');
}

// ---------- Events ----------

function moveTask(id, dir) {
  const i = state.tasks.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.tasks.length) return;
  const [t] = state.tasks.splice(i, 1);
  state.tasks.splice(j, 0, t);
  save();
  renderSettings();
  renderAccount();
  render();
}

function setSetting(path, value) {
  const [group, key] = path.split('.');
  state[group][key] = value;
  save();
  if (path === 'settings.reminder' && device.reminderOn) enableReminder(true);
  render();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const action = el.getAttribute('data-action');
  const id = el.getAttribute('data-id');
  const key = el.getAttribute('data-key');

  switch (action) {
    case 'toggle': toggleToday(id); break;
    case 'timer-start': startTimer(id); break;
    case 'timer-pause':
      timers[id] = { left: timerLeft(id) };
      saveTimers();
      render();
      break;
    case 'timer-resume':
      unlockAudio();
      timers[id] = { end: Date.now() + timers[id].left };
      saveTimers();
      render();
      break;
    case 'timer-cancel':
      delete timers[id];
      saveTimers();
      render();
      break;
    case 'note-open':
      openNotes.add(key + '|' + id);
      if (key === todayKey) openNotes.add(id);
      if (document.getElementById('dayDlg').open) renderDay(); else render();
      { const ta = document.querySelector('textarea[data-key="' + key + '"][data-id="' + CSS.escape(id) + '"]'); if (ta) ta.focus(); }
      break;
    case 'note-close':
      openNotes.delete(key + '|' + id);
      if (key === todayKey) openNotes.delete(id);
      if (document.getElementById('dayDlg').open) renderDay();
      render();
      break;
    case 'book-new': {
      const name = prompt('What are you reading next?');
      if (!name || !name.trim()) break;
      const t = taskById(id);
      t.title = 'Read ' + name.trim();
      t.sub = 'Read a bit today';
      t.progress = 0;
      save();
      render();
      break;
    }
    case 'book-smokefree': {
      const t = taskById(id);
      t.type = 'check';
      t.title = 'Smoke-free today';
      t.sub = 'Not a single puff';
      save();
      render();
      toast('Swapped. Tick it off each smoke-free day.');
      break;
    }
    case 'craving': openBreathing(); break;
    case 'breath-close': closeBreathing(); break;
    case 'day-open': openDay(key); break;
    case 'day-toggle':
      setDone(key, id, !isDone(key, id));
      renderDay();
      render();
      if (key === todayKey && dayProgress(dateFor(todayKey)).complete && isDone(key, id)) celebrate();
      break;
    case 'cal-prev': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1, 12); render(); break;
    case 'cal-next': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1, 12); render(); break;
    case 'open-settings': openSettings(el.getAttribute('data-section')); break;
    case 'close-dialog': el.closest('dialog').close(); break;
    case 'task-add': openTaskEditor(null); break;
    case 'task-edit': openTaskEditor(id); break;
    case 'task-up': moveTask(id, -1); break;
    case 'task-down': moveTask(id, 1); break;
    case 'task-delete':
      if (!confirm('Delete this task? Past ticks stay in your history but won’t count any more.')) break;
      state.tasks = state.tasks.filter((t) => t.id !== id);
      delete timers[id];
      saveTimers();
      save();
      document.getElementById('taskDlg').close();
      renderSettings();
      renderAccount();
      render();
      break;
    case 'theme':
      state.settings.theme = el.getAttribute('data-value');
      save();
      applyTheme();
      renderSettings();
      renderAccount();
      break;
    case 'allow-notifications':
      askNotificationPermission().then(() => { renderSettings(); renderAccount(); });
      break;
    case 'export': exportBackup(); break;
    case 'import': document.getElementById('importFile').click(); break;
    case 'sync-now': syncNow().then(() => toast(syncState === 'idle' ? 'Synced.' : 'Couldn’t sync right now.')); break;
    case 'sign-out':
      if (device.reminderOn) disableReminder();
      identity.logout().catch(() => {}).finally(() => { currentUser = null; onSignedOut(); accountMsg = null; renderAccount(); toast('Signed out. Your progress stays on this phone.'); });
      break;
    case 'forgot': {
      const form = document.getElementById('authForm');
      const email = form && form.email.value.trim();
      if (!email) { accountMsg = { text: 'Enter your email first, then tap “Forgot password?”.', kind: 'error' }; renderAccount(); break; }
      identity.requestPasswordRecovery(email)
        .then(() => { accountMsg = { text: 'Check your email for a link to reset your password.', kind: 'ok' }; })
        .catch((err) => { accountMsg = { text: authErrorText(err), kind: 'error' }; })
        .finally(renderAccount);
      break;
    }
    case 'reset':
      if (!confirm('Clear all ticks for today?')) break;
      state.days[todayKey] = [];
      for (const tid of Object.keys(timers)) delete timers[tid];
      saveTimers();
      save();
      render();
      break;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.id === 'taskForm') saveTaskForm(form);
  if (form.id === 'authForm') handleAuthSubmit(form, (e.submitter && e.submitter.value) || 'login');
  if (form.id === 'recoveryForm') {
    identity.updateUser({ password: form.password.value })
      .then(() => { recoveryMode = false; accountMsg = { text: 'Password updated.', kind: 'ok' }; })
      .catch((err) => { accountMsg = { text: authErrorText(err), kind: 'error' }; })
      .finally(renderAccount);
  }
});

let noteSaveTimer = null;
document.addEventListener('input', (e) => {
  const el = e.target;
  const kind = el.getAttribute('data-input');
  if (kind === 'book') {
    const t = taskById(el.getAttribute('data-id'));
    t.progress = Number(el.value);
    const pct = document.querySelector('[data-pct="' + CSS.escape(t.id) + '"]');
    if (pct) pct.textContent = t.progress + '% read';
  }
  if (kind === 'note') {
    setDayValue('notes', el.getAttribute('data-key'), el.getAttribute('data-id'), el.value.trim() ? el.value : '');
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(save, 400);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  const kind = el.getAttribute('data-input');
  if (kind === 'book') {
    const before = taskById(el.getAttribute('data-id'));
    save();
    render();
    if (before.progress >= 100) toast('You finished the book! 🎉');
  }
  if (kind === 'note') save();
  if (kind === 'metric') {
    const v = el.value.trim();
    setDayValue('metrics', el.getAttribute('data-key'), el.getAttribute('data-id'), v === '' ? '' : Number(v));
    save();
    renderHabits();
  }
  const setting = el.getAttribute('data-setting');
  if (setting) {
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') value = Math.max(0, Number(el.value) || 0);
    setSetting(setting, value);
  }
  if (el.getAttribute('data-action-change') === 'reminder-toggle') {
    if (el.checked) enableReminder(); else disableReminder();
  }
  if (el.id === 'importFile' && el.files[0]) importBackup(el.files[0]);
  if (el.name === 'type' && el.form && el.form.id === 'taskForm') syncTaskFormVisibility();
});

document.querySelectorAll('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
});
document.getElementById('dayDlg').addEventListener('close', () => { dayDlgKey = null; render(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('breath').classList.contains('open')) closeBreathing();
});

function checkNewDay() {
  const k = keyFor(new Date());
  if (k !== todayKey) {
    todayKey = k;
    openNotes.clear();
    render();
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    checkNewDay();
    tickTimers();
    if (device.signedIn) loadIdentity().then(() => syncNow(), () => {});
  }
});
window.addEventListener('online', () => { renderSyncStatus(); if (device.signedIn) loadIdentity().then(() => syncNow(), () => {}); });
window.addEventListener('offline', renderSyncStatus);
setInterval(() => { checkNewDay(); tickTimers(); }, 500);
setInterval(checkLocalReminder, 30000);

// ---------- Start ----------

applyTheme();
persist();
render();
tickTimers();
checkLocalReminder();

// Home-screen shortcuts
const params = new URLSearchParams(location.search);
if (params.has('start') || params.has('craving')) {
  const start = params.get('start');
  if (start) {
    const t = taskById(start) || state.tasks.find((x) => x.type === 'timer' && x.title.toLowerCase().includes(start));
    if (t && t.type === 'timer' && !timers[t.id]) startTimer(t.id);
  }
  if (params.has('craving')) openBreathing();
  history.replaceState(null, '', location.pathname);
}

handleAuthCallback();
if (device.signedIn) loadIdentity().catch(() => renderSyncStatus());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
