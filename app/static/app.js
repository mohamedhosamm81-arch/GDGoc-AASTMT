import { mountEditor, runPython } from './editor.js';

const $ = (selector) => document.querySelector(selector);
const views = {
  welcome: $('#view-welcome'),
  dashboard: $('#view-dashboard'),
  quiz: $('#view-quiz'),
  leaderboard: $('#view-leaderboard'),
};
const quizTitles = {
  1: { title: 'Foundations & strings', detail: 'Print, variables, operators, and text' },
  2: { title: 'Types & collections', detail: 'Conversion, conditions, lists, and dictionaries' },
  3: { title: 'Loops, functions & logic', detail: 'Build your problem-solving toolkit' },
};
const storageKey = 'gdgoc-aastmt-python-session-v1';
const state = {
  session: null,
  quizId: null,
  questions: [],
  index: 0,
  responses: {},
  checked: {},
  feedback: {},
  editor: null,
  progressTimer: null,
  toastTimer: null,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${response.status}).`);
  }
  return data;
}

function showView(name) {
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 3400);
}

function setTopbarStudent() {
  const slot = $('#topbar-student');
  slot.replaceChildren();
  if (!state.session) {
    slot.hidden = true;
    return;
  }
  const text = document.createElement('span');
  text.append('Explorer · ');
  const name = document.createElement('strong');
  name.textContent = state.session.name;
  text.append(name);
  slot.append(text);
  slot.hidden = false;
}

function studentId() {
  return state.session?.student_id || '';
}

function saveSessionLocally() {
  if (state.session) localStorage.setItem(storageKey, JSON.stringify({ student_id: state.session.student_id, name: state.session.name }));
}

function savedQuiz(quizId) {
  return state.session?.quizzes?.[String(quizId)] || null;
}

function getBoardRow(data) {
  return data.leaderboard.find((row) => row.student_id === studentId()) || null;
}

function scoreText(score) {
  return score ? `${score.score_points} pts` : '—';
}

function createQuizCard(quizId) {
  const card = document.createElement('article');
  card.className = 'quiz-card';
  const number = document.createElement('div');
  number.className = 'quiz-number';
  number.textContent = `0${quizId}`;
  const copy = document.createElement('div');
  copy.className = 'quiz-card-copy';
  const title = document.createElement('h3');
  title.textContent = `Quiz ${quizId} · ${quizTitles[quizId].title}`;
  const detail = document.createElement('p');
  detail.textContent = `${quizTitles[quizId].detail} · 20 questions`;
  copy.append(title, detail);
  const score = savedQuiz(quizId);
  if (score) {
    const status = document.createElement('span');
    status.className = 'quiz-status';
    status.textContent = `✓ First score saved · ${score.score_points} pts`;
    copy.append(status);
  }
  const action = document.createElement('div');
  action.className = 'quiz-card-action';
  const button = document.createElement('button');
  button.className = `button ${score ? 'button-secondary' : 'button-primary'}`;
  button.type = 'button';
  button.textContent = score ? 'View score' : 'Start quiz →';
  button.addEventListener('click', () => score ? showSavedResult(quizId) : startQuiz(quizId));
  if (score) {
    const scoreMeta = document.createElement('span');
    scoreMeta.className = 'quiz-score';
    scoreMeta.textContent = `${score.solved} / ${score.question_count} solved`;
    action.append(button, scoreMeta);
  } else action.append(button);
  card.append(number, copy, action);
  return card;
}

async function renderDashboard() {
  setTopbarStudent();
  $('#dashboard-subtitle').textContent = `You’ve got this, ${state.session.name.split(' ')[0]}. Pick a quiz and take it at your own pace.`;
  const list = $('#quiz-list');
  list.replaceChildren(...[1, 2, 3].map(createQuizCard));
  const loading = document.createElement('p');
  loading.className = 'empty-state';
  loading.textContent = 'Loading the latest scores…';
  $('#leaderboard-preview').replaceChildren(loading);
  showView('dashboard');
  try {
    const board = await api(`/api/leaderboard?student_id=${encodeURIComponent(studentId())}`);
    const me = getBoardRow(board);
    $('#my-total-points').textContent = me?.total_points ?? 0;
    $('#my-solved-count').textContent = `${me?.total_questions_solved ?? 0} questions solved`;
    renderLeaderboardPreview(board.leaderboard.slice(0, 5));
  } catch (error) {
    $('#leaderboard-preview').replaceChildren(emptyText('Leaderboard is temporarily unavailable.'));
    showToast(error.message);
  }
}

function emptyText(text) {
  const element = document.createElement('p');
  element.className = 'empty-state';
  element.textContent = text;
  return element;
}

function medalFor(rank) {
  if (rank === 1) return { text: '1', className: 'gold', label: 'Gold medal' };
  if (rank === 2) return { text: '2', className: 'silver', label: 'Silver medal' };
  if (rank === 3) return { text: '3', className: 'bronze', label: 'Bronze medal' };
  return { text: String(rank), className: '', label: `Rank ${rank}` };
}

function renderLeaderboardPreview(rows) {
  const host = $('#leaderboard-preview');
  if (!rows.length) {
    host.replaceChildren(emptyText('The first explorer could be you.'));
    return;
  }
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const line = document.createElement('div');
    line.className = 'preview-row';
    const rank = medalFor(row.rank);
    const rankBox = document.createElement('span');
    rankBox.className = `rank-chip ${rank.className}`;
    rankBox.textContent = rank.text;
    rankBox.setAttribute('aria-label', rank.label);
    const name = document.createElement('span');
    name.className = 'preview-name';
    name.textContent = row.name;
    const points = document.createElement('span');
    points.className = 'preview-points';
    points.textContent = `${row.total_points} pts`;
    line.append(rankBox, name, points);
    fragment.append(line);
  });
  host.replaceChildren(fragment);
}

function createScoreCell(text, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function renderLeaderboardTable(rows) {
  const body = $('#leaderboard-body');
  body.replaceChildren();
  $('#explorer-count').textContent = String(rows.length);
  $('#leaderboard-empty').hidden = rows.length !== 0;
  document.querySelector('.score-table').hidden = rows.length === 0;
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.student_id === studentId()) tr.classList.add('me-row');
    const rankCell = document.createElement('td');
    const medal = medalFor(row.rank);
    if (row.rank <= 3) {
      const mark = document.createElement('span');
      mark.className = `medal medal-${row.rank}`;
      mark.textContent = medal.text;
      mark.setAttribute('aria-label', medal.label);
      rankCell.append(mark);
    } else {
      const rankText = document.createElement('span');
      rankText.className = 'table-rank';
      rankText.textContent = `#${row.rank}`;
      rankCell.append(rankText);
    }
    const nameCell = document.createElement('td');
    const nameWrap = document.createElement('span');
    nameWrap.className = 'student-cell';
    const avatar = document.createElement('span');
    avatar.className = 'student-initial';
    avatar.textContent = (row.name.trim()[0] || '?').toUpperCase();
    const name = document.createElement('span');
    name.textContent = row.name;
    nameWrap.append(avatar, name);
    nameCell.append(nameWrap);
    const scores = row.quiz_scores || {};
    tr.append(rankCell, nameCell,
      createScoreCell(scoreText(scores['1'])),
      createScoreCell(scoreText(scores['2'])),
      createScoreCell(scoreText(scores['3'])),
      createScoreCell(String(row.total_questions_solved)),
      createScoreCell(`${row.total_points} pts`, 'total-cell'));
    fragment.append(tr);
  });
  body.append(fragment);
}

async function openLeaderboard() {
  showView('leaderboard');
  $('#leaderboard-body').replaceChildren();
  $('#explorer-count').textContent = '…';
  try {
    const board = await api(`/api/leaderboard?student_id=${encodeURIComponent(studentId())}`);
    renderLeaderboardTable(board.leaderboard);
  } catch (error) {
    $('#leaderboard-empty').hidden = false;
    $('#leaderboard-empty').textContent = error.message;
  }
}

function normalizeQuestionResponse(questionId, response) {
  if (!response) return {};
  return response;
}

async function startQuiz(quizId) {
  if (savedQuiz(quizId)) {
    showSavedResult(quizId);
    return;
  }
  try {
    const [{ questions }, progress] = await Promise.all([
      api(`/api/questions/${quizId}`),
      api(`/api/progress/${quizId}?student_id=${encodeURIComponent(studentId())}`).catch(() => ({ answers: {}, current_question: 1 })),
    ]);
    state.quizId = quizId;
    state.questions = questions;
    state.responses = progress.answers || {};
    state.checked = {};
    state.feedback = {};
    state.index = Math.min(Math.max((progress.current_question || 1) - 1, 0), questions.length - 1);
    $('#quiz-title').textContent = `Quiz ${quizId}`;
    $('#quiz-round-label').textContent = `QUIZ ${quizId} · ROUND 1`;
    $('#quiz-subtitle').textContent = `${questions.length} questions · ${quizTitles[quizId].title}`;
    $('#quiz-result').hidden = true;
    $('.quiz-progress-row').hidden = false;
    $('.progress-track').hidden = false;
    $('.quiz-workspace').hidden = false;
    renderQuestion();
    showView('quiz');
  } catch (error) {
    showToast(error.message || 'Could not load this quiz.');
  }
}

function currentQuestion() {
  return state.questions[state.index];
}

function responseFor(question) {
  return state.responses[question.id] || {};
}

function scheduleProgressSave() {
  clearTimeout(state.progressTimer);
  state.progressTimer = setTimeout(saveProgress, 500);
}

async function saveProgress() {
  if (!state.quizId || !state.session || savedQuiz(state.quizId)) return;
  try {
    await api(`/api/progress/${state.quizId}`, {
      method: 'PUT',
      body: JSON.stringify({ student_id: studentId(), current_question: state.index + 1, answers: state.responses }),
    });
  } catch (error) {
    // Local session state still lets the learner continue if the progress endpoint is unavailable.
    localStorage.setItem(`${storageKey}:progress:${state.quizId}`, JSON.stringify({ current_question: state.index + 1, answers: state.responses }));
  }
}

function setResponse(question, response, invalidateCheck = true) {
  state.responses[question.id] = response;
  if (invalidateCheck) {
    delete state.checked[question.id];
    delete state.feedback[question.id];
    $('#answer-feedback').hidden = true;
    $('#next-question').disabled = true;
  }
  scheduleProgressSave();
}

function renderAnswerArea(question) {
  const area = $('#answer-area');
  area.replaceChildren();
  const saved = responseFor(question);
  if (question.type === 'mcq') {
    const list = document.createElement('div');
    list.className = 'choice-list';
    question.choices.forEach((choice) => {
      const label = document.createElement('label');
      label.className = `choice-option ${saved.answer === choice.id ? 'selected' : ''}`;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'question-choice';
      radio.value = choice.id;
      radio.checked = saved.answer === choice.id;
      const letter = document.createElement('span');
      letter.className = 'choice-key';
      letter.textContent = choice.id.toUpperCase();
      const text = document.createElement('span');
      text.className = 'choice-text';
      text.textContent = choice.text;
      label.append(radio, letter, text);
      radio.addEventListener('change', () => {
        area.querySelectorAll('.choice-option').forEach((node) => node.classList.remove('selected'));
        label.classList.add('selected');
        setResponse(question, { answer: choice.id });
      });
      list.append(label);
    });
    area.append(list);
    return;
  }
  if (question.type === 'fill_blank' || question.type === 'predict') {
    const field = document.createElement(question.type === 'predict' ? 'textarea' : 'input');
    field.className = `answer-input ${question.type === 'predict' ? 'mono' : ''}`;
    field.setAttribute('aria-label', question.type === 'predict' ? 'Type the exact printed output' : 'Your answer');
    if (question.type === 'predict') {
      field.rows = Math.max(2, Math.min(5, String(saved.answer || '').split('\n').length));
      field.placeholder = 'Type the exact output…';
    } else field.placeholder = 'Type your answer…';
    field.value = saved.answer || '';
    field.addEventListener('input', () => setResponse(question, { answer: field.value }));
    area.append(field);
  }
}

function updateProgressDisplay(question) {
  const count = state.questions.length;
  const number = state.index + 1;
  const percent = Math.round(number / count * 100);
  $('#progress-count').textContent = `Question ${number} of ${count}`;
  $('#progress-percent').textContent = `${percent}%`;
  $('#progress-bar').style.width = `${percent}%`;
  $('.progress-track').setAttribute('aria-valuenow', String(number));
  $('#question-number').textContent = `QUESTION ${String(number).padStart(2, '0')}`;
  $('#difficulty-badge').className = `difficulty-badge difficulty-${question.difficulty}`;
  $('#difficulty-badge').textContent = `${question.difficulty.toUpperCase()} · ${question.points} ${question.points === 1 ? 'PT' : 'PTS'}`;
  $('#previous-question').disabled = state.index === 0;
  $('#next-question').textContent = state.index === count - 1 ? 'Finish quiz ✓' : 'Next question →';
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) return;
  if (state.editor) state.editor.destroy();
  state.editor = null;
  $('#question-prompt').textContent = question.prompt;
  const codeBlock = $('#question-code');
  const code = question.code || '';
  codeBlock.hidden = !code;
  codeBlock.querySelector('code').textContent = code;
  renderAnswerArea(question);
  const editorWrap = $('#editor-wrap');
  const editable = question.type === 'code' || question.type === 'fix_bug';
  editorWrap.hidden = !editable;
  $('#answer-area').hidden = editable;
  if (editable) {
    const saved = responseFor(question);
    const starter = question.type === 'fix_bug' ? question.starter_code : question.starter_code;
    const initialCode = saved.code ?? starter ?? '';
    state.editor = mountEditor($('#code-editor'), initialCode, (value) => {
      const previous = responseFor(question);
      setResponse(question, { code: value }, true);
      if (previous.code !== value) {
        $('#console-output').textContent = 'Code changed. Run it again to update the output.';
        $('#console-panel').classList.remove('has-output', 'has-error');
      }
    });
    $('#console-output').textContent = 'Run your code to see its output here.';
    $('#console-panel').classList.remove('has-output', 'has-error');
  }
  updateProgressDisplay(question);
  const checked = Boolean(state.checked[question.id]);
  $('#next-question').disabled = !checked;
  $('#check-answer').disabled = false;
  $('#check-answer').textContent = checked ? 'Check again' : 'Check answer';
  const existingFeedback = state.feedback[question.id];
  if (existingFeedback) displayFeedback(existingFeedback);
  else $('#answer-feedback').hidden = true;
  $('#check-hint').textContent = checked ? 'You can revisit this answer before finishing.' : 'You can review your answer before finishing the quiz.';
}

async function executeCurrent(forCheck = false) {
  const question = currentQuestion();
  if (!state.editor) throw new Error('Editor is not ready.');
  const code = state.editor.getValue();
  setResponse(question, { code }, false);
  const mode = question.type === 'code' ? (forCheck ? 'function_tests' : 'function_preview') : 'script';
  const result = await runPython({
    code,
    mode,
    functionName: question.function_name || '',
    testCases: question.test_cases || [],
  }, (status) => {
    $('#run-code').disabled = true;
    $('#check-answer').disabled = true;
    if (status) $('#console-output').textContent = status;
    else {
      $('#run-code').disabled = false;
      $('#check-answer').disabled = false;
    }
  });
  const output = result.error ? `Error: ${result.error}` : (result.output || '(No output)');
  $('#console-output').textContent = output;
  $('#console-panel').classList.toggle('has-output', !result.error);
  $('#console-panel').classList.toggle('has-error', Boolean(result.error));
  const response = question.type === 'code'
    ? { code, actuals: result.actuals || [], error: result.error || null, output: result.output || '' }
    : { code, output: result.output || '', error: result.error || null };
  setResponse(question, response, false);
  return response;
}

function displayFeedback(feedback) {
  const box = $('#answer-feedback');
  box.className = `answer-feedback ${feedback.correct ? 'correct' : 'incorrect'}`;
  box.replaceChildren();
  const symbol = document.createElement('strong');
  symbol.textContent = feedback.correct ? 'That’s right.' : 'Not quite yet.';
  const text = document.createElement('span');
  text.textContent = `${feedback.explanation} ${feedback.correct ? `+${feedback.points_awarded} ${feedback.points_awarded === 1 ? 'point' : 'points'}.` : ''}`;
  box.append(symbol, text);
  box.hidden = false;
}

async function checkCurrentAnswer() {
  const question = currentQuestion();
  const button = $('#check-answer');
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    let response;
    if (question.type === 'code' || question.type === 'fix_bug') response = await executeCurrent(true);
    else response = responseFor(question);
    const result = await api('/api/check', {
      method: 'POST',
      body: JSON.stringify({ quiz_id: state.quizId, question_id: question.id, response }),
    });
    state.checked[question.id] = true;
    state.feedback[question.id] = result;
    displayFeedback(result);
    $('#next-question').disabled = false;
    $('#check-hint').textContent = 'Answer checked. You can revise it and check again before moving on.';
    await saveProgress();
  } catch (error) {
    showToast(error.message || 'Could not check that answer.');
  } finally {
    button.disabled = false;
    button.textContent = state.checked[question.id] ? 'Check again' : 'Check answer';
  }
}

function navigateQuestion(delta) {
  const nextIndex = state.index + delta;
  if (nextIndex < 0 || nextIndex >= state.questions.length) return;
  state.index = nextIndex;
  renderQuestion();
  scheduleProgressSave();
}

function finishQuizPrompt() {
  const unanswered = state.questions.filter((question) => !state.checked[question.id]).length;
  $('#finish-copy').textContent = unanswered
    ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} not checked yet. Unchecked answers will not earn points. Your first completed score will be saved.`
    : 'Your checked answers will be submitted. This will be the saved first score for this quiz.';
  $('#finish-dialog').showModal();
}

async function submitQuiz() {
  $('#confirm-finish').disabled = true;
  $('#confirm-finish').textContent = 'Saving score…';
  try {
    const checkedAnswers = Object.fromEntries(
      state.questions
        .filter((question) => state.checked[question.id] && state.responses[question.id])
        .map((question) => [question.id, state.responses[question.id]]),
    );
    const result = await api(`/api/submit/${state.quizId}`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId(), quiz_id: state.quizId, answers: checkedAnswers }),
    });
    $('#finish-dialog').close();
    const quizRecord = {
      score_points: result.score_points,
      possible_points: result.possible_points,
      solved: result.solved,
      question_count: result.question_count,
      completed_at: result.completed_at,
    };
    state.session.quizzes = { ...(state.session.quizzes || {}), [String(state.quizId)]: quizRecord };
    saveSessionLocally();
    showQuizResult(result);
    await refreshDashboardTotals();
  } catch (error) {
    showToast(error.message || 'Could not save your score.');
  } finally {
    $('#confirm-finish').disabled = false;
    $('#confirm-finish').textContent = 'Submit quiz';
  }
}

function showQuizResult(result) {
  $('.quiz-progress-row').hidden = true;
  $('.progress-track').hidden = true;
  $('.quiz-workspace').hidden = true;
  const panel = $('#quiz-result');
  $('#result-name').textContent = state.session.name.split(' ')[0];
  $('#result-quiz-number').textContent = String(state.quizId);
  $('#result-points').textContent = String(result.score_points);
  $('#result-solved').textContent = `${result.solved} of ${result.question_count} questions solved · ${result.possible_points} possible points`;
  $('#result-first-score').textContent = result.first_score_kept
    ? 'Your original first score is still saved; a repeat submission cannot change it.'
    : 'Your first completed score is saved to the leaderboard.';
  panel.hidden = false;
  showView('quiz');
}

function showSavedResult(quizId) {
  const score = savedQuiz(quizId);
  if (!score) return;
  state.quizId = quizId;
  $('#quiz-title').textContent = `Quiz ${quizId}`;
  $('#quiz-round-label').textContent = `QUIZ ${quizId} · ROUND 1`;
  $('#quiz-subtitle').textContent = quizTitles[quizId].title;
  state.questions = [];
  showQuizResult({ ...score, first_score_kept: true });
}

async function refreshDashboardTotals() {
  try {
    const board = await api(`/api/leaderboard?student_id=${encodeURIComponent(studentId())}`);
    const me = getBoardRow(board);
    $('#my-total-points').textContent = me?.total_points ?? 0;
    $('#my-solved-count').textContent = `${me?.total_questions_solved ?? 0} questions solved`;
  } catch (_) {}
}

async function handleNameSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = $('#student-name');
  const error = $('#name-error');
  error.hidden = true;
  const name = input.value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    error.textContent = 'Please enter your full name (at least 2 characters).';
    error.hidden = false;
    input.focus();
    return;
  }
  const id = crypto.randomUUID();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    state.session = await api('/api/session', { method: 'POST', body: JSON.stringify({ student_id: id, name }) });
    saveSessionLocally();
    await renderDashboard();
  } catch (apiError) {
    error.textContent = apiError.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  $('#name-form').addEventListener('submit', handleNameSubmit);
  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'dashboard' || action === 'home') {
      if (state.session) renderDashboard();
      else showView('welcome');
    }
    if (action === 'leaderboard') openLeaderboard();
    if (action === 'storage-info') $('#info-dialog').showModal();
  });
  $('#close-info').addEventListener('click', () => $('#info-dialog').close());
  $('#refresh-leaderboard').addEventListener('click', openLeaderboard);
  $('#check-answer').addEventListener('click', checkCurrentAnswer);
  $('#run-code').addEventListener('click', async () => {
    try { await executeCurrent(false); }
    catch (error) { $('#console-output').textContent = `Error: ${error.message}`; $('#console-panel').classList.add('has-error'); }
  });
  $('#previous-question').addEventListener('click', () => navigateQuestion(-1));
  $('#next-question').addEventListener('click', () => {
    if ($('#next-question').disabled) return;
    if (state.index === state.questions.length - 1) finishQuizPrompt();
    else navigateQuestion(1);
  });
  $('#cancel-finish').addEventListener('click', () => $('#finish-dialog').close());
  $('#confirm-finish').addEventListener('click', submitQuiz);
  $('#finish-dialog').addEventListener('click', (event) => {
    if (event.target === $('#finish-dialog')) $('#finish-dialog').close();
  });
}

async function restoreSession() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    if (!saved.student_id || !saved.name) return false;
    state.session = await api('/api/session', { method: 'POST', body: JSON.stringify(saved) });
    setTopbarStudent();
    await renderDashboard();
    return true;
  } catch (_) {
    localStorage.removeItem(storageKey);
    return false;
  }
}

bindEvents();
restoreSession().then((restored) => {
  if (!restored) showView('welcome');
});
