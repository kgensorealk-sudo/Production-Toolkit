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
        <div className="flex flex-grow h-[calc(100vh-64px)] overflow-hidden max-w-full mx-auto w-full">
            <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto hidden md:block pt-6">
                <nav className="p-4 space-y-1">
                    <NavBtn id="overview" label="Overview" />
                    <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tool Guides</div>
                    <NavBtn id="xml" label="XML Ref Normalizer" />
                    <NavBtn id="uncited" label="Uncited Ref Cleaner" />
                    <NavBtn id="otherref" label="Other-Ref Scanner" />
                    <NavBtn id="refgen" label="Reference Updater" />
                    <NavBtn id="dupe" label="Duplicate Ref Remover" />
                    <NavBtn id="idaudit" label="ID Prefix Auditor" />
                    <NavBtn id="linker" label="Citation Linker Pro" />
                    <NavBtn id="credit" label="CRediT Generator" />
                    <NavBtn id="highlights" label="Highlights Gen" />
                    <NavBtn id="fixer" label="Table Fixer" />
                    <NavBtn id="beautifier" label="Table Beautifier" />
                    <NavBtn id="sync" label="View Sync" />
                    <NavBtn id="diff" label="Quick Text Diff" />
                    <NavBtn id="tag" label="XML Tag Cleaner" />
                    <NavBtn id="ref-repair" label="Reference Structure Repair" />
                    <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Legal & Policies</div>
                    <NavBtn id="terms" label="Terms of Use" />
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

                    {section === 'linker' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Citation Linker Pro</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Surgically attaches <code>refid</code> and <code>id</code> attributes to orphaned <code>ce:cross-ref</code> and <code>ce:cross-refs</code> tags. 
                                </p>
                                <div className="bg-indigo-50 border-l-4 border-indigo-400 p-4 mb-6">
                                    <p className="text-sm text-indigo-800 font-medium">
                                        <strong>Intelligent Parsing:</strong> The tool handles complex ranges within plural tags (e.g., [1–5, 8]) by automatically expanding them into a space-separated ID list.
                                    </p>
                                </div>
                            </div>
                        </section>
                    )}

                    {section === 'beautifier' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Table XML Beautifier</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Used to fix single-line table rows. This tool inserts line breaks after <code>&lt;row&gt;</code> and <code>&lt;/entry&gt;</code> tags to make XML structurally readable in editors.
                                </p>
                            </div>
                        </section>
                    )}

                    {section === 'idaudit' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">ID Prefix Auditor</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Audits bibliography references to ensure <code>id</code> attributes match the required organizational prefix (e.g., <code>bib</code> or <code>bb</code>).
                                </p>
                            </div>
                        </section>
                    )}

                    {section === 'otherref' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Other-Ref Scanner</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Identifies and isolates all references within the bibliography that use the <code>&lt;ce:other-ref&gt;</code> structure.
                                </p>
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
                             </div>
                        </section>
                    )}

                    {section === 'dupe' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Duplicate Reference Remover</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Detects highly similar references using fuzzy matching. 
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'credit' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">CRediT Generator</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Standardizes author contribution statements into NISO CRediT XML.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'highlights' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Highlights Generator</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Converts rich text bullet points into <code>author-highlights</code> XML structures.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'fixer' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Table Fixer</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Manages the relationship between table cells and footnotes. 
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'sync' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">View Synchronizer</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Synchronizes content between multiple paragraph views (compact vs extended).
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'diff' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Quick Text Diff</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Side-by-side comparison engine specifically optimized for technical XML text.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'tag' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">XML Tag Cleaner</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Bulk processing of editorial markup tags. 
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'ref-repair' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6 uppercase tracking-tight">Reference Structure Repair</h2>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-600 mb-4">
                                    Audits and auto-repairs XML reference structures, reference ID sequences, author given-name initials, empty tags (e.g., &lt;sb:publisher&gt;), and source text blocks.
                                </p>
                            </div>
                        </section>
                    )}
                    {section === 'terms' && (
                        <section className="animate-fade-in space-y-6">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-2 uppercase tracking-tight">Terms and Conditions of Use</h2>
                            <p className="text-slate-600 text-sm">
                                By subscribing to or using these tools, you agree to comply with and be bound by the following Terms and Conditions. Please read them carefully.
                            </p>

                            <div className="space-y-4 text-sm text-slate-700">
                                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                                    <h3 className="text-base font-bold text-slate-900">1. Subscription & Account Access</h3>
                                    <p><strong>Individual License:</strong> Each subscription grants a non-transferable, non-exclusive license for one individual user only.</p>
                                    <p><strong>No Account Sharing:</strong> Sharing credentials, login details, or tool access with non-subscribers is strictly prohibited.</p>
                                </div>

                                <div className="p-5 rounded-2xl bg-rose-50/50 border border-rose-200 shadow-2xs space-y-2">
                                    <h3 className="text-base font-bold text-rose-950">2. Prohibited Activities & Unauthorized Commercial Use</h3>
                                    <p><strong>No Proxy Processing:</strong> You are strictly forbidden from running XML conversions, renumbering, or executing scripts/tools on behalf of non-subscribed users.</p>
                                    <p><strong>No Reselling or Outsourcing Services:</strong> You may not sell, rent, or monetize services using these tools to third parties or non-members.</p>
                                </div>

                                <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200 shadow-2xs space-y-2">
                                    <h3 className="text-base font-bold text-emerald-950">3. Pricing & Group Rates</h3>
                                    <p>Subscriptions are billed on a monthly basis at designated rates (Solo: ₱300/mo, 2 Users: ₱250/mo each, 3+ Users: ₱175/mo each).</p>
                                    <p>Group rates apply strictly to separate, individual active subscribers joining together and do not grant shared account access.</p>
                                </div>

                                <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200 shadow-2xs space-y-2">
                                    <h3 className="text-base font-bold text-amber-950">4. Account Banning, Subscription Cancellation, & Service Termination</h3>
                                    <p>Anyone caught sharing their account, acting as a proxy for non-paying users, or selling services using these tools will be permanently banned and have their subscription discontinued immediately by the Admin without a refund.</p>
                                    <p>If widespread system abuse or proxy usage persists, the Admin reserves the right to permanently shut down public access for all users without prior notice.</p>
                                </div>

                                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                                    <h3 className="text-base font-bold text-slate-900">5. Service Availability & Modifications</h3>
                                    <p>Tools are provided on an "as-is" and "as-available" basis. Features, security protocols, and pricing tiers are subject to modification at the sole discretion of the Admin to maintain system sustainability.</p>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Docs;