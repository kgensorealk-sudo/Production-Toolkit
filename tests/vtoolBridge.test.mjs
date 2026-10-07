import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, checkInput, startBridge } from '../agent/vtool-bridge/bridge.mjs';

const doctype = '<!DOCTYPE article PUBLIC "-//ES//DTD journal article DTD version 5.7.0//EN//XML" "art570.dtd">';
test('bridge requires article context and blocks parsed entities', () => {
    checkInput(doctype + '<article/>');
    assert.throws(() => checkInput('<ce:bib-reference/>'), /complete Elsevier article/);
    assert.throws(() => checkInput(doctype + '<!ENTITY attack SYSTEM "file:///secret"><article/>'), /entity declarations/);
    checkInput(doctype.replace('>', '[<!ENTITY sc1 SYSTEM "sc1" NDATA IMAGE>]>') + '<article/>');
});
test('VTool report preserves error codes, positions, and full totals', () => {
    const result = parseReport('<LogReport><results><message id="EMC502" type="error" position="1:2">Empty &lt;ce:cross-ref&gt;</message><message id="parser" type="error"><![CDATA[ID must be unique]]></message><total-errors>2</total-errors><total-warnings>0</total-warnings><total-skipped-checks>1</total-skipped-checks></results></LogReport>');
    assert.equal(result.errors, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.messages[0].message, 'Empty <ce:cross-ref>');
    assert.equal(result.messages[1].message, 'ID must be unique');
    assert.throws(() => parseReport(''), /complete validation report/);
});

test('bridge rejects unpaired origins, wrong pairing codes, and fragment validation', async () => {
    const bridge = await startBridge({ port: 43129, token: 'test-pairing-code', origin: 'http://localhost:3001' });
    try {
        const url = 'http://127.0.0.1:43129';
        assert.equal((await fetch(url + '/status', { headers: { Origin: 'https://unpaired.example' } })).status, 403);
        assert.equal((await fetch(url + '/status', { headers: { Origin: bridge.origin, 'X-Bridge-Token': 'wrong' } })).status, 401);
        const preflight = await fetch(url + '/validate', { method: 'OPTIONS', headers: { Origin: bridge.origin } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), bridge.origin);
        const fragment = await fetch(url + '/validate', { method: 'POST', headers: { Origin: bridge.origin, 'X-Bridge-Token': bridge.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ xml: '<ce:bib-reference/>' }) });
        assert.equal(fragment.status, 400);
        assert.match((await fragment.json()).error, /complete Elsevier article/);
    } finally { bridge.server.closeAllConnections(); await new Promise(resolve => bridge.server.close(resolve)); }
});
