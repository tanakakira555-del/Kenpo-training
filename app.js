// ===== 科目定義 =====
const SUBJECTS = [
  { key: 'roki',   title: '労働基準法',       file: 'data-roki.js',   varName: 'QUESTIONS_ROKI',   count: 230 },
  { key: 'roan',   title: '労働安全衛生法',   file: 'data-roan.js',   varName: 'QUESTIONS_ROAN',   count: 110 },
  { key: 'rosai',  title: '労働者災害補償保険法', file: 'data-rosai.js', varName: 'QUESTIONS_ROSAI', count: 230 },
  { key: 'koyoho', title: '雇用保険法',       file: 'data-koyoho.js', varName: 'QUESTIONS_KOYOHO', count: 162 },
  { key: 'choshu', title: '労働保険料徴収法', file: 'data-choshu.js', varName: 'QUESTIONS_CHOSHU', count: 185 },
  { key: 'kenpo',  title: '健康保険法',       file: 'data-kenpo.js',  varName: 'QUESTIONS_KENPO',  count: 230 },
  { key: 'kokunen', title: '国民年金法',      file: 'data-kokunen.js', varName: 'QUESTIONS_KOKUNEN', count: 230 },
  { key: 'kounen', title: '厚生年金保険法',   file: 'data-kounen.js', varName: 'QUESTIONS_KOUNEN', count: 230 },
];

let currentSubjectKey = null;
let ALL = [];
let queue = [];
let currentIdx = 0;
let results = {};
let bookmarks = new Set();
let mode = 'all';
let sectionFilter = '';
const loadedScripts = new Set();

function bookmarkKey(key) { return 'bm_' + key; }

function loadBookmarks(key) {
  return new Set(JSON.parse(localStorage.getItem(bookmarkKey(key)) || '[]'));
}

function saveBookmarks(key, set) {
  localStorage.setItem(bookmarkKey(key), JSON.stringify([...set]));
}

// ===== ホーム画面 =====
function renderHome() {
  currentSubjectKey = null;
  document.getElementById('header-title').textContent = '社労士 一問一答';
  document.getElementById('back-btn').style.display = 'none';
  document.getElementById('hdr-score').style.display = 'none';
  document.getElementById('prog-fill').style.width = '0%';
  document.getElementById('quiz-view').style.display = 'none';
  document.getElementById('home-view').style.display = '';

  const total = SUBJECTS.reduce((sum, s) => sum + s.count, 0);
  document.getElementById('home-total').textContent = total;

  const grid = document.getElementById('home-grid');
  grid.innerHTML = SUBJECTS.map(s => {
    const bm = loadBookmarks(s.key).size;
    return `
      <button class="subject-card" onclick="selectSubject('${s.key}')">
        <div class="subject-card-main">
          <div class="subject-card-title">${s.title}</div>
          <div class="subject-card-meta">
            <span>全${s.count}問</span>
            ${bm > 0 ? `<span class="subject-card-star">★ ${bm}</span>` : ''}
          </div>
        </div>
        <div class="subject-card-arrow">→</div>
      </button>
    `;
  }).join('');
}

function goHome() {
  renderHome();
}

// ===== 科目選択 → クイズ画面 =====
function selectSubject(key) {
  const subject = SUBJECTS.find(s => s.key === key);
  if (!subject) return;

  document.getElementById('home-view').style.display = 'none';
  document.getElementById('quiz-view').style.display = '';
  document.getElementById('back-btn').style.display = '';
  document.getElementById('hdr-score').style.display = '';
  document.getElementById('header-title').textContent = subject.title;
  document.getElementById('question-area').innerHTML = '<div class="loading-text">読み込み中...</div>';
  document.getElementById('complete-view').classList.remove('show');

  if (loadedScripts.has(subject.file)) {
    initSubject(subject);
    return;
  }

  const script = document.createElement('script');
  script.src = subject.file;
  script.onload = () => {
    loadedScripts.add(subject.file);
    initSubject(subject);
  };
  script.onerror = () => {
    document.getElementById('question-area').innerHTML = '<div class="loading-text">読み込みに失敗しました。通信環境をご確認ください。</div>';
  };
  document.head.appendChild(script);
}

function initSubject(subject) {
  currentSubjectKey = subject.key;
  ALL = window[subject.varName] || [];
  bookmarks = loadBookmarks(subject.key);
  mode = 'all';
  sectionFilter = '';

  // 章フィルタの選択肢を構築（登場順・重複なし）
  const sections = [];
  ALL.forEach(q => { if (!sections.includes(q.section)) sections.push(q.section); });
  const select = document.getElementById('section-select');
  select.innerHTML = `<option value="">全章（${ALL.length}問）</option>` +
    sections.map(sec => `<option value="${sec}">${sec}</option>`).join('');

  document.querySelectorAll('.mode-btn').forEach((b, i) => b.classList.toggle('active', i === 0));

  restart();
}

function applyFilter() {
  sectionFilter = document.getElementById('section-select').value;
  restart();
}

function setMode(m, btn) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  restart();
}

function buildQueue() {
  let filtered = ALL.filter(q => !sectionFilter || q.section === sectionFilter);
  if (mode === 'wrong') filtered = filtered.filter(q => results[q.id] === 'wrong');
  if (mode === 'bookmark') filtered = filtered.filter(q => bookmarks.has(q.id));
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }
  return filtered;
}

function restart() {
  results = {};
  queue = buildQueue();
  currentIdx = 0;
  document.getElementById('complete-view').classList.remove('show');
  document.getElementById('question-area').style.display = '';
  updateStats();
  document.getElementById('hdr-score').textContent = '○ 0 / 0';
  render();
}

function render() {
  if (currentIdx >= queue.length) {
    showComplete();
    return;
  }

  const q = queue[currentIdx];
  const pct = queue.length ? Math.round(currentIdx / queue.length * 100) : 0;
  document.getElementById('prog-fill').style.width = pct + '%';
  updateStats();

  const isBookmarked = bookmarks.has(q.id);
  const area = document.getElementById('question-area');

  area.innerHTML = `
    <div class="card">
      <div class="bookmark-row">
        <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark(${q.id}, this)" title="しおり">
          ${isBookmarked ? '★' : '☆'}
        </button>
      </div>
      <div class="card-header">
        <span class="card-num">問 ${q.id} / ${queue.length > 1 ? currentIdx+1+'/'+queue.length : ''}</span>
        <span class="section-tag">${q.section}</span>
      </div>
      <div class="question-text">${q.q}</div>
      <div class="answer-btns">
        <button class="ans-btn" data-val="true" onclick="answer(true)">○</button>
        <button class="ans-btn" data-val="false" onclick="answer(false)">×</button>
      </div>
      <div class="result-box" id="result-box"></div>
      <div class="nav-btns" id="nav-btns" style="display:none">
        <button class="nav-btn btn-prev" onclick="prev()">← 前</button>
        <button class="nav-btn btn-next" onclick="next()">次の問題 →</button>
      </div>
    </div>
  `;
}

function answer(userAnswer) {
  const q = queue[currentIdx];
  const isCorrect = (userAnswer === q.correct);
  results[q.id] = isCorrect ? 'correct' : 'wrong';

  document.querySelectorAll('.ans-btn').forEach(btn => {
    btn.disabled = true;
    const val = btn.dataset.val === 'true';
    if (val === q.correct) btn.classList.add('correct');
    else if (val === userAnswer && !isCorrect) btn.classList.add('wrong');
  });

  const box = document.getElementById('result-box');
  box.className = 'result-box show ' + (isCorrect ? 'correct' : 'wrong');
  box.innerHTML = `
    <div class="result-label">${isCorrect ? '✓ 正解！' : '✗ 不正解'}</div>
    <div class="result-answer">正解：${q.correct ? '○（正しい）' : '×（誤り）'}</div>
    <div class="explanation-text">${q.exp}</div>
  `;

  document.getElementById('nav-btns').style.display = 'flex';
  updateStats();

  const correct = Object.values(results).filter(v => v === 'correct').length;
  const total = Object.keys(results).length;
  document.getElementById('hdr-score').textContent = `○ ${correct} / ${total}`;
}

function next() {
  currentIdx++;
  render();
}

function prev() {
  if (currentIdx > 0) {
    currentIdx--;
    render();
  }
}

function toggleBookmark(id, btn) {
  if (bookmarks.has(id)) {
    bookmarks.delete(id);
    btn.textContent = '☆';
    btn.classList.remove('active');
  } else {
    bookmarks.add(id);
    btn.textContent = '★';
    btn.classList.add('active');
  }
  saveBookmarks(currentSubjectKey, bookmarks);
}

function updateStats() {
  const correct = Object.values(results).filter(v => v === 'correct').length;
  const wrong = Object.values(results).filter(v => v === 'wrong').length;
  const remain = queue.length - currentIdx;
  document.getElementById('stat-correct').textContent = correct;
  document.getElementById('stat-wrong').textContent = wrong;
  document.getElementById('stat-remain').textContent = Math.max(remain, 0);
}

function showComplete() {
  document.getElementById('question-area').style.display = 'none';
  document.getElementById('complete-view').classList.add('show');
  const correct = Object.values(results).filter(v => v === 'correct').length;
  const total = queue.length;
  const pct = total ? Math.round(correct/total*100) : 0;
  document.getElementById('cmp-score').textContent = `${correct} / ${total}`;
  document.getElementById('cmp-pct').textContent = `正答率 ${pct}%`;
  document.getElementById('prog-fill').style.width = '100%';
}

// ===== 初期化 =====
renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/Kenpo-training/sw.js');
  });
}
