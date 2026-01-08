
import React, { useState } from 'react';

const Docs: React.FC = () => {
    const [section, setSection] = useState('overview');

    const NavBtn = ({ id, label }: { id: string, label: string }) => (
        <button 
            onClick={() => setSection(id)} 
            className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${section === id ? 'bg-blue-50 text-blue-700 font-semibold border-r-4 border-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
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
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Production Toolkit Overview</h2>
                            <p className="text-lg text-slate-600 mb-4">
                                A secure, offline-capable suite of utilities designed specifically for editorial production workflows. 
                                This application runs entirely locally on your machine, ensuring no sensitive content is sent to external servers.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="font-bold text-slate-800 mb-2">XML Processing</h3>
                                    <p className="text-sm text-slate-500">Specialized tools for manipulating Elsevier/NISO standard XML tags, citations, and tables.</p>
                                </div>
                                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <h3 className="font-bold text-slate-800 mb-2">Content Analysis</h3>
                                    <p className="text-sm text-slate-500">Diff tools and role parsers to validate and correct editorial content efficiently.</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {section === 'xml' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6">XML Reference Normalizer</h2>
                            <div className="prose prose-slate">
                                <p className="text-slate-600 mb-4">
                                    Automatically renumbers bibliography citations and updates all corresponding cross-references in the text.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Key Features</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Renumbering:</strong> Scans for <code>&lt;ce:bib-reference&gt;</code> tags and applies sequential numbering (e.g., [1], [2]).</li>
                                    <li><strong>Cross-Ref Updates:</strong> Updates <code>&lt;ce:cross-ref&gt;</code> tags to match the new bibliography numbers.</li>
                                    <li><strong>Range Collapsing:</strong> Automatically converts sequences like "1, 2, 3" into ranges like "1–3" inside <code>&lt;ce:cross-refs&gt;</code>.</li>
                                    <li><strong>Other-Ref Extraction:</strong> Detects and extracts unnumbered references (<code>&lt;ce:other-ref&gt;</code>) for manual review.</li>
                                </ul>
                            </div>
                        </section>
                    )}

                    {section === 'refgen' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Reference Updater</h2>
                             <div className="prose prose-slate">
                                <p className="text-slate-600 mb-4">
                                    Merges a list of corrected XML references into an existing "Original" XML reference list based on matching labels.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">How to Use</h3>
                                <ol className="list-decimal pl-5 space-y-2 text-slate-600">
                                    <li>Paste your <strong>Original</strong> XML list (the full list from the current file).</li>
                                    <li>Paste your <strong>Updated</strong> XML list (the subset or full list containing corrections).</li>
                                    <li>Click <strong>Merge Updates</strong>.</li>
                                    <li>The tool replaces original references with updated ones where the label (e.g. <code>[62]</code>) matches.</li>
                                </ol>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Features</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Structure Preservation:</strong> Keeps original references that were not in the update list.</li>
                                    <li><strong>Preserve IDs:</strong> Optionally keeps the <code>id="..."</code> attribute from the Original XML even when replacing content. This prevents breaking internal links (<code>&lt;ce:cross-ref&gt;</code>) in the main article body.</li>
                                </ul>
                             </div>
                        </section>
                    )}

                    {section === 'dupe' && (
                        <section className="animate-fade-in">
                            <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Duplicate Reference Remover</h2>
                             <div className="prose prose-slate">
                                <p className="text-slate-600 mb-4">
                                    Scans a bibliography for citations with identical or very similar titles, allowing you to select one to keep and automatically re-linking text citations to the keeper.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Workflow</h3>
                                <ol className="list-decimal pl-5 space-y-2 text-slate-600">
                                    <li>Paste the full XML content (including text citations and the reference list).</li>
                                    <li>Click <strong>Find Duplicates</strong>. The tool groups references with >85% title similarity.</li>
                                    <li>Review each group and select the "Keeper" (the correct version).</li>
                                    <li>Click <strong>Merge & Fix</strong>.</li>
                                </ol>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">What happens during Merge?</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Remapping:</strong> The tool scans the text for <code>&lt;ce:cross-ref&gt;</code> tags pointing to the deleted duplicates and updates their <code>refid</code> to point to the selected "Keeper".</li>
                                    <li><strong>Deletion:</strong> The XML blocks for the rejected duplicates are completely removed from the file.</li>
                                </ul>
                             </div>
                        </section>
                    )}

                    {section === 'credit' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6">CRediT Author Tagging</h2>
                             <div className="prose prose-slate">
                                <p className="text-slate-600 mb-4">
                                    Parses unstructured author contribution statements and converts them into standardized NISO CRediT XML.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">How to Use</h3>
                                <ol className="list-decimal pl-5 space-y-2 text-slate-600">
                                    <li>Paste the contribution statement (e.g., "John Doe: Writing. Jane Smith: Editing.").</li>
                                    <li>The tool auto-detects author names and roles.</li>
                                    <li><strong>Typos</strong> are auto-suggested (e.g., "Writting" &rarr; "Writing - Original Draft").</li>
                                    <li><strong>Duplicates</strong> are flagged and removed.</li>
                                    <li>Copy the generated XML or the formatted text for Word.</li>
                                </ol>
                             </div>
                        </section>
                    )}

                    {section === 'highlights' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Article Highlights Generator</h2>
                             <div className="prose prose-slate">
                                <p className="text-slate-600 mb-4">
                                    Converts rich text (pasted from Word, etc.) into the structured <code>author-highlights</code> XML format.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Supported Formatting</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Bold:</strong> Converted to <code>&lt;ce:bold&gt;</code></li>
                                    <li><strong>Italic:</strong> Converted to <code>&lt;ce:italic&gt;</code></li>
                                    <li><strong>Superscript:</strong> Converted to <code>&lt;ce:sup&gt;</code></li>
                                    <li><strong>Subscript:</strong> Converted to <code>&lt;ce:inf&gt;</code></li>
                                </ul>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Usage</h3>
                                <p>Simply paste your bulleted or numbered list into the visual editor. The tool will parse each line as a <code>&lt;ce:list-item&gt;</code> and wrap formatting appropriately.</p>
                             </div>
                        </section>
                    )}

                    {section === 'fixer' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6">XML Table Fixer</h2>
                             <div className="prose prose-slate">
                                <p className="text-slate-600 mb-4">
                                    Corrects a common issue where general table notes are incorrectly tagged as specific footnotes attached to cells.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Workflow</h3>
                                <ol className="list-decimal pl-5 space-y-2 text-slate-600">
                                    <li>Paste XML containing <code>&lt;ce:table&gt;</code>.</li>
                                    <li>The tool identifies all <code>&lt;ce:table-footnote&gt;</code> elements.</li>
                                    <li>Select footnotes that should be general legends.</li>
                                    <li>The tool removes the footnote reference from the cell and moves the content to a <code>&lt;ce:legend&gt;</code> block at the bottom of the table.</li>
                                </ol>
                             </div>
                        </section>
                    )}

                    {section === 'sync' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6">View Synchronizer</h2>
                             <div className="prose prose-slate">
                                <p className="text-slate-600 mb-4">
                                    Automatically updates <code>Extended</code> view paragraphs to match <code>Compact</code> view content, solving content mismatch issues in dual-view XML files.
                                </p>
                                <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">Features</h3>
                                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                    <li><strong>Content Sync:</strong> Replaces Extended content with Compact content.</li>
                                    <li><strong>ID Safety:</strong> Automatically regenerates unique IDs for internal tags (like <code>&lt;ce:cross-ref&gt;</code>) to prevent duplicate ID errors.</li>
                                    <li><strong>Bulk Processing:</strong> Handles multiple paragraph pairs at once.</li>
                                </ul>
                             </div>
                        </section>
                    )}

                     {section === 'diff' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Quick Text Diff</h2>
                             <p className="text-slate-600 mb-4">
                                A side-by-side comparison tool to identify changes between two text blocks. It highlights character-level differences, making it easy to spot subtle typo corrections or inserted XML tags.
                             </p>
                        </section>
                    )}

                    {section === 'tag' && (
                        <section className="animate-fade-in">
                             <h2 className="text-3xl font-extrabold text-slate-900 mb-6">XML Tag Cleaner</h2>
                             <p className="text-slate-600 mb-4">
                                Bulk-process editorial tracking tags. This tool scans for proprietary <code>&lt;opt_INS&gt;</code>, <code>&lt;opt_DEL&gt;</code>, and <code>&lt;opt_comment&gt;</code> tags.
                             </p>
                             <ul className="list-disc pl-5 space-y-2 text-slate-600">
                                <li><strong>Accept All:</strong> Keeps insertion content, removes deletion tags/content, removes comments.</li>
                                <li><strong>Reject All:</strong> Removes insertion tags/content, restores deletion content, removes comments.</li>
                             </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Docs;
