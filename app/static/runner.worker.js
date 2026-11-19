/* Student snippets run in a dedicated browser worker, never in the API server. */
const PYODIDE_VERSION = '0.27.7';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let pyodidePromise;

async function boot() {
  if (!pyodidePromise) {
    self.postMessage({ kind: 'loading' });
    importScripts(`${PYODIDE_BASE}pyodide.js`);
    pyodidePromise = loadPyodide({ indexURL: PYODIDE_BASE }).then((pyodide) => {
      pyodide.runPython(`
import builtins as _host_builtins
_host_original_import = _host_builtins.__import__
_host_denied_imports = {'js', 'pyodide', 'micropip', 'socket', 'ssl', 'http', 'urllib', 'asyncio', 'subprocess', 'multiprocessing', 'ctypes'}
def _host_limited_import(name, *args, **kwargs):
    if name.split('.')[0] in _host_denied_imports:
        raise ImportError('That module is not available in this learning runner.')
    return _host_original_import(name, *args, **kwargs)
def _host_disabled_input(*args, **kwargs):
    raise RuntimeError('input() is disabled in the assessment runner. Use the provided function parameters instead.')
_host_builtins.__import__ = _host_limited_import
_host_builtins.input = _host_disabled_input
`);
      // Student code receives no browser API object or network primitive through the worker global.
      try { self.fetch = undefined; } catch (_) {}
      try { self.XMLHttpRequest = undefined; } catch (_) {}
      try { self.WebSocket = undefined; } catch (_) {}
      try { self.importScripts = undefined; } catch (_) {}
      self.postMessage({ kind: 'ready' });
      return pyodide;
    });
  }
  return pyodidePromise;
}

self.addEventListener('message', async (event) => {
  const { id, code = '', mode = 'script', functionName = '', testCases = [] } = event.data || {};
  try {
    const pyodide = await boot();
    pyodide.globals.set('student_code', String(code));
    pyodide.globals.set('runner_mode', String(mode));
    pyodide.globals.set('function_name', String(functionName));
    pyodide.globals.set('cases_json', JSON.stringify(Array.isArray(testCases) ? testCases : []));
    const packed = await pyodide.runPythonAsync(`
import contextlib as _runner_contextlib
import io as _runner_io
import json as _runner_json

class _RunnerOutput(_runner_io.StringIO):
    def write(self, text):
        remaining = 8000 - len(self.getvalue())
        if remaining > 0:
            super().write(str(text)[:remaining])
        return len(str(text))

_runner_output = _RunnerOutput()
_runner_namespace = {'__name__': '__main__'}
_runner_namespace['input'] = _host_disabled_input
_runner_actuals = []
_runner_error = None
with _runner_contextlib.redirect_stdout(_runner_output):
    exec(student_code, _runner_namespace)
    if runner_mode in ('function_preview', 'function_tests'):
        _runner_callable = _runner_namespace.get(function_name)
        if not callable(_runner_callable):
            raise NameError('Define a function named ' + function_name + ' before running this task.')
        _runner_cases = _runner_json.loads(cases_json)
        if runner_mode == 'function_preview':
            _runner_cases = _runner_cases[:1]
        for _runner_case in _runner_cases:
            _runner_result = _runner_callable(*_runner_case.get('args', []), **_runner_case.get('kwargs', {}))
            _runner_actuals.append(_runner_json.loads(_runner_json.dumps(_runner_result, ensure_ascii=False, allow_nan=False)))
            if runner_mode == 'function_preview':
                print(repr(_runner_result))
_runner_json.dumps({'output': _runner_output.getvalue(), 'actuals': _runner_actuals}, ensure_ascii=False)
`);
    const result = JSON.parse(String(packed));
    self.postMessage({ id, kind: 'result', result });
  } catch (error) {
    self.postMessage({ id, kind: 'result', result: { output: '', actuals: [], error: String(error && (error.message || error)) } });
  }
});
