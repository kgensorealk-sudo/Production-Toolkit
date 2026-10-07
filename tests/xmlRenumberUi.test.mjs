import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../pages/XmlRenumber.tsx', import.meta.url), 'utf8');
const transpile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const start = source.indexOf('    const buildLines =');
const end = source.indexOf('    const generateDiff =', start);
assert.ok(start >= 0 && end > start);
const buildLines = new Function('escapeHtml', transpile(source.slice(start, end) + 'return buildLines;'))(
    text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

test('diff line numbers do not count a phantom line after a terminal newline', () => {
    assert.equal(buildLines([{ removed: true, value: 'old\n' }], true).length, 1);
    assert.equal(buildLines([{ added: true, value: 'new\n' }], false).length, 1);
    assert.equal(buildLines([{ value: 'one\n\n' }], true).length, 2);
    assert.equal(buildLines([{ value: 'one\ntwo' }], true).length, 2);
    assert.equal(buildLines([], true).length, 0);
});

test('diff markup escapes pasted XML', () => {
    assert.equal(buildLines([{ value: '<unsafe>&' }], true)[0], '&lt;unsafe&gt;&amp;');
});

test('copy reports asynchronous clipboard rejection instead of success', async () => {
    const start = source.indexOf('    const copyOutput =');
    const end = source.indexOf('    const copyRichText =', start);
    const messages = [];
    const copy = new Function('navigator', 'output', 'setToast', transpile(source.slice(start, end) + 'return copyOutput;'))(
        { clipboard: { writeText: async () => { throw new Error('Permission denied'); } } }, '<xml/>', message => messages.push(message));
    await copy();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'error');
});

test('storage quota failure does not discard in-memory edits', () => {
    const hookSource = readFileSync(new URL('../hooks/useSessionStorage.ts', import.meta.url), 'utf8');
    const code = transpile(hookSource.replace(/^import .*?;\s*/m, '').replace('export default useSessionStorage;', 'return useSessionStorage;'));
    let state, effect;
    const hook = new Function('useState', 'useCallback', 'useEffect', 'window', 'console', code)(
        initial => { if (state === undefined) state = initial(); return [state, value => { state = typeof value === 'function' ? value(state) : value; }]; },
        fn => fn, fn => { effect = fn; },
        { sessionStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } } }, { warn() {} });
    let [, setValue] = hook('xml', '');
    setValue('large document');
    const [current] = hook('xml', '');
    assert.doesNotThrow(() => effect());
    assert.equal(current, 'large document');
});

test('Clear cancels delayed processing and repeated keyboard processing is ignored', () => {
    const cancelStart = source.indexOf('    const cancelPending =');
    const cancelEnd = source.indexOf('    const loadInput =', cancelStart);
    const start = source.indexOf('    const renumber =');
    const end = source.indexOf('    const isStale =', start);
    const code = ts.transpileModule(source.slice(cancelStart, cancelEnd) + source.slice(start, end) + 'return { renumber, clearAll };', {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React }
    }).outputText;
    let callback, timerCleared = false, output = '', called = 0;
    const names = [...new Set([...code.matchAll(/\b(set[A-Z]\w*)\(/g)].map(m => m[1]))];
    const setters = names.map(name => name === 'setTimeout' ? fn => { callback = fn; return 1; } : name === 'setOutput' ? value => { output = value; } : () => {});
    const actions = new Function(...names, 'clearTimeout', 'processingRef', 'operationRef', 'timerRef', 'input', 'activeProfile', 'prefix', 'suffix', 'currentSettings', 'renumberWithProfile', 'sessionStorage', 'retainCitationFormatting', 'retainLabelFormatting', 'fixDuplicateCitationIds', code)(
        ...setters, () => { timerCleared = true; }, { current: false }, { current: 0 }, { current: null }, '<xml/>', {}, '[', ']', '{}',
        () => { called++; throw new Error('Must not run after clear'); }, { removeItem() {} }, true, true, false);
    actions.renumber();
    const firstCallback = callback;
    actions.renumber();
    assert.equal(callback, firstCallback);
    actions.clearAll();
    assert.equal(timerCleared, true);
    // Even an already dispatched callback must respect cancellation.
    firstCallback();
    assert.equal(called, 0);
    assert.equal(output, '');
});
