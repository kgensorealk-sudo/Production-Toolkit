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
                    <NavBtn id="uncited" label="Uncited Ref Cleaner" />
                    <NavBtn id="otherref" label="Other-Ref Scanner" />
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
                                    <p className="text-sm text-slate-500 leading-relaxed">Every tool supports advanced renumbering for <code>rf</code>, <code>se</code>, <code>ir</code>, <code>or</code>, and <code>tr</code> tag sequences to maintain XML schema validity.</p>
                                </div>
                                <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 mb-4">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <h3 className="font-bold text-slate-800 mb-2">Smart Fingerprinting</h3>
                                    <p className="text-sm text-slate-500 leading-relaxed">Our matching engine uses content-based fingerprints (Author + Year + Title) to identify references even when labels have changed.</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {section === 'otherref' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Other-Ref Scanner</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Identifies and isolates all references within the bibliography that use the <code>&lt;ce:other-ref&gt;</code> structure. These are typically unstructured citations requiring manual cleanup or conversion.
                                </p>
                                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
                                    <p className="text-sm text-amber-800 font-medium">
                                        <strong>Word Integration:</strong> Use the "Copy for MS Word" feature to transfer items with formatting intact. This preserves italics and bold tags for external retagging workflows.
                                    </p>
                                </div>
                            </div>
                        </section>
                    )}

                    {section === 'uncited' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Uncited Reference Cleaner</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Audits the bibliography by checking every <code>bib-reference id</code> against all <code>cross-ref refid</code> attributes in the document.
                                </p>
                                <div className="bg-rose-50 border-l-4 border-rose-400 p-4 mb-6">
                                    <p className="text-sm text-rose-800 font-medium">
                                        <strong>Cleaning Logic:</strong> Items checked in the list will be permanently removed from the XML source. Use this tool after merging duplicates to clean up residual orphaned references.
                                    </p>
                                </div>
                            </div>
                        </section>
                    )}

                    {section === 'xml' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Reference Normalizer</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Used when a bibliography has been manually edited or scrambled. It restores sequential numbering and updates the body of the article to match. Supports custom prefix/suffix configuration.
                                </p>
                            </div>
                        </section>
                    )}

                    {section === 'refgen' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Reference Updater</h2>
                             <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Surgically merges corrected references into an existing bibliography while <strong>preserving original IDs</strong>. Ideal for applying proofreading corrections without breaking internal document links.
                                </p>
                             </div>
                        </section>
                    )}

                    {section === 'dupe' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Duplicate Reference Remover</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Detects highly similar references using fuzzy matching. When duplicates are merged, the tool automatically re-links all body citations to the selected "keeper" reference.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'credit' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">CRediT Generator</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Standardizes author contribution statements into NISO CRediT XML. Smart-parsing detects roles from raw text and corrects common typos and variations.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'highlights' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Highlights Generator</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Converts rich text bullet points into <code>author-highlights</code> XML structures. Preserves bold, italic, and superscript formatting during transformation.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'fixer' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Table Fixer</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Manages the relationship between table cells and footnotes. Detach inline footnotes to legends for layout flexibility or re-attach legend items as structured footnotes.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'sync' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">View Synchronizer</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Synchronizes content between multiple paragraph views (compact vs extended) to ensure consistency while maintaining unique ID sequences for internal nodes.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'diff' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Quick Text Diff</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Side-by-side comparison engine specifically optimized for technical XML text. Features character-level highlighting and structural change detection.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'tag' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Tag Cleaner</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Bulk processing of editorial markup tags. Safely accepts or rejects proprietary insertions and deletions while preserving the underlying XML schema integrity.
                                </p>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Docs;