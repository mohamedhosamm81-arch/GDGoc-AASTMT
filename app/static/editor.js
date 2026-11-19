let editorInstance = null;
let worker = null;
let nextRunId = 0;
let ready = false;
const pending = new Map();

function startWorker() {
  if (worker) return worker;
  worker = new Worker('/static/runner.worker.js');
  worker.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.kind === 'ready') {
      ready = true;
      return;
    }
    if (message.kind === 'loading') return;
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.kind === 'result') item.resolve(message.result);
    else item.reject(new Error(message.error || 'The Python runner could not complete this request.'));
  });
  worker.addEventListener('error', () => resetWorker('The Python runner stopped unexpectedly.'));
  return worker;
}

function resetWorker(reason) {
  if (worker) worker.terminate();
  worker = null;
  ready = false;
  for (const [id, item] of pending.entries()) {
    clearTimeout(item.timer);
    item.reject(new Error(reason));
    pending.delete(id);
  }
}

export function runPython({ code, mode, functionName = '', testCases = [] }, onStatus = () => {}) {
  const instance = startWorker();
  const id = ++nextRunId;
  onStatus('Preparing the Python runner…');
  return new Promise((resolve, reject) => {
    const timeoutMs = ready ? 8000 : 45000;
    const timer = setTimeout(() => {
      resetWorker('Execution took too long, so the isolated worker was stopped. You can edit your code and try again.');
    }, timeoutMs);
    pending.set(id, {
      timer,
      resolve: (result) => { onStatus(''); resolve(result); },
      reject: (error) => { onStatus(''); reject(error); },
    });
    instance.postMessage({ id, code, mode, functionName, testCases });
  });
}

function installTabIndent(textarea) {
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.slice(0, start) + '    ' + value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + 4;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function mountEditor(container, initialValue, onChange = () => {}) {
  destroyEditor();
  container.replaceChildren();
  if (window.CodeMirror) {
    const textarea = document.createElement('textarea');
    textarea.value = initialValue || '';
    container.append(textarea);
    editorInstance = window.CodeMirror.fromTextArea(textarea, {
      mode: 'python',
      theme: 'eclipse',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      lineWrapping: true,
      autofocus: false,
      extraKeys: { Tab: (cm) => cm.execCommand('indentMore'), 'Shift-Tab': (cm) => cm.execCommand('indentLess') },
    });
    editorInstance.on('change', () => onChange(editorInstance.getValue()));
    return {
      getValue: () => editorInstance ? editorInstance.getValue() : '',
      focus: () => editorInstance && editorInstance.focus(),
      destroy: destroyEditor,
    };
  }
  const fallback = document.createElement('textarea');
  fallback.className = 'fallback-editor';
  fallback.setAttribute('aria-label', 'Python code editor');
  fallback.spellcheck = false;
  fallback.value = initialValue || '';
  installTabIndent(fallback);
  fallback.addEventListener('input', () => onChange(fallback.value));
  container.append(fallback);
  editorInstance = fallback;
  return {
    getValue: () => fallback.value,
    focus: () => fallback.focus(),
    destroy: destroyEditor,
  };
}

export function destroyEditor() {
  if (editorInstance && window.CodeMirror && editorInstance.toTextArea) editorInstance.toTextArea();
  editorInstance = null;
}
