import React from "react";
import type { summarizeOptChanges } from '../utils/keeperOptSummary';

export interface KeeperEvidenceReportData {
  recordCount: number;
  errors: number;
  warnings: number;
  optChanges?: ReturnType<typeof summarizeOptChanges>;
  files: {
    id: string;
    name: string;
    sha256: string;
    diagnostics: string[];
    inspectionStatus?: string;
    articleDoi?: string | null;
    articleDois?: string[];
  }[];
  issues: {
    recordId: string;
    artifactId: string;
    line?: number;
    page?: number;
    offset?: number;
    diagnostics: { severity: string; message: string }[];
  }[];
  issuesTruncated: boolean;
  bindings?: Record<string, number>;
  unresolvedBindings?: {
    recordId: string;
    artifactId: string;
    queryId?: string;
    line?: number;
    state: string;
    reason: string;
  }[];
  unresolvedBindingsTruncated?: boolean;
  retrievalCoverage?: {
    recordsRetrieved: number;
    inventoryRecords: number;
    xmlExcerptReads: number;
  };
}

export default function KeeperEvidenceReport({
  report,
}: {
  report: KeeperEvidenceReportData;
}) {
  const name = (id: string) =>
    report.files.find((f) => f.id === id)?.name || id;
  return (
    <details className="border border-indigo-200 rounded-xl bg-white p-5" open>
      <summary className="text-sm font-semibold text-slate-700 cursor-pointer">
        Evidence report · {report.recordCount} records
      </summary>
      <p className="text-sm mt-3">
        {report.errors} inspection errors · {report.warnings} inspection warnings. These do
        not block the task.
      </p>
      {report.files.some((file) => file.diagnostics.length > 0) && (
        <p className="text-xs mt-2 text-amber-800">
          Some files could not be fully inspected. Counts cover extracted
          records only; zero findings do not establish clean input.
        </p>
      )}
      {report.retrievalCoverage && (
        <p className="text-xs mt-2 text-slate-600">
          Inventory records retrieved by Keeper:{" "}
          {report.retrievalCoverage.recordsRetrieved}/
          {report.retrievalCoverage.inventoryRecords}. XML excerpts read:{" "}
          {report.retrievalCoverage.xmlExcerptReads}. Retrieval does not
          establish editorial completion.
        </p>
      )}
      {report.optChanges && report.optChanges.files.length > 0 && (
        <section className="mt-4 text-sm" aria-label="Verified XML edit inventory">
          <h3 className="font-semibold text-slate-800">XML edit inventory</h3>
          <p className="mt-1">{report.optChanges.complete ? 'Verified totals' : 'Observed so far — inspection incomplete'}: {report.optChanges.inserted} insertion tags · {report.optChanges.deleted} deletion tags.</p>
          {!report.optChanges.complete && <p className="text-xs text-amber-800 mt-1">These are lower bounds; zero does not confirm absence of edits.</p>}
          <ul className="mt-2 space-y-1 text-xs">
            {report.optChanges.files.map(file => <li key={file.artifactId} className="break-words">
              {file.name}: {file.inserted.tags} insertions · {file.deleted.tags} deletions{file.complete ? '' : ' · incomplete'}.
              {' '}{file.inserted.flagged + file.deleted.flagged} flagged tags and {file.inserted.whitespaceOnly + file.deleted.whitespaceOnly} whitespace-only tags are included.
            </li>)}
          </ul>
          <p className="text-xs text-slate-500 mt-2">Tag occurrences, not words or confirmation of completed edits. Whitespace-only content may represent intentional spacing.</p>
        </section>
      )}
      <div className="space-y-3 mt-4">
        {report.files.map((f) => (
          <div
            key={f.id}
            className="text-xs break-words bg-slate-50 rounded-lg p-3"
          >
            <strong>{f.name}</strong>
            {f.inspectionStatus && <p className="mt-1">Inspection: {f.inspectionStatus === 'failed' ? 'Failed — file was uploaded but could not be inspected' : f.diagnostics.length ? 'Finished with limitations — see diagnostics' : 'Completed'}</p>}
            <p className="font-mono text-slate-500 break-all mt-1">
              SHA-256: {f.sha256}
            </p>
            {(f.articleDoi !== undefined || f.articleDois !== undefined) && (
              <p className="mt-1">
                Article DOI evidence:{" "}
                {f.articleDoi || f.articleDois?.join(", ") || "Unavailable"}
              </p>
            )}
            {f.diagnostics.map((d, i) => (
              <p key={i} className="text-amber-800 mt-1">
                {d}
              </p>
            ))}
          </div>
        ))}
      </div>
      {report.issues.length > 0 && (
        <ul className="text-xs mt-4 space-y-2">
          {report.issues.map((r) => (
            <li key={r.recordId} className="text-amber-800 break-words">
              {name(r.artifactId)}{r.page !== undefined ? ` · page ${r.page}` : r.line !== undefined ? ` · line ${r.line}` : ''}
              {r.offset !== undefined
                ? `, character ${r.offset + 1}`
                : ""}:{" "}
              {r.diagnostics
                .map((d) => `${d.severity}: ${d.message}`)
                .join(" ")}
              <span className="block text-slate-500 font-mono break-all">
                {r.recordId}
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.issuesTruncated && (
        <p className="text-xs text-amber-800 mt-2">
          First 100 issue records shown. Keeper can retrieve the remaining
          records.
        </p>
      )}
      {report.bindings && Object.keys(report.bindings).length > 0 && (
        <div className="mt-4 text-xs text-slate-600">
          <h3 className="font-semibold text-slate-800">
            Query / response binding
          </h3>
          <p className="mt-1">
            {Object.entries(report.bindings)
              .map(([state, count]) => `${state}: ${count}`)
              .join(" · ")}
          </p>
          <ul className="mt-2 space-y-2">
            {report.unresolvedBindings?.map((r) => (
              <li key={r.recordId} className="break-words">
                {name(r.artifactId)} · {r.queryId || "Query without ID"} ·{" "}
                {r.state}: {r.reason}
              </li>
            ))}
          </ul>
          {report.unresolvedBindingsTruncated && (
            <p className="mt-2">First 100 unresolved query bindings shown.</p>
          )}
        </div>
      )}
      <p className="text-xs mt-4 text-slate-500">
        Read-only structural evidence. No DTD/VTool or rendered-proof
        validation. A matched response does not prove the edit was made.
      </p>
    </details>
  );
}
