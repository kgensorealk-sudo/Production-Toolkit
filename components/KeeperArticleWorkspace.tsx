import React, {useEffect, useMemo, useRef, useState} from 'react';
import {FileText, FileArchive, ArrowRight, Check, Plus, ShieldCheck, Sparkles, FolderOpen, Search} from 'lucide-react';
import type {KeeperArtifact, KeeperEvidence} from '../utils/keeperEvidenceCore';
import {keeperWorkspaceFindings, type WorkspaceFinding} from '../utils/keeperWorkspaceFindings';
import {useKeeperWorkspaceChecks} from './KeeperWorkspaceChecks';

type View = 'summary' | 'findings' | 'queries' | 'activity';
type Props = {
  artifacts: KeeperArtifact[];
  instructions: string;
  activeTask: string;
  saveStatus: string;
  inspectionStatus: 'idle' | 'running' | 'ready' | 'error';
  evidence: KeeperEvidence | null;
  busy: boolean;
  canAsk: boolean;
  ask: () => void;
  cancel: () => void;
  importFile: () => void;
  removeFile: (id: string) => void;
  onStandalone: () => void;
  sidebar: React.ReactNode;
  settings: React.ReactNode;
  notices: React.ReactNode;
  sourceInput: React.ReactNode;
  prompt: React.ReactNode;
  answer: React.ReactNode;
  answerEvidence: React.ReactNode;
  activity: React.ReactNode;
  queries: React.ReactNode;
  technical: React.ReactNode;
  selectedAiEvidence: boolean;
  clearAiEvidence: () => void;
};
const domainNames = {all: 'All', author: 'Author group', query: 'Queries', opt: 'OPT markup', source: 'Sources'};

export default function KeeperArticleWorkspace(props: Props) {
  const checks = useKeeperWorkspaceChecks(props.artifacts, props.instructions);
  const [view, setView] = useState<View>('findings');
  const [mobileTasksOpen, setMobileTasksOpen] = useState(false);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const [findingPage, setFindingPage] = useState(0);
  const [filter, setFilter] = useState<keyof typeof domainNames>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recordView, setRecordView] = useState<WorkspaceFinding | null>(null);
  const [quotePage, setQuotePage] = useState(0);
  const [exported, setExported] = useState(false);
  const findings = useMemo(() => keeperWorkspaceFindings(checks.result, props.evidence), [checks.result, props.evidence]);
  const visible = findings.filter(finding => filter === 'all' || finding.domain === filter);
  const findingPageSize = 20;
  const lastFindingPage = Math.max(0, Math.ceil(visible.length / findingPageSize) - 1);
  const shownFindingPage = Math.min(findingPage, lastFindingPage);
  const shownFindings = visible.slice(shownFindingPage * findingPageSize, (shownFindingPage + 1) * findingPageSize);
  const selected = recordView || shownFindings.find(finding => finding.id === selectedId) || shownFindings[0];
  const queryRecords = props.evidence?.records.filter(record => record.kind === 'query') || [];
  const queryPageSize = 20;
  const [queryPage, setQueryPage] = useState(0);
  const lastQueryPage = Math.max(0, Math.ceil(queryRecords.length / queryPageSize) - 1);
  const shownQueryPage = Math.min(queryPage, lastQueryPage);
  const shownQueries = queryRecords.slice(shownQueryPage * queryPageSize, (shownQueryPage + 1) * queryPageSize);
  useEffect(() => {setSelectedId(null);setRecordView(null);setQuotePage(0);setQueryPage(0);setFindingPage(0);setExported(false);}, [props.artifacts, props.instructions, props.evidence]);
  useEffect(() => {setQuotePage(0);}, [selected?.id]);
  const title = props.artifacts.find(file => file.kind === 'xml')?.name.replace(/\.xml$/i, '') || (props.activeTask === 'scratch' ? 'Standalone workspace' : 'Selected article task');
  const authorState = checks.busy ? 'Checking author group…' : checks.result ? `Author group: ${checks.result.AUTHOR_GROUP_INTEGRITY}` : 'Author checks not run';
  const runChecks = () => {setView('findings');setFilter('all');setFindingPage(0);setRecordView(null);setExported(false);props.clearAiEvidence();checks.run();};
  function selectFinding(finding: WorkspaceFinding) {setSelectedId(finding.id);setRecordView(null);props.clearAiEvidence();}
  function exportReport() {
    const report = {kind: 'Read-only article review', task: props.activeTask, authorGroup: checks.result,
      sources: props.evidence?.files || [], findings, limitations: ['No XML changes applied.', 'Findings cover extracted records and supported author checks only.', 'No DTD/VTool or publication sign-off.']};
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');link.href = url;link.download = 'keeper-review-report.json';link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);setExported(true);
  }
  function openQuery(record: typeof queryRecords[number]) {
    const file = props.evidence?.files.find(item => item.id === record.artifactId);
    setRecordView({id: record.id, domain: 'query', title: record.queryId || 'Production query', detail: record.binding?.reason || 'No response association established.',
      severity: record.binding?.state === 'established' ? 'Matched response · edit not verified' : 'Needs attention',
      sourceName: file?.name || 'Source unavailable', location: record.line ? `Line ${record.line}` : 'XML query', sha256: file?.sha256,
      quotes: [{location: record.line ? `XML · line ${record.line}` : 'XML query', text: record.source || record.text}],
      response: record.binding?.state === 'established' ? record.binding.response : undefined});
    props.clearAiEvidence();
  }
  const quote = selected?.quotes.map(item => `${item.location}\n${item.text}`).join('\n\n') || '';
  const quoteStart = quotePage * 5000;
  const tabIds: View[] = ['summary', 'findings', 'queries', 'activity'];
  return <section className="kw-shell" aria-label="Keeper sandbox">
    <aside className="kw-sidebar" aria-label="Article tasks">
      <a className="kw-brand" href="#keeper-workspace-title">Keeper <Sparkles size={23} aria-hidden="true"/></a>
      <p className="kw-sidebar-sub">Article review workspace</p>
      <button type="button" className="kw-new" onClick={props.onStandalone} disabled={props.busy}><Plus size={16}/>Standalone workspace</button>
      <button type="button" className="kw-mobile-toggle" aria-expanded={mobileTasksOpen} aria-controls="kw-sidebar-tools" onClick={()=>setMobileTasksOpen(!mobileTasksOpen)}>Tasks &amp; settings</button>
      <div id="kw-sidebar-tools" className={`kw-sidebar-tools${mobileTasksOpen?' kw-mobile-expanded':''}`}>{props.sidebar}
      <div className="kw-sidebar-bottom"><p><ShieldCheck size={16} aria-hidden="true"/> Saved on this device</p><p>Original files stay local. AI review sends extracted evidence to the server and AI provider.</p>{props.settings}</div></div>
    </aside>
    <div className="kw-main">
      <header className="kw-top"><div><p className="kw-eyebrow">Article workspace / {props.activeTask === 'scratch' ? 'standalone' : 'local task'}</p><h1 id="keeper-workspace-title">{title}</h1><div className="kw-subtitle">Read-only review <span className="kw-pill" role="status">{props.saveStatus}</span></div></div>
        <div className="kw-check-actions"><button type="button" className="kw-primary" disabled={!props.artifacts.some(file => file.kind === 'xml') || checks.busy || props.busy} onClick={runChecks}>{checks.busy ? 'Checking author group…' : 'Run local checks'}<ArrowRight size={15}/></button>{checks.busy && <button type="button" className="kw-secondary" onClick={checks.cancel}>Cancel local checks</button>}</div>
      </header>
      {props.notices}
      <section className="kw-files" aria-label="Files for active task">
        {(['xml', 'pdf'] as const).map(kind => {
          const file = props.artifacts.find(item => item.kind === kind);
          const inspected = props.evidence?.files.find(item => item.id === file?.id);
          return <div key={kind} className={`kw-file${file ? '' : ' kw-file-empty'}`}>
            <div className="kw-file-icon">{kind === 'xml' ? <FileText size={22}/> : <FileArchive size={22}/>}</div>
            <div className="kw-file-description"><strong title={file?.name}>{file?.name || (kind === 'xml' ? 'Article XML' : 'Edit-report PDF')}</strong><span>{kind.toUpperCase()} · {file ? inspected?.inspectionStatus === 'ready' ? 'Source inspected locally' : props.inspectionStatus === 'running' ? 'Inspecting source…' : 'Source available' : kind === 'xml' ? 'Choose your article to begin' : 'Optional supporting evidence'}</span></div>
            {file ? <button type="button" className="kw-icon-action" disabled={props.busy} aria-label={`Remove attachment ${file.name}`} onClick={() => props.removeFile(file.id)}>Remove</button> : <button type="button" className="kw-text-button" disabled={props.busy} onClick={props.importFile}>Add file</button>}
          </div>;
        })}
      </section>
      {props.sourceInput}
      <div className="kw-workflow" role="group" aria-label="Review stages"><div><span className={props.artifacts.length ? 'kw-stage-done' : ''}>{props.artifacts.length ? <Check size={14}/> : <FolderOpen size={14}/>} Files imported</span><ArrowRight size={13}/><span className={checks.result ? 'kw-stage-done' : ''}>{checks.result && <Check size={14}/>}Local checks</span><ArrowRight size={13}/><strong>Review findings</strong><ArrowRight size={13}/><span>{exported && <Check size={14}/>}Export report</span></div><span>No XML edits applied</span></div>
      <p className="kw-status" role="status">{checks.notice || authorState}{props.inspectionStatus === 'running' ? ' · Inspecting files in the background…' : props.inspectionStatus === 'error' ? ' · Source inspection needs attention.' : ''}</p>
      <div className="kw-review-layout">
        <section className="kw-card kw-review-card" aria-label="Article review">
          <div className="kw-tabs" role="tablist" aria-label="Workspace views">{tabIds.map(tab => <button key={tab} type="button" id={`kw-${tab}-tab`} role="tab" aria-selected={view === tab} aria-controls={`kw-${tab}-panel`} tabIndex={view === tab ? 0 : -1} onClick={() => setView(tab)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();const index = tabIds.indexOf(tab);
            const next = event.key === 'Home' ? tabIds[0] : event.key === 'End' ? tabIds[3] : tabIds[(index + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
            setView(next);document.getElementById(`kw-${next}-tab`)?.focus();
          }}>{tab[0].toUpperCase() + tab.slice(1)}{tab === 'findings' ? ` · ${findings.length}` : tab === 'queries' ? ` · ${queryRecords.length}` : ''}</button>)}</div>
          <div id="kw-summary-panel" role="tabpanel" aria-labelledby="kw-summary-tab" hidden={view !== 'summary'} className="kw-panel">
            <div className="kw-section-heading"><h2>Review summary</h2><span className="kw-pill">{props.inspectionStatus === 'ready' ? 'Sources inspected' : 'Awaiting inspection'}</span></div>
            <p className="kw-muted">Checks cover supported source evidence. Full manuscript validation and rendered proof checks remain separate.</p>
            <div className="kw-stats"><div><strong>{findings.length}</strong><span>Observed findings</span></div><div><strong>{queryRecords.length}</strong><span>Extracted production queries</span></div></div>
            <p className="kw-muted">{authorState} · {checks.result?.countsComplete === false ? 'Author finding coverage incomplete' : 'No corrected XML generated'}</p>
            {props.prompt}
            <section className="kw-answer" aria-label="Keeper AI review"><h2>Keeper review</h2>{props.answer}</section>
          </div>
          <div id="kw-findings-panel" role="tabpanel" aria-labelledby="kw-findings-tab" hidden={view !== 'findings'} className="kw-panel">
            <div className="kw-section-heading"><h2>Findings to review</h2><span className="kw-muted">{visible.length} of {findings.length} findings</span></div>
            <div className="kw-filters" role="group" aria-label="Filter findings">{(Object.keys(domainNames) as (keyof typeof domainNames)[]).filter(domain => domain !== 'source' || findings.some(finding => finding.domain === 'source')).map(domain => <button type="button" key={domain} aria-pressed={filter === domain} onClick={() => {setFilter(domain);setFindingPage(0);setRecordView(null);props.clearAiEvidence();}}>{domainNames[domain]} · {domain === 'all' ? findings.length : findings.filter(finding => finding.domain === domain).length}</button>)}</div>
            {selected&&<button type="button" className="kw-evidence-jump kw-text-button" onClick={()=>{evidenceHeading.current?.scrollIntoView({block:'start',behavior:'auto'});evidenceHeading.current?.focus({preventScroll:true});}}>Jump to source evidence</button>}
            {visible.length ? <ul className="kw-finding-list">{shownFindings.map(finding => <li key={finding.id}><button type="button" className={`kw-finding${selected?.id === finding.id ? ' kw-selected' : ''}`} aria-pressed={selected?.id === finding.id} onClick={() => selectFinding(finding)}><span className="kw-finding-meta"><span className="kw-badge">{finding.severity}</span><span>{finding.location}</span></span><strong>{finding.title}</strong><p>{finding.detail}</p><span className="kw-finding-source">{finding.sourceName} · {domainNames[finding.domain]}</span></button></li>)}</ul> : <div className="kw-empty"><Search size={30} aria-hidden="true"/><h3>{findings.length ? 'No findings match this filter' : checks.result ? 'No findings recorded' : 'Your article review starts here'}</h3><p>{!props.artifacts.length ? 'Import an XML article or open a saved task. Then run local checks to see findings and their source evidence.' : !checks.result ? 'Run local checks to review the author group. Queries and markup diagnostics appear after source inspection.' : 'No findings were recorded in the checked evidence. Review coverage in Summary; other article domains and external validation remain separate.'}</p></div>}
            {visible.length>findingPageSize&&<div className="kw-pagination"><button type="button" className="kw-text-button" disabled={shownFindingPage===0} onClick={()=>{setFindingPage(shownFindingPage-1);setSelectedId(null);}}>Previous findings</button><span>Page {shownFindingPage+1} / {lastFindingPage+1}</span><button type="button" className="kw-text-button" disabled={shownFindingPage===lastFindingPage} onClick={()=>{setFindingPage(shownFindingPage+1);setSelectedId(null);}}>Next findings</button></div>}
            <p className="kw-coverage">{checks.result?.countsComplete === false ? 'Author finding coverage is incomplete. ' : ''}Findings cover extracted records and supported checks. Zero findings do not establish manuscript correctness.</p>
          </div>
          <div id="kw-queries-panel" role="tabpanel" aria-labelledby="kw-queries-tab" hidden={view !== 'queries'} className="kw-panel">
            <div className="kw-section-heading"><h2>Production queries</h2><span className="kw-muted">{queryRecords.length} extracted queries</span></div><p className="kw-muted">A matched author response does not verify that an edit was made.</p>
            {queryRecords.length ? <><div className="kw-table-scroll"><table><caption className="sr-only">Production queries and associated author responses</caption><thead><tr><th scope="col">Query</th><th scope="col">Author response</th><th scope="col">Status</th></tr></thead><tbody>{shownQueries.map(record => <tr key={record.id}><td><button type="button" className="kw-text-button" onClick={() => openQuery(record)}>{record.queryId || 'Query without ID'}</button><p>{record.text.slice(0,400)}{record.text.length > 400 ? '…' : ''}</p></td><td>{record.binding?.state === 'established' ? <p>{record.binding.response?.slice(0,400)}{(record.binding.response?.length || 0) > 400 ? '…' : ''}</p> : 'No verified response assigned'}</td><td><span className="kw-badge">{record.binding?.state === 'established' ? 'Matched response' : 'Needs attention'}</span><p>Edit not verified</p><button type="button" className="kw-text-button" onClick={() => openQuery(record)}>View evidence</button></td></tr>)}</tbody></table></div><div className="kw-pagination"><button className="kw-text-button" disabled={shownQueryPage === 0} onClick={() => setQueryPage(shownQueryPage - 1)}>Previous queries</button><span>{shownQueryPage + 1} / {lastQueryPage + 1}</span><button className="kw-text-button" disabled={shownQueryPage === lastQueryPage} onClick={() => setQueryPage(shownQueryPage + 1)}>Next queries</button></div>{props.queries}</> : <div className="kw-empty"><p>{props.inspectionStatus === 'ready' ? 'No production queries were extracted from these files.' : 'Import and inspect your files to see production queries.'}</p></div>}
          </div>
          <div id="kw-activity-panel" role="tabpanel" aria-labelledby="kw-activity-tab" hidden={view !== 'activity'} className="kw-panel"><h2>Task activity</h2><div className="kw-activity-line">{props.artifacts.length} source files attached · {props.saveStatus}</div><div className="kw-activity-line">{authorState}</div>{props.activity}<details className="kw-technical"><summary>Source inventory and coverage</summary>{props.technical}</details></div>
          <footer className="kw-actions"><p>Local checks run without AI.<br/>AI review sends extracted evidence.</p><div><button type="button" className="kw-secondary" disabled={!checks.result && !props.evidence} onClick={exportReport}>Export report</button>{props.busy ? <button type="button" className="kw-primary" onClick={props.cancel}>Cancel AI request</button> : <button type="button" className="kw-primary" disabled={!props.canAsk} onClick={() => {setView('summary');props.ask();}}>Ask Keeper <Sparkles size={15}/></button>}</div></footer>
        </section>
        <aside className="kw-card kw-inspector" aria-label="Finding evidence"><header><h2 ref={evidenceHeading} tabIndex={-1}>Source evidence</h2><span className="kw-pill">Read-only</span></header>
          {props.selectedAiEvidence ? props.answerEvidence : selected ? <><div className="kw-source-location"><strong>{selected.sourceName}</strong><span>{selected.location}</span></div><pre className="kw-quote">{quote.slice(quoteStart,quoteStart + 5000) || 'No source excerpt is available for this finding.'}</pre>{quote.length > 5000 && <div className="kw-pagination"><button type="button" disabled={quotePage === 0} onClick={() => setQuotePage(quotePage - 1)}>Previous text</button><span>Excerpt {quotePage + 1} / {Math.ceil(quote.length / 5000)}</span><button type="button" disabled={quoteStart + 5000 >= quote.length} onClick={() => setQuotePage(quotePage + 1)}>Next text</button></div>}<h3>{selected.title}</h3><p>{selected.detail}</p>{selected.response && <section><h3>Associated author response</h3><p className="kw-response">{selected.response}</p></section>}<details className="kw-technical"><summary>Source identity</summary><p>SHA-256: {selected.sha256 || 'Unavailable'}</p><p>{selected.id}</p></details><div className="kw-evidence-note"><strong>What this establishes</strong><p>Observed source content, not proof of an applied correction. A matched author response does not verify an edit.</p></div></> : <div className="kw-empty kw-evidence-empty"><FileText size={28} aria-hidden="true"/><h3>Keep the source in view</h3><p>Select a finding or query to see its source excerpt and location here.</p></div>}
          {!props.selectedAiEvidence && props.answerEvidence && <details className="kw-technical"><summary>AI answer evidence and retrieval coverage</summary>{props.answerEvidence}</details>}
        </aside>
      </div>
      <p className="kw-page-note">Read-only review · No XML changes applied · DTD/VTool and publication sign-off remain separate.</p>
    </div>
  </section>;
}
