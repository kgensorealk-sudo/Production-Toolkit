import React from "react";

export interface KeeperEvidenceReportData {
  recordCount: number;
  errors: number;
  warnings: number;
  files: {
    id: string;
    name: string;
    sha256: string;
    diagnostics: string[];
    articleDoi?: string | null;
    articleDois?: string[];
  }[];
  issues: {
    recordId: string;
    artifactId: string;
    line?: number;
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
        {report.errors} OPT errors · {report.warnings} OPT warnings. These do
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
      <div className="space-y-3 mt-4">
        {report.files.map((f) => (
          <div
            key={f.id}
            className="text-xs break-words bg-slate-50 rounded-lg p-3"
          >
            <strong>{f.name}</strong>
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
              {name(r.artifactId)} · line {r.line}
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
