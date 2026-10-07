import React, { useRef, useState } from 'react';

interface Report { version: string; scope: string; errors: number; warnings: number; skipped: number; messages: { code: string; severity: string; position: string; message: string }[] }
export default function VtoolValidationPanel({ input, output }: { input: string; output: string }) {
    const [token, setToken] = useState('');
    const [folder, setFolder] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<Report | null>(null);
    const [snapshot, setSnapshot] = useState('');
    const [which, setWhich] = useState<'input' | 'output'>('input');
    const [filter, setFilter] = useState<'all' | 'references'>('references');
    const operation = useRef(false);
    const xml = which === 'input' ? input : output;
    const request = async (route: string, body?: object) => {
        const response = await fetch(`http://127.0.0.1:43127/${route}`, {
            method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': token },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(150000),
            ...({ targetAddressSpace: 'loopback' } as Record<string, unknown>)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Bridge request failed.');
        return result;
    };
    const run = async (action: 'connect' | 'configure' | 'validate') => {
        if (operation.current) return;
        operation.current = true; setBusy(true);
        if (action === 'validate') setReport(null);
        try {
            if (action === 'validate') {
                if (!xml.trim()) throw new Error('Provide complete article XML in the selected buffer.');
                const result = await request('validate', { xml });
                setReport(result); setSnapshot(xml); setStatus(result.version);
            } else {
                const result = await request(action === 'connect' ? 'status' : 'configure', action === 'configure' ? { folder } : undefined);
                setFolder(result.folder || ''); setStatus(result.setupError || result.version);
            }
        } catch (error) {
            setStatus(error instanceof TypeError ? 'Cannot connect. Start the local bridge, check its paired website origin, and allow browser local-network access if prompted.' : (error as Error).message);
        } finally { operation.current = false; setBusy(false); }
    };
    const lines = snapshot.split('\n');
    // The reference view is a convenience filter, not a separate validation run.
    const referenceRanges = [...snapshot.matchAll(/<ce:bib-reference\b[\s\S]*?<\/ce:bib-reference>/g)].map(match => {
        const start = snapshot.slice(0, match.index).split('\n').length;
        return [start, start + match[0].split('\n').length - 1];
    });
    const visible = report?.messages.filter(message => {
        if (filter === 'all') return true;
        const line = Number(message.position.split(':')[0]);
        return referenceRanges.some(([a, b]) => line >= a && line <= b) || /bibliograph|citation|cross-ref|bib-reference|sb:|ce:doi|reference/i.test(message.message) || /ce:cross-ref/.test(lines[line - 1] || '');
    }) || [];
    return <section className="bg-white border border-slate-200 rounded-xl p-4 text-sm space-y-3">
        <h2 className="font-bold">Production validation — local VTool</h2>
        <p className="text-slate-600">Runs your installed VTool, including its DTD checks, on the complete article. Validation never edits the XML. Reference-only fragments and missing assets cannot establish complete production validity.</p>
        <div className="flex flex-wrap gap-2">
            <input aria-label="Bridge pairing code" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Pairing code from local bridge" className="border rounded px-2 py-1 w-64" />
            <button disabled={busy || !token} onClick={() => run('connect')} className="border rounded px-3 py-1 disabled:opacity-40">Connect</button>
            <input aria-label="VTool installation folder" value={folder} onChange={e => setFolder(e.target.value)} placeholder="VTool folder (contains vtool.jar)" className="border rounded px-2 py-1 flex-1 min-w-64" />
            <button disabled={busy || !token || !folder} onClick={() => run('configure')} className="border rounded px-3 py-1 disabled:opacity-40">Save VTool folder</button>
            <select aria-label="XML buffer to validate" value={which} onChange={e => setWhich(e.target.value as 'input' | 'output')} className="border rounded px-2"><option value="input">Validate input</option><option value="output">Validate repaired output</option></select>
            <button disabled={busy || !token || !xml.trim()} onClick={() => run('validate')} className="bg-indigo-600 text-white rounded px-3 py-1 disabled:opacity-40">{busy ? 'Working…' : 'Run VTool'}</button>
        </div>
        <p role="status" className="min-h-5 truncate" title={status}>{status}</p>
        {report && <div className="border-t border-slate-200 pt-4 space-y-3">
            <h3 className="font-bold">VTool validation report</h3>
            <p className={report.errors ? 'text-red-700' : 'text-slate-700'}>Full report: {report.errors} errors, {report.warnings} warnings, {report.skipped} skipped checks. {report.scope}</p>
            {snapshot !== xml && <p className="text-amber-800">XML has changed since validation. Run VTool again.</p>}
            <select aria-label="Validation report filter" value={filter} onChange={e => setFilter(e.target.value as 'all' | 'references')} className="border rounded"><option value="references">Reference-related findings (location/text filter)</option><option value="all">All findings, including document context</option></select>
            {!visible.length && <p>No findings in this view. Check the full report totals and all findings before concluding validation passed.</p>}
            <ul className="space-y-2">{visible.map((message, index) => <li key={index} className="border-b pb-2"><b>{message.severity.toUpperCase()} · {message.code}</b> · {message.position || 'No location'}<p className="whitespace-pre-wrap">{message.message}</p></li>)}</ul>
            <button className="border rounded px-3 py-1" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'vtool-validation-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download full report</button>
        </div>}
    </section>;
}
