import type {AuthorGroupEvaluation} from './keeperAuthorGroupEvaluation';
import type {KeeperEvidence} from './keeperEvidenceCore';

export interface WorkspaceFinding {
  id: string;
  domain: 'author' | 'query' | 'opt' | 'source';
  title: string;
  detail: string;
  severity: string;
  sourceName: string;
  location: string;
  quotes: {location: string; text: string}[];
  sha256?: string;
  response?: string;
}

/** Present only observed diagnostics and unmatched queries; never invent editorial results. */
export function keeperWorkspaceFindings(author: AuthorGroupEvaluation | null, evidence: KeeperEvidence | null): WorkspaceFinding[] {
  const authors: WorkspaceFinding[] = author?.findings.map((finding, index) => ({
    id: `author:${index}`, domain: 'author', title: finding.code.replaceAll('_', ' ').toLowerCase(),
    detail: finding.message, severity: finding.severity === 'HOLD' ? 'Needs review' : 'Incomplete evidence',
    sourceName: author.sourceName, location: finding.authorId || 'Author group', sha256: author.sourceSha256,
    quotes: finding.evidence.map(item => ({location: `${item.source} · line ${item.line}, column ${item.column}${item.truncated ? ' · shortened excerpt' : ''}`, text: item.quote})),
  })) || [];
  if (!evidence) return authors;
  const files: WorkspaceFinding[] = evidence.files.flatMap(file => file.diagnostics.map((detail: string, index: number) => ({
    id: `file:${file.id}:${index}`, domain: 'source' as const, title: 'Source inspection needs attention', detail,
    severity: 'Inspection limitation', sourceName: file.name, location: 'Source file', quotes: [], sha256: file.sha256,
  })));
  const records: WorkspaceFinding[] = evidence.records.flatMap(record => {
    const unmatched = record.kind === 'query' && record.binding?.state !== 'established';
    if (!record.diagnostics.length && !unmatched) return [];
    const file = evidence.files.find(item => item.id === record.artifactId);
    const location = record.page !== undefined ? `Page ${record.page}` : record.line !== undefined ? `Line ${record.line}` : 'Source record';
    const detail = [...record.diagnostics.map(item => item.message), ...(unmatched ? [record.binding?.reason || 'No verified author response is associated with this query.'] : [])].join(' ');
    return [{id: `record:${record.id}`, domain: record.kind === 'query' ? 'query' as const : record.kind.startsWith('opt_') ? 'opt' as const : 'source' as const,
      title: record.kind === 'query' ? `${record.queryId || 'Query'} · response not established` : record.kind.replaceAll('_', ' '),
      detail, severity: record.diagnostics.some(item => item.severity === 'error') ? 'Needs review' : 'Check evidence',
      sourceName: file?.name || 'Source unavailable', location, sha256: file?.sha256,
      quotes: [{location, text: record.source || record.text}],
    }];
  });
  return [...authors, ...files, ...records];
}
