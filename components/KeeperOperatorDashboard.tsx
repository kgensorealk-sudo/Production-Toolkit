import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthorGroupEvaluation } from '../utils/keeperAuthorGroupEvaluation';
import type { AuthorGroupResponse } from '../utils/keeperAuthorGroupEvaluation.worker';
import './KeeperOperatorDashboard.css';

type View = 'dashboard' | 'review' | 'outputs';
interface Props {
    ownerIdentity: string;
    advancedWorkspace?: React.ReactNode;
    renderEvidence?: (result: AuthorGroupEvaluation) => React.ReactNode;
}
const outputs = [
    { glyph: '⌘', title: 'Corrected XML', description: 'Download for manual VTOOL', state: 'Not generated' },
    { glyph: '☷', title: 'JM Queries', description: 'Review questions for the journal manager', state: 'No drafts' },
    { glyph: '▤', title: 'Page-layout instructions', description: 'Typesetting-only requirements', state: 'No instructions' },
    { glyph: '▧', title: 'Graphics notes', description: 'Figure and scheme instructions', state: 'No notes' },
];

export default function KeeperOperatorDashboard({ ownerIdentity, advancedWorkspace, renderEvidence }: Props) {
    const [view, setView] = useState<View>('dashboard');
    const [selection, setSelection] = useState<{ owner: string; file: File } | null>(null);
    const [assessment, setAssessment] = useState<{ owner: string; value: AuthorGroupEvaluation } | null>(null);
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const generation = useRef(0);
    const currentOwner = useRef(ownerIdentity);
    currentOwner.current = ownerIdentity;
    const worker = useRef<Worker | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancel = useCallback(() => {
        generation.current++;
        worker.current?.terminate();
        worker.current = null;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    }, []);
    useEffect(() => {
        cancel(); setSelection(null); setAssessment(null); setNotice(''); setBusy(false); setView('dashboard');
        if (input.current) input.current.value = '';
        return cancel;
    }, [ownerIdentity, cancel]);
    const file = selection?.owner === ownerIdentity ? selection.file : null;
    const result = assessment?.owner === ownerIdentity ? assessment.value : null;

    async function choose(next: File | null) {
        cancel(); setAssessment(null); setSelection(null); setNotice(''); setBusy(false);
        if (!next) return;
        if (next.size > 4_000_000 || !next.name.toLowerCase().endsWith('.xml') || next.name.length > 200) {
            setNotice('INCOMPLETE: Choose an XML file up to 4 MB with a filename of at most 200 characters.');
            return;
        }
        const id = generation.current, owner = ownerIdentity;
        setSelection({ owner, file: next }); setBusy(true);
        const active = () => generation.current === id && currentOwner.current === owner;
        const failed = (message: string) => {
            if (!active()) return;
            cancel(); setBusy(false); setAssessment(null);
            setNotice(`INCOMPLETE: ${message} No evaluation result was verified. Manual author-group review is required.`);
        };
        try {
            const bytes = await next.arrayBuffer();
            if (!active()) return;
            const w = new Worker(new URL('../utils/keeperAuthorGroupEvaluation.worker.ts', import.meta.url), { type: 'module' });
            worker.current = w;
            w.onmessage = (event: MessageEvent<AuthorGroupResponse>) => {
                if (!active() || worker.current !== w || event.data?.requestId !== id) return;
                const value = event.data.result;
                if (!value || value.sourceName !== next.name || value.byteLength !== next.size) {
                    failed('The worker response did not match the selected source.'); return;
                }
                cancel(); setBusy(false); setAssessment({ owner, value });
            };
            w.onerror = () => failed('Local evaluation failed.');
            timer.current = setTimeout(() => failed('Local evaluation timed out.'), 20_000);
            w.postMessage({ requestId: id, bytes, name: next.name, instructions: '' }, [bytes]);
        } catch { failed('The XML could not be read or its worker could not start.'); }
    }
    const findings = result?.findings.length;
    const status = busy ? 'Evaluating author-group locally…' : result ? `Author-group: ${result.AUTHOR_GROUP_INTEGRITY}` : file ? 'Article selected · evaluation unavailable' : 'Waiting for article';
    const clear = () => { cancel(); setSelection(null); setAssessment(null); setBusy(false); setNotice(''); if (input.current) input.current.value = ''; };
    function outputRows(unavailable = false) {
        return outputs.map(item => <div className="item" key={item.title}><div className="glyph" aria-hidden="true">{item.glyph}</div><div className="grow"><div className="ititle">{item.title}</div><div className="idesc">{item.description}</div></div><span className={unavailable ? 'download' : 'state'}>{unavailable ? 'Unavailable' : item.state}</span></div>);
    }
    return <main className="keeper-operator-dashboard shell">
        <header className="top"><div className="brand"><div className="logo" aria-hidden="true">✦</div><div><div className="name">Keeper</div><div className="subtitle">Article Production Assistant</div></div></div><span className="smallpill">Local evaluation · read-only</span></header>
        <nav className="nav" aria-label="Keeper dashboard navigation">{(['dashboard', 'review', 'outputs'] as const).map(item => <button type="button" key={item} className={view === item ? 'active' : ''} aria-current={view === item ? 'page' : undefined} aria-controls={`keeper-${item}-view`} onClick={() => setView(item)}>{item === 'dashboard' ? 'Dashboard' : item === 'review' ? 'Review' : 'Outputs'}</button>)}</nav>

        <section id="keeper-dashboard-view" hidden={view !== 'dashboard'} aria-label="Keeper Dashboard">
            <div className="intro"><h1>Your production workspace</h1><p>Upload an article, see what needs attention, and collect your production results.</p></div>
            <div className="layout"><section className="card"><div className="label">Article files</div><div className="muted" style={{ marginTop: 5 }}>Start with your XML and any supporting documents.</div><div className="upload"><div className="em" aria-hidden="true">⇧</div><p>Choose an XML article for read-only evaluation</p><button type="button" className="primary" onClick={() => input.current?.click()}>Choose article XML</button><input ref={input} type="file" accept=".xml,text/xml,application/xml" aria-label="Choose article XML file" hidden onChange={event => { const next = event.target.files?.[0] || null; event.target.value = ''; void choose(next); }} /></div>
                {file && <div className="file"><span aria-hidden="true">📄</span><strong>{file.name}</strong><span>Selected locally</span><button type="button" className="clear" onClick={clear} aria-label="Clear selected article">Clear</button></div>}
                <div className="notice" role="status">{notice || 'Author-group evaluation runs locally and never changes your XML. Supporting documents and saved tasks remain in Advanced workspace.'}</div>
            </section><section className="card"><div className="label">Article status</div><div className="muted" style={{ marginTop: 6 }} role="status">{status}</div><div className="progress" aria-hidden="true"><i /></div><div className="muted">{busy ? 'Read-only checks in progress · no production run' : result ? 'Read-only evaluation complete · no production run' : 'No production run has started'}</div><div className="notice">Keeper will show confirmed work here. Missing results remain marked as pending, never fabricated. Current coverage: author-group only.</div></section></div>
            <div className="three"><div className="stat"><span className="ico" aria-hidden="true">✓</span><small>Corrections made</small><strong>{result ? result.AUTHOR_NAME_CHANGES_APPLIED : '—'}</strong><small>{result ? 'Read-only evaluation · no changes applied' : 'Not evaluated'}</small></div><div className="stat"><span className="ico" aria-hidden="true">!</span><small>Needs your review</small><strong>{result?.countsComplete ? findings : '—'}</strong><small>{result ? 'Author-group findings only' : 'No findings yet'}</small></div><div className="stat"><span className="ico" aria-hidden="true">▤</span><small>Ready for QC</small><strong>—</strong><small>Unavailable · no corrected XML</small></div></div>
            <div className="layout section"><section className="card"><div className="sectionhead"><div className="label">Production results</div><button type="button" className="secondary" onClick={() => setView('outputs')}>View all</button></div><div className="items">{outputRows()}</div></section><section className="card"><div className="sectionhead"><div className="label">Quality Check</div><span className="state">Not started</span></div><p className="qc-copy">When Keeper finishes its internal checks, review the corrected XML, run VTOOL manually outside the app, then complete your final QC.</p><button type="button" className="secondary" onClick={() => setView('review')}>Open review</button><div className="notice">Manual external VTOOL · No automatic publication sign-off. Final QC is unavailable without a verified candidate.</div></section></div>
        </section>

        <section id="keeper-review-view" hidden={view !== 'review'} aria-label="Keeper Review"><div className="intro"><h1>Review &amp; Quality Check</h1><p>Only verified findings will appear here. You control final review.</p></div><section className="card"><div className="label">Review queue</div><div className="notice" role="status">{busy ? 'Local evaluation is in progress.' : result ? `Author-group: ${result.AUTHOR_GROUP_INTEGRITY}. ${result.countsComplete ? `${findings} findings recorded.` : 'Finding coverage is incomplete.'} Other article domains and production completion have not been evaluated.` : notice || 'No verified article findings are available. Choose an XML article on Dashboard to run read-only author-group checks.'}</div>
            {result && <><ul className="findings">{result.findings.map((finding, index) => <li key={`${finding.code}-${index}`}><span className="badge warn">{finding.severity}</span> <strong>{finding.code}</strong> · {finding.message}</li>)}</ul><details className="evidence"><summary>Author-group findings and evidence</summary>{renderEvidence?.(result)}</details><p className="results">Keeper applied {result.AUTHOR_NAME_CHANGES_APPLIED} XML changes. Name history: {result.AUTHOR_NAME_HISTORY}. Source SHA-256: <span className="source-hash">{result.sourceSha256}</span>. External DTD/VTOOL: NOT_RUN. This is not manuscript sign-off.</p></>}
            <div style={{ marginTop: 17 }}><button type="button" className="secondary" disabled title="Requires a verified candidate and evidence">Run final Quality Check — unavailable</button></div></section></section>

        <section id="keeper-outputs-view" hidden={view !== 'outputs'} aria-label="Keeper Outputs"><div className="intro"><h1>Production outputs</h1><p>Your corrected files, queries, and instructions in one place.</p></div><section className="card"><div className="items">{outputRows(true)}</div><div className="notice">No verified production output is connected to this article. Existing Workbench results remain in Advanced workspace. This read-only evaluator does not generate corrected XML, JM Query drafts, page-layout instructions or graphics notes.</div></section></section>

        <details className="advanced"><summary id="keeper-advanced-workspace-summary" aria-controls="keeper-advanced-workspace-region">Advanced workspace · existing technical tools</summary><p>Existing Workbench, task selection, evidence and recovery tools remain accessible here. Article evaluation above is separate from saved Workbench tasks.</p><section id="keeper-advanced-workspace-region" role="region" aria-labelledby="keeper-advanced-workspace-summary" className="advanced-body">{advancedWorkspace}<details className="tool-info"><summary>Keeper Tools · XML / PDF Evidence</summary><p>Keeper can inspect OPT tags, retrieve source records and match queries to edit-report responses. Import supporting files in the existing workspace. Other tool integrations remain unavailable.</p></details></section></details>
    </main>;
}
