import type {AuthorGroupEvaluation, EvaluatedAuthor, EvaluationFinding} from './keeperAuthorGroupEvaluation';
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

/** Author inventory is separate from findings so passing authors never inflate issue counts. */
export function keeperWorkspaceAuthors(result: AuthorGroupEvaluation | null) {
  if (!result) return [];
  const applies = (finding: EvaluationFinding, author: EvaluatedAuthor) => finding.authorId
    ? finding.authorId === author.id || (finding.code === 'IDENTITY' && result.authors.some(other => other.id === finding.authorId && (
      Boolean(author.authorId && author.authorId === other.authorId) || Boolean(author.name && author.name === other.name)
    )))
    : finding.evidence.some(item => item.source === 'xml' && item.start < author.evidence.end && item.end > author.evidence.start);
  const groupIssues = result.findings.filter(finding => !result.authors.some(author => applies(finding, author)));
  return result.authors.map(author => {
    const issues = result.findings.filter(finding => groupIssues.includes(finding) || applies(finding, author));
    const incomplete = !result.countsComplete || result.AUTHOR_GROUP_INTEGRITY === 'INCOMPLETE';
    const needsAttention = incomplete || issues.length > 0;
    const status = needsAttention ? 'Needs attention' : 'No action needed';
    const detail = issues.length ? issues.map(finding => finding.message).join(' ')
      : incomplete ? 'Checks are incomplete; review this author before proceeding.' : 'No issues found in the supported author-group checks.';
    const finding: WorkspaceFinding = {
      id: `author-inventory:${author.order}`, domain: 'author', title: author.name || `Author ${author.order} · name unavailable`,
      detail: `Author action: ${needsAttention ? 'Review required' : 'None'}. ${detail}`, severity: status,
      sourceName: result.sourceName, location: `Author ${author.order} · line ${author.evidence.line}`, sha256: result.sourceSha256,
      quotes: [{location: `XML · line ${author.evidence.line}, column ${author.evidence.column}${author.evidence.truncated ? ' · shortened excerpt' : ''}`, text: author.evidence.quote}],
    };
    return {finding, needsAttention, status};
  });
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
