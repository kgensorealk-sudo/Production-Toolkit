import React from 'react';

type Link = { oldRefId: string; newRefId: string; originalLabel?: string; label: string; isChanged: boolean; requiresReview?: boolean; crossRefId?: string };
type Author = { authorIndex: number; authorName: string; authorId?: string; links: Link[] };
type Affiliation = { index: number; originalId: string; newId: string; originalLabel: string; newLabel: string; affiliationId?: string; text?: string; isChanged: boolean };
type Props = { view: 'table' | 'rendered'; authors: Author[]; affiliations: Affiliation[] };
const cell = 'px-3 py-3 border-b border-slate-100 align-top';
const Status = ({ review, changed }: { review?: boolean; changed: boolean }) => <span className={`text-xs font-semibold ${review ? 'text-amber-800' : changed ? 'text-emerald-700' : 'text-slate-500'}`}>{review ? 'Review required' : changed ? 'Changed' : 'Unchanged'}</span>;

export default function AffiliationAuditViews({ view, authors, affiliations }: Props) {
    if (view === 'rendered') return <section aria-label="Rendered affiliation changes" className="space-y-3">
        <p className="text-xs text-slate-500">Preview of author callouts and affiliation text. XML IDs are shown for identification.</p>
        <div className="grid md:grid-cols-2 gap-4">{(['before', 'after'] as const).map(side => <div key={side} className="bg-white rounded-xl border border-slate-200 p-5">
            <h4 className="font-bold text-sm text-slate-800 mb-4">{side === 'before' ? 'Before' : 'After'}</h4>
            <div className="space-y-4">{authors.map(author => <div key={author.authorIndex}>
                <p className="text-sm text-slate-900">{author.authorName}<sup className="ml-1 text-emerald-700">{author.links.map(link => side === 'before' ? link.originalLabel ?? '(unavailable)' : link.label).filter(Boolean).join(', ')}</sup></p>
                <p className="text-xs text-slate-400 mt-1">Author: {author.authorId || '(no ID)'}</p>
                {author.links.map((link, index) => <p key={index} className="text-xs mt-1 text-slate-500 break-all">{link.crossRefId || `Link ${index + 1}`} → {side === 'before' ? link.oldRefId : link.newRefId}{link.requiresReview && <span className="text-amber-800 ml-2">Review required</span>}</p>)}
            </div>)}</div>
            {!authors.length && <p className="text-sm text-slate-500">No author elements in this input.</p>}
            <div className="border-t border-slate-200 mt-5 pt-4 space-y-4">{affiliations.map(aff => <div key={aff.index}>
                <p className="text-sm leading-relaxed text-slate-800"><sup className="mr-2 font-semibold">{side === 'before' ? aff.originalLabel || '(no label)' : aff.newLabel}</sup>{aff.text || '(No affiliation text)'}</p>
                <p className="text-xs font-mono text-slate-400 mt-1">{side === 'before' ? aff.originalId : aff.newId}</p>
            </div>)}</div>
        </div>)}</div>
    </section>;

    return <div className="space-y-5">
        <section className="overflow-x-auto bg-white border border-slate-200 rounded-xl"><table className="w-full text-xs text-left">
            <caption className="text-left p-4 font-bold text-slate-800">Affiliation changes</caption>
            <thead className="bg-slate-50 text-slate-600"><tr>{['Affiliation text', 'ID before', 'ID after', 'Label before', 'Label after', 'affiliation-id (preserved)', 'Status'].map(name => <th scope="col" key={name} className={cell}>{name}</th>)}</tr></thead>
            <tbody>{affiliations.map(aff => <tr key={aff.index}><td className={cell}>{aff.text || '(No text)'}</td><td className={cell}>{aff.originalId}</td><td className={cell}>{aff.newId}</td><td className={cell}>{aff.originalLabel || '(none)'}</td><td className={cell}>{aff.newLabel}</td><td className={cell}>{aff.affiliationId || '(none)'}</td><td className={cell}><Status changed={aff.isChanged} /></td></tr>)}</tbody>
        </table></section>
        <section className="overflow-x-auto bg-white border border-slate-200 rounded-xl"><table className="w-full text-xs text-left">
            <caption className="text-left p-4 font-bold text-slate-800">Author citation changes</caption>
            <thead className="bg-slate-50 text-slate-600"><tr>{['Author / ID', 'Citation ID', 'Target before', 'Target after', 'Label before', 'Label after', 'Status'].map(name => <th scope="col" key={name} className={cell}>{name}</th>)}</tr></thead>
            <tbody>{authors.flatMap(author => author.links.length ? author.links.map((link, index) => <tr key={`${author.authorIndex}-${index}`}><td className={cell}>{author.authorName}<div className="text-slate-400 mt-1">{author.authorId || '(no ID)'}</div></td><td className={cell}>{link.crossRefId || '(no ID)'}</td><td className={cell}>{link.oldRefId}</td><td className={cell}>{link.newRefId}</td><td className={cell}>{link.originalLabel ?? '(unavailable)'}</td><td className={cell}>{link.label || '(none)'}</td><td className={cell}><Status changed={link.isChanged} review={link.requiresReview} /></td></tr>) : [<tr key={author.authorIndex}><td className={cell}>{author.authorName}</td><td colSpan={6} className={`${cell} text-slate-500`}>No affiliation citation</td></tr>])}</tbody>
        </table>{!authors.length && <p className="p-4 text-xs text-slate-500">No author elements in this input.</p>}</section>
    </div>;
}
