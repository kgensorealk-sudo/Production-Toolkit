import React, { useState } from 'react';

const Docs: React.FC = () => {
    const [section, setSection] = useState('overview');

    const NavBtn = ({ id, label }: { id: string, label: string }) => (
        <button 
            onClick={() => setSection(id)} 
            className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${section === id ? 'bg-indigo-50 text-indigo-700 font-semibold border-r-4 border-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="flex flex-grow h-[calc(100vh-64px)] overflow-hidden max-w-7xl mx-auto w-full">
            <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto hidden md:block pt-6">
                <nav className="p-4 space-y-1">
                    <NavBtn id="overview" label="Overview" />
                    <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tool Guides</div>
                    <NavBtn id="xml" label="XML Ref Normalizer" />
                    <NavBtn id="refgen" label="Reference Updater" />
                    <NavBtn id="dupe" label="Duplicate Ref Remover" />
                    <NavBtn id="credit" label="CRediT Generator" />
                    <NavBtn id="highlights" label="Highlights Gen" />
                    <NavBtn id="fixer" label="Table Fixer" />
                    <NavBtn id="sync" label="View Sync" />
                    <NavBtn id="diff" label="Quick Text Diff" />
                    <NavBtn id="tag" label="XML Tag Cleaner" />
                </nav>
            </aside>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50 scroll-smooth">
                <div className="max-w-3xl mx-auto space-y-12 pb-20">
                    {section === 'overview' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Production Toolkit</h2>
                            <p className="text-lg text-slate-600 mb-8 font-light leading-relaxed">
                                A specialized suite of editorial workflow tools designed to process high-volume XML documents. All processing is performed locally in your browser/application, ensuring maximum security and data privacy.
                            </p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 mb-4">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </div>
                                    <h3 className="font-bold text-slate-800 mb-2">Internal Renumbering</h3>
                                    <p className="text-sm text-slate-500 leading-relaxed">Every tool supports advanced renumbering for <code>rf</code>, <code>st</code>, <code>ir</code>, <code>or</code>, and <code>tr</code> tag sequences to maintain XML schema validity.</p>
                                </div>
                                <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 mb-4">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <h3 className="font-bold text-slate-800 mb-2">Smart Fingerprinting</h3>
                                    <p className="text-sm text-slate-500 leading-relaxed">Our matching engine uses content-based fingerprints (Author + Year + Title) to identify references even when labels have changed.</p>
                                </div>
                            </div>

                            <div className="mt-12 p-8 bg-slate-900 rounded-[2rem] text-white">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    Security & Privacy
                                </h3>
                                <p className="text-slate-400 text-sm leading-relaxed mb-0">
                                    This toolkit does not store your manuscript content on any server. All XML transformations happen within the local execution context. Database interactions are limited to user authentication and subscription management.
                                </p>
                            </div>
                        </section>
                    )}

                    {section === 'xml' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Reference Normalizer</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Used when a bibliography has been manually edited or scrambled. It restores sequential numbering and updates the body of the article to match.
                                </p>
                                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
                                    <p className="text-sm text-amber-800 font-medium">
                                        <strong>Note:</strong> This tool will collapse ranges automatically. e.g., <code>[1, 2, 3]</code> becomes <code>[1–3]</code>.
                                    </p>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Workflow</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Prefix/Suffix:</strong> Set your preferred bracket style (e.g., [ ], ( ), or none).</li>
                                    <li><strong>Scan:</strong> The tool finds every <code>&lt;ce:label&gt;</code> and assigns it a new number.</li>
                                    <li><strong>Update:</strong> Every <code>&lt;ce:cross-ref&gt;</code> in the document is re-mapped to the new numbers based on the original <code>refid</code>.</li>
                                </ul>
                            </div>
                        </section>
                    )}

                    {section === 'refgen' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Reference Updater</h2>
                             <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Surgically merges corrected references into an existing bibliography while <strong>preserving original IDs</strong>.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Matching Logic</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Label Mode (Strict):</strong> Matches based on exact label text (e.g., "Doe, 2020").</li>
                                    <li><strong>Numbered Mode (Smart):</strong> Uses a fingerprint of <code>Author + Year + Title fragment</code>. This allows you to update a bibliography even if you are changing styles (e.g., Author-Date to Vancouver).</li>
                                </ul>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 mt-6">
                                    <h4 className="font-bold text-emerald-800 mb-2">Key Benefit</h4>
                                    <p className="text-sm text-emerald-700">By preserving the original <code>bib-reference id="..."</code>, you ensure that every existing cross-reference in the main article remains functional, saving hours of manual re-linking.</p>
                                </div>
                             </div>
                        </section>
                    )}

                    {section === 'dupe' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Duplicate Reference Remover</h2>
                             <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Identify redundant bibliography entries and merge them into a single unique item while automatically fixing all body links.
                                </p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
                                    <div className="p-4 bg-slate-100 rounded-xl">
                                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h.01a1 1 0 100-2H10zm3 0a1 1 0 000 2h.01a1 1 0 100-2H13zM7 13a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h.01a1 1 0 100-2H10zm3 0a1 1 0 000 2h.01a1 1 0 100-2H13z" clipRule="evenodd" /></svg>
                                            Numbered Style
                                        </h4>
                                        <p className="text-xs text-slate-500">The tool detects deleted references and recalculates ranges (e.g., [1, 3, 4] becomes [1, 3-4]).</p>
                                    </div>
                                    <div className="p-4 bg-slate-100 rounded-xl">
                                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                            Author-Date Safety
                                        </h4>
                                        <p className="text-xs text-slate-500">Completely safe. It re-links internal refids while leaving the visible text (e.g., "Doe, 2020") intact.</p>
                                    </div>
                                </div>

                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Resolution Matrix</h3>
                                <p className="text-slate-600">The tool provides a conflict list. For every duplicate group, you select the <strong>KEEPER</strong>. Upon execution, the other items are deleted and every citation in the article is checked for those IDs and pointed to the keeper.</p>
                             </div>
                        </section>
                    )}

                    {section === 'credit' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">CRediT Author Tagging</h2>
                             <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Converts natural language contribution statements into the standardized NISO CRediT XML schema.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Smart Correction</h3>
                                <p className="text-slate-600">The tool uses a fuzzy logic dictionary to fix common misspellings (e.g., "Writting" &rarr; "Writing - Original Draft") and automatically filters out non-standard roles.</p>
                             </div>
                        </section>
                    )}

                    {section === 'highlights' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Article Highlights Generator</h2>
                             <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Translates formatted bullet points from Microsoft Word into structural <code>author-highlights</code> XML.
                                </p>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li>Preserves <b>bold</b> and <i>italic</i> formatting tags.</li>
                                    <li>Auto-strips manual numbering and bullet characters.</li>
                                    <li>Validates highlight length against standard 255-character limits.</li>
                                </ul>
                             </div>
                        </section>
                    )}

                    {section === 'fixer' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Table Fixer</h2>
                             <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Fixes "Stuck Footnotes"—where general table notes were incorrectly tagged as specific cell footnotes.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Two Modes</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Detach:</strong> Moves <code>table-footnote</code> content into a <code>legend</code> block and removes the citation from the table cell.</li>
                                    <li><strong>Attach:</strong> Converts <code>simple-para</code> legends into structured <code>table-footnote</code> items and inserts the citation into the table body.</li>
                                </ul>
                             </div>
                        </section>
                    )}

                    {section === 'sync' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">View Synchronizer</h2>
                             <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Ensures <code>Compact</code> and <code>Extended</code> paragraph views are identical in content.
                                </p>
                                <p className="text-slate-600">
                                    When you sync content into the Extended view, the tool automatically re-generates unique <code>id</code> attributes for all internal tags to ensure the XML remains valid for submission.
                                </p>
                             </div>
                        </section>
                    )}

                     {section === 'diff' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Quick Text Diff</h2>
                             <p className="text-slate-600 mb-4">
                                Provides a surgical, character-level comparison of two text blocks. Useful for verifying small typo corrections or checking that XML tag nesting wasn't broken during an edit.
                             </p>
                        </section>
                    )}

                    {section === 'tag' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Tag Cleaner</h2>
                             <p className="text-slate-600 mb-4">
                                A cleanup utility to process editorial tracking tags like <code>&lt;opt_INS&gt;</code> and <code>&lt;opt_DEL&gt;</code>.
                             </p>
                             <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li><strong>Accept All:</strong> Keeps insertions and removes the markup.</li>
                                <li><strong>Reject All:</strong> Restores deletions and removes insertions.</li>
                                <li><strong>Comments:</strong> Proprietary comment tags are always removed during cleaning.</li>
                             </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Docs;