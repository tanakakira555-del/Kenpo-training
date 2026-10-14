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
let reviewAll = false;          // 全科目の誤問復習モード
let ALL = [];
let queue = [];
let currentIdx = 0;
let results = {};               // このセッションの結果（"科目:ID" -> correct/wrong）
let bookmarks = new Set();
let mode = 'all';
let sectionFilter = '';
let labelFilter = '';
let mapSections = [];
const loadedScripts = new Set();

// ===== ラベル（自分で付ける分類） =====
const LABELS = [
  { id: 'trap',  t: 'ひっかけ' },
  { id: 'num',   t: '数字の暗記' },
  { id: 'term',  t: '用語・定義' },
  { id: 'under', t: '理解不足' },
  { id: 'again', t: '要再確認' },
];
const labelsCache = {};
function getLabels(key) {
  if (!labelsCache[key]) labelsCache[key] = lsGet('lb_' + key, {});
  return labelsCache[key];
}
function qLabels(key, id) { return getLabels(key)[id] || []; }
function toggleLabel(key, id, lid, btn) {
  const all = getLabels(key);
  const cur = all[id] || [];
  const i = cur.indexOf(lid);
  if (i >= 0) cur.splice(i, 1); else cur.push(lid);
  if (cur.length) all[id] = cur; else delete all[id];
  lsSet('lb_' + key, all);
  btn.classList.toggle('on', i < 0);
  updateLabelOptions();
}

function subj(key) { return SUBJECTS.find(s => s.key === key); }
function cid(q) { return (q._s || currentSubjectKey) + ':' + q.id; }
function qkey(q) { return q._s || currentSubjectKey; }

// ===== localStorage 補助 =====
function lsGet(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存不可環境は無視 */ }
}

// ===== しおり =====
function loadBookmarks(key) { return new Set(lsGet('bm_' + key, [])); }
function saveBookmarks(key, set) { lsSet('bm_' + key, [...set]); }

// ===== 学習記録（問題ごと） =====
// st_<科目> = { [id]: { c: 正解回数, w: 不正解回数, l: 直近の結果(1=正解,0=不正解), t: 最終回答時刻 } }
const statsCache = {};
function getStats(key) {
  if (!statsCache[key]) statsCache[key] = lsGet('st_' + key, {});
  return statsCache[key];
}
function recordAnswer(key, id, ok) {
  const st = getStats(key);
  const r = st[id] || { c: 0, w: 0, l: 1 };
  if (ok) { r.c++; r.l = 1; } else { r.w++; r.l = 0; }
  r.t = Date.now();
  st[id] = r;
  lsSet('st_' + key, st);
  recordDaily(ok);
}
function summarize(key) {
  const st = getStats(key);
  let answered = 0, c = 0, w = 0, wrong = 0;
  for (const id in st) {
    answered++; c += st[id].c; w += st[id].w;
    if (st[id].l === 0) wrong++;
  }
  return { answered, c, w, wrong };
}

// ===== 学習記録（日別） =====
function dateKey(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function getDaily() { return lsGet('dl', {}); }
function recordDaily(ok) {
  const dl = getDaily();
  const k = dateKey(new Date());
  const r = dl[k] || [0, 0];
  r[0]++; if (ok) r[1]++;
  dl[k] = r;
  const keys = Object.keys(dl).sort();
  while (keys.length > 90) delete dl[keys.shift()];
  lsSet('dl', dl);
}
function calcStreak(dl) {
  let n = 0;
  const d = new Date();
  if (!dl[dateKey(d)]) d.setDate(d.getDate() - 1);
  while (dl[dateKey(d)] && dl[dateKey(d)][0] > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }

// ===== ホーム画面 =====
function renderHome() {
  currentSubjectKey = null;
  reviewAll = false;
  document.getElementById('header-title').textContent = '社労士 一問一答';
  document.getElementById('back-btn').style.display = 'none';
  document.getElementById('hdr-score').style.display = 'none';
  document.getElementById('prog-fill').style.width = '0%';
  document.getElementById('quiz-view').style.display = 'none';
  document.getElementById('home-view').style.display = '';

  const total = SUBJECTS.reduce((sum, s) => sum + s.count, 0);
  document.getElementById('home-total').textContent = total;

  // 全体サマリー
  let totalC = 0, totalW = 0, totalWrong = 0, totalAnswered = 0;
  const sums = {};
  SUBJECTS.forEach(s => {
    sums[s.key] = summarize(s.key);
    totalC += sums[s.key].c; totalW += sums[s.key].w;
    totalWrong += sums[s.key].wrong; totalAnswered += sums[s.key].answered;
  });
  const dl = getDaily();
  const today = dl[dateKey(new Date())] || [0, 0];
  const streak = calcStreak(dl);

  // 直近7日グラフ
  let maxA = 1;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const r = dl[dateKey(d)] || [0, 0];
    days.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), a: r[0], c: r[1] });
    if (r[0] > maxA) maxA = r[0];
  }
  const weekHtml = days.map(d => `
    <div class="week-col">
      <div class="week-num">${d.a || ''}</div>
      <div class="week-bar"><div class="week-fill" style="height:${Math.round(d.a / maxA * 100)}%"></div></div>
      <div class="week-lbl">${d.label}</div>
    </div>`).join('');

  document.getElementById('home-summary').innerHTML = `
    <div class="sum-grid">
      <div class="sum-item"><div class="sum-num">${today[0]}</div><div class="sum-lbl">今日の解答</div></div>
      <div class="sum-item"><div class="sum-num">${today[0] ? pct(today[1], today[0]) + '%' : '-'}</div><div class="sum-lbl">今日の正答率</div></div>
      <div class="sum-item"><div class="sum-num">${totalC + totalW ? pct(totalC, totalC + totalW) + '%' : '-'}</div><div class="sum-lbl">通算正答率</div></div>
      <div class="sum-item"><div class="sum-num">${streak}<span class="sum-unit">日</span></div><div class="sum-lbl">連続学習</div></div>
    </div>
    <div class="week-chart">${weekHtml}</div>
    <div class="sum-sub">挑戦済み ${totalAnswered} / ${total}問</div>
    <button class="review-all-btn" onclick="startReviewAll()" ${totalWrong ? '' : 'disabled'}>
      ${totalWrong ? '誤問をまとめて復習（全科目 ' + totalWrong + '問）' : '復習する誤問はありません'}
    </button>`;

  const grid = document.getElementById('home-grid');
  grid.innerHTML = SUBJECTS.map(s => {
    const bm = loadBookmarks(s.key).size;
    const sm = sums[s.key];
    const acc = sm.c + sm.w ? pct(sm.c, sm.c + sm.w) + '%' : '-';
    const prog = Math.min(100, Math.round(sm.answered / s.count * 100));
    return `
      <button class="subject-card" onclick="selectSubject('${s.key}')">
        <div class="subject-card-main">
          <div class="subject-card-title">${s.title}</div>
          <div class="subject-card-meta">
            <span>全${s.count}問</span>
            <span>済 ${sm.answered}</span>
            <span>正答率 ${acc}</span>
            ${sm.wrong > 0 ? `<span class="subject-card-wrong">誤 ${sm.wrong}</span>` : ''}
            ${bm > 0 ? `<span class="subject-card-star">★ ${bm}</span>` : ''}
          </div>
          <div class="subject-card-bar"><div class="subject-card-bar-fill" style="width:${prog}%"></div></div>
        </div>
        <div class="subject-card-arrow">→</div>
      </button>
    `;
  }).join('');
}

function goHome() {
  renderHome();
}

// ===== スクリプト読み込み =====
function loadSubjectData(subject) {
  return new Promise((resolve, reject) => {
    if (loadedScripts.has(subject.file)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = subject.file;
    script.onload = () => { loadedScripts.add(subject.file); resolve(); };
    script.onerror = () => reject(new Error('load failed: ' + subject.file));
    document.head.appendChild(script);
  });
}

function showQuizView(title) {
  document.getElementById('home-view').style.display = 'none';
  document.getElementById('quiz-view').style.display = '';
  document.getElementById('back-btn').style.display = '';
  document.getElementById('hdr-score').style.display = '';
  document.getElementById('header-title').textContent = title;
  document.getElementById('question-area').innerHTML = '<div class="loading-text">読み込み中...</div>';
  document.getElementById('complete-view').classList.remove('show');
}

// ===== 科目選択 → クイズ画面 =====
function selectSubject(key) {
  const subject = subj(key);
  if (!subject) return;
  reviewAll = false;
  showQuizView(subject.title);
  document.getElementById('filter-bar').style.display = '';
  document.getElementById('reset-row').style.display = '';
  loadSubjectData(subject).then(() => initSubject(subject)).catch(() => {
    document.getElementById('question-area').innerHTML = '<div class="loading-text">読み込みに失敗しました。通信環境をご確認ください。</div>';
  });
}

function initSubject(subject) {
  currentSubjectKey = subject.key;
  ALL = window[subject.varName] || [];
  bookmarks = loadBookmarks(subject.key);
  mode = 'all';
  sectionFilter = '';
  labelFilter = '';
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'all'));
  restart();
}

// ===== 全科目の誤問復習 =====
function startReviewAll() {
  const targets = SUBJECTS.filter(s => summarize(s.key).wrong > 0);
  if (!targets.length) return;
  reviewAll = true;
  currentSubjectKey = null;
  mode = 'wrong';
  sectionFilter = '';
  labelFilter = '';
  showQuizView('誤問復習（全科目）');
  document.getElementById('filter-bar').style.display = 'none';
  document.getElementById('reset-row').style.display = 'none';
  Promise.all(targets.map(loadSubjectData)).then(() => restart()).catch(() => {
    document.getElementById('question-area').innerHTML = '<div class="loading-text">読み込みに失敗しました。通信環境をご確認ください。</div>';
  });
}

function reviewPool() {
  const pool = [];
  SUBJECTS.forEach(s => {
    if (!loadedScripts.has(s.file)) return;
    const st = getStats(s.key);
    (window[s.varName] || []).forEach(q => {
      if (st[q.id] && st[q.id].l === 0 && (!labelFilter || qLabels(s.key, q.id).includes(labelFilter))) {
        pool.push(Object.assign({}, q, { _s: s.key }));
      }
    });
  });
  return pool;
}

function setLabelFilter() {
  labelFilter = document.getElementById('label-select').value;
  restart();
}

function updateLabelOptions() {
  const sel = document.getElementById('label-select');
  if (!sel) return;
  const counts = {};
  const countFor = (key, list) => {
    const st = getStats(key);
    list.forEach(q => {
      // 誤問に付いたラベルを数える（全問モードでは全問が対象）
      if (mode === 'wrong' && !(st[q.id] && st[q.id].l === 0)) return;
      qLabels(key, q.id).forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    });
  };
  if (reviewAll) {
    SUBJECTS.forEach(s => { if (loadedScripts.has(s.file)) countFor(s.key, window[s.varName] || []); });
  } else if (currentSubjectKey) {
    countFor(currentSubjectKey, ALL);
  }
  sel.innerHTML = '<option value="">すべて</option>' +
    LABELS.map(l => `<option value="${l.id}">${l.t}${counts[l.id] ? '（' + counts[l.id] + '）' : ''}</option>`).join('');
  sel.value = labelFilter;
}

// ===== 章別の誤問マップ =====
function renderMap() {
  const box = document.getElementById('map-body');
  const panel = document.getElementById('map-panel');
  if (!box || !panel) return;
  if (reviewAll || !currentSubjectKey) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  const st = getStats(currentSubjectKey);
  const by = {};
  ALL.forEach(q => {
    const r = by[q.section] || (by[q.section] = { total: 0, wrong: 0 });
    r.total++;
    if (st[q.id] && st[q.id].l === 0) r.wrong++;
  });
  mapSections = Object.keys(by).filter(k => by[k].wrong > 0)
    .sort((a, b) => by[b].wrong - by[a].wrong || by[b].wrong / by[b].total - by[a].wrong / by[a].total);
  const totalWrong = mapSections.reduce((s, k) => s + by[k].wrong, 0);
  document.getElementById('map-sum').textContent = totalWrong ? '（誤問 ' + totalWrong + '問）' : '';
  if (!mapSections.length) {
    box.innerHTML = '<div class="map-empty">誤問はまだありません。間違えた問題がある章がここに表示されます。</div>';
    return;
  }
  const maxW = by[mapSections[0]].wrong;
  box.innerHTML = mapSections.map((k, i) => {
    const r = by[k];
    const w = Math.round(r.wrong / maxW * 100);
    return `<button class="map-row" onclick="mapSelect(${i})">
      <span class="map-name">${k}</span>
      <span class="map-bar"><span class="map-fill" style="width:${w}%"></span></span>
      <span class="map-cnt">誤${r.wrong}/${r.total}</span>
    </button>`;
  }).join('');
}

function mapSelect(i) {
  sectionFilter = mapSections[i];
  setMode('wrong', document.querySelector('.mode-btn[data-mode="wrong"]'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== フィルタ・モード =====
function applyFilter() {
  sectionFilter = document.getElementById('section-select').value;
  restart();
}

function setMode(m, btn) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  restart();
}

function buildSectionOptions() {
  const st = getStats(currentSubjectKey);
  const sections = [];
  const wrongBy = {};
  ALL.forEach(q => {
    if (!sections.includes(q.section)) sections.push(q.section);
    if (st[q.id] && st[q.id].l === 0) wrongBy[q.section] = (wrongBy[q.section] || 0) + 1;
  });
  const select = document.getElementById('section-select');
  select.innerHTML = `<option value="">全章（${ALL.length}問）</option>` +
    sections.map(sec => `<option value="${sec}">${sec}${wrongBy[sec] ? '（誤' + wrongBy[sec] + '）' : ''}</option>`).join('');
  select.value = sectionFilter;
}

function updateModeCounts() {
  if (reviewAll || !currentSubjectKey) return;
  const st = getStats(currentSubjectKey);
  let unseen = 0, wrong = 0, bm = 0;
  ALL.forEach(q => {
    if (!st[q.id]) unseen++;
    else if (st[q.id].l === 0) wrong++;
    if (bookmarks.has(q.id)) bm++;
  });
  const labels = { all: '全問', unseen: '未 ' + unseen, wrong: '誤問 ' + wrong, bookmark: '☆ ' + bm };
  document.querySelectorAll('.mode-btn').forEach(b => { b.textContent = labels[b.dataset.mode]; });
}

function buildQueue() {
  let list;
  if (reviewAll) {
    list = reviewPool();
  } else {
    const st = getStats(currentSubjectKey);
    list = ALL.filter(q => !sectionFilter || q.section === sectionFilter);
    if (mode === 'wrong') list = list.filter(q => st[q.id] && st[q.id].l === 0);
    if (mode === 'unseen') list = list.filter(q => !st[q.id]);
    if (mode === 'bookmark') list = list.filter(q => bookmarks.has(q.id));
    if (labelFilter) list = list.filter(q => qLabels(currentSubjectKey, q.id).includes(labelFilter));
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function restart() {
  results = {};
  if (!reviewAll) buildSectionOptions();
  updateModeCounts();
  updateLabelOptions();
  renderMap();
  queue = buildQueue();
  currentIdx = 0;
  document.getElementById('complete-view').classList.remove('show');
  document.getElementById('question-area').style.display = '';
  updateStats();
  document.getElementById('hdr-score').textContent = '○ 0 / 0';
  render();
}

// ===== 出題 =====
function emptyMessage() {
  if (reviewAll) return '復習する誤問はもうありません。お疲れさまでした！';
  if (mode === 'wrong') return '誤問はありません。この条件で間違えた問題が出るとここに溜まります。';
  if (mode === 'unseen') return '未回答の問題はありません。';
  if (mode === 'bookmark') return 'しおり（☆）を付けた問題がありません。';
  return '問題がありません。';
}

function render() {
  if (!queue.length) {
    document.getElementById('question-area').innerHTML = `<div class="loading-text">${emptyMessage()}</div>`;
    document.getElementById('prog-fill').style.width = '0%';
    return;
  }
  if (currentIdx >= queue.length) {
    showComplete();
    return;
  }

  const q = queue[currentIdx];
  const key = qkey(q);
  const p = queue.length ? Math.round(currentIdx / queue.length * 100) : 0;
  document.getElementById('prog-fill').style.width = p + '%';
  updateStats();

  const isBookmarked = loadBookmarks(key).has(q.id);
  const rec = getStats(key)[q.id];
  const hist = rec
    ? `<span class="hist-tag ${rec.l === 0 ? 'hist-wrong' : 'hist-ok'}">○${rec.c} ×${rec.w}</span>`
    : '<span class="hist-tag hist-new">未回答</span>';
  const tag = reviewAll ? subj(key).title + '・' + q.section : q.section;
  const area = document.getElementById('question-area');

  area.innerHTML = `
    <div class="card">
      <div class="bookmark-row">
        ${hist}
        <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark('${key}', ${q.id}, this)" title="しおり">
          ${isBookmarked ? '★' : '☆'}
        </button>
      </div>
      <div class="card-header">
        <span class="card-num">問 ${q.id} / ${currentIdx + 1}/${queue.length}</span>
        <span class="section-tag">${tag}</span>
      </div>
      <div class="question-text">${q.q}</div>
      <div class="answer-btns">
        <button class="ans-btn" data-val="true" onclick="answer(true)">○</button>
        <button class="ans-btn" data-val="false" onclick="answer(false)">×</button>
      </div>
      <div class="result-box" id="result-box"></div>
      <div class="label-row" id="label-row" style="display:none">
        <span class="label-cap">ラベル</span>
        ${LABELS.map(l => `<button class="label-chip ${qLabels(key, q.id).includes(l.id) ? 'on' : ''}" onclick="toggleLabel('${key}', ${q.id}, '${l.id}', this)">${l.t}</button>`).join('')}
      </div>
      <div class="nav-btns" id="nav-btns" style="display:none">
        <button class="nav-btn btn-prev" onclick="prev()">← 前</button>
        <button class="nav-btn btn-next" onclick="next()">次の問題 →</button>
      </div>
    </div>
  `;
}

function answer(userAnswer) {
  if (!queue.length || currentIdx >= queue.length) return;
  const btns = document.querySelectorAll('.ans-btn');
  if (!btns.length || btns[0].disabled) return;

  const q = queue[currentIdx];
  const key = qkey(q);
  const isCorrect = (userAnswer === q.correct);
  const wasWrong = (getStats(key)[q.id] || {}).l === 0;
  results[cid(q)] = isCorrect ? 'correct' : 'wrong';
  recordAnswer(key, q.id, isCorrect);

  btns.forEach(btn => {
    btn.disabled = true;
    const val = btn.dataset.val === 'true';
    if (val === q.correct) btn.classList.add('correct');
    else if (val === userAnswer && !isCorrect) btn.classList.add('wrong');
  });

  let note = '';
  if (!isCorrect) note = '<div class="result-note note-wrong">誤問に登録しました（あとで「誤問」で復習できます）</div>';
  else if (wasWrong) note = '<div class="result-note note-ok">正解！この問題は誤問から外れました</div>';

  const box = document.getElementById('result-box');
  box.className = 'result-box show ' + (isCorrect ? 'correct' : 'wrong');
  box.innerHTML = `
    <div class="result-label">${isCorrect ? '✓ 正解！' : '✗ 不正解'}</div>
    <div class="result-answer">正解：${q.correct ? '○（正しい）' : '×（誤り）'}</div>
    <div class="explanation-text">${q.exp}</div>
    ${note}
  `;

  document.getElementById('nav-btns').style.display = 'flex';
  document.getElementById('label-row').style.display = 'flex';
  updateStats();
  updateModeCounts();
  renderMap();

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

function toggleBookmark(key, id, btn) {
  const set = loadBookmarks(key);
  if (set.has(id)) {
    set.delete(id);
    btn.textContent = '☆';
    btn.classList.remove('active');
  } else {
    set.add(id);
    btn.textContent = '★';
    btn.classList.add('active');
  }
  saveBookmarks(key, set);
  if (!reviewAll && key === currentSubjectKey) { bookmarks = set; updateModeCounts(); }
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
  document.getElementById('cmp-score').textContent = `${correct} / ${total}`;
  document.getElementById('cmp-pct').textContent = `正答率 ${pct(correct, total)}%`;
  document.getElementById('prog-fill').style.width = '100%';

  // 誤問が残っていれば復習ボタンを出す
  let remainWrong;
  if (reviewAll) remainWrong = reviewPool().length;
  else remainWrong = summarize(currentSubjectKey).wrong;
  const btn = document.getElementById('cmp-review-btn');
  if (remainWrong > 0) {
    btn.style.display = '';
    btn.textContent = `誤問を復習（${remainWrong}問）`;
  } else {
    btn.style.display = 'none';
  }
}

function reviewWrongNow() {
  if (reviewAll) { restart(); return; }
  const btn = document.querySelector('.mode-btn[data-mode="wrong"]');
  sectionFilter = '';
  setMode('wrong', btn);
}

// ===== 記録リセット =====
function resetSubjectStats() {
  if (!currentSubjectKey) return;
  const s = subj(currentSubjectKey);
  if (!confirm(s.title + ' の学習記録（正答率・誤問）をリセットします。しおりは残ります。よろしいですか？')) return;
  statsCache[currentSubjectKey] = {};
  lsSet('st_' + currentSubjectKey, {});
  restart();
}

function resetAllStats() {
  if (!confirm('全科目の学習記録（正答率・誤問・日別記録）をリセットします。しおりは残ります。よろしいですか？')) return;
  SUBJECTS.forEach(s => { statsCache[s.key] = {}; lsSet('st_' + s.key, {}); });
  lsSet('dl', {});
  renderHome();
}

// ===== キーボード操作 =====
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.getElementById('quiz-view').style.display === 'none') return;
  if (e.target && /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  const nav = document.getElementById('nav-btns');
  const isAnswered = nav && nav.style.display !== 'none';
  if (!isAnswered) {
    if (e.key === 'o' || e.key === 'O' || e.key === '1') answer(true);
    else if (e.key === 'x' || e.key === 'X' || e.key === '2') answer(false);
  } else {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') prev();
  }
});

// ===== 初期化 =====
renderHome();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/Kenpo-training/sw.js');
  });
}
