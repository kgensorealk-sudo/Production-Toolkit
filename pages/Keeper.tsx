import React, { useState } from 'react';
import { FlaskConical, ShieldCheck, Wrench, FileText, BookOpen, ScanLine, ListChecks, ArrowRight } from 'lucide-react';
import KeeperSandbox from '../components/KeeperSandbox';
import { KeeperAvatar } from '../components/KeeperAvatar';

const toolPlaceholders = [
    { name: 'Reference Tagger', description: 'A future space for drafting structured reference XML from supplied citations.', icon: BookOpen },
    { name: 'Affiliation Review', description: 'A future space for reviewing displayed and structured affiliation differences.', icon: ScanLine },
    { name: 'XML Review', description: 'A future space for reviewing XML against rules supplied in this sandbox.', icon: ListChecks },
    { name: 'Query Drafting', description: 'A future space for drafting queries using your instructions and examples.', icon: FileText },
];

export default function Keeper() {
    const [activeTab, setActiveTab] = useState<'workbench' | 'tools'>('workbench');
    return <main className="max-w-[1500px] mx-auto w-full px-4 md:px-8 py-7 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-5 mb-8">
            <div className="flex items-center gap-4"><KeeperAvatar size="lg" showBadge={false} /><div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-600 flex items-center gap-2"><FlaskConical size={13} /> Keeper sandbox</p>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mt-1">Your workspace. Your rules.</h1>
                <p className="text-sm text-slate-500 mt-2">Give Keeper a task, supply your material, and review the result.</p>
            </div></div>
            <div className="flex items-center gap-2 text-xs text-slate-600 border border-slate-200 bg-white rounded-full px-4 py-2"><ShieldCheck size={15} className="text-indigo-500" /> Isolated from other tools</div>
        </header>
        <div role="tablist" aria-label="Keeper workspace sections" className="flex gap-2 border-b border-slate-200 mb-6">
            {(['workbench', 'tools'] as const).map(tab => <button key={tab} id={`keeper-${tab}-tab`} role="tab" aria-selected={activeTab === tab} aria-controls={`keeper-${tab}-panel`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'workbench' : event.key === 'End' ? 'tools' : tab === 'tools' ? 'workbench' : 'tools'; setActiveTab(next); document.getElementById(`keeper-${next}-tab`)?.focus(); } }} className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {tab === 'workbench' ? <FlaskConical size={16} /> : <Wrench size={16} />}{tab === 'workbench' ? 'Workbench' : 'Keeper Tools'}{tab === 'tools' && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Planned</span>}
            </button>)}
        </div>
        <section id="keeper-workbench-panel" role="tabpanel" aria-labelledby="keeper-workbench-tab" hidden={activeTab !== 'workbench'}>
            <div className="flex flex-wrap justify-between items-center gap-3 bg-indigo-50/60 border border-indigo-100 rounded-xl px-5 py-3 mb-5"><p className="text-xs text-slate-600">General sandbox · No dedicated tools connected yet</p><button onClick={() => setActiveTab('tools')} className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700">Explore Keeper Tools<ArrowRight size={14} /></button></div>
            <KeeperSandbox />
        </section>
        <section id="keeper-tools-panel" role="tabpanel" aria-labelledby="keeper-tools-tab" hidden={activeTab !== 'tools'}>
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6"><div><h2 className="text-xl font-semibold text-slate-900">Keeper’s toolbox</h2><p className="text-sm text-slate-500 mt-2 max-w-2xl">Dedicated tools will live inside this sandbox. These placeholders reserve their space; they do not run tasks or load any instructions.</p></div><span className="text-xs text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-2">0 tools available</span></div>
            <div className="grid sm:grid-cols-2 gap-5">{toolPlaceholders.map(tool => <article key={tool.name} className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 flex flex-col">
                <div className="flex items-center justify-between mb-5"><div className="p-3 bg-slate-50 rounded-xl text-slate-500"><tool.icon size={22} strokeWidth={1.5} /></div><span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">Placeholder</span></div>
                <h3 className="font-semibold text-slate-800">{tool.name}</h3><p className="text-sm text-slate-500 mt-2 leading-relaxed flex-1">{tool.description}</p><div className="border-t border-slate-100 mt-6 pt-4 flex items-center justify-between"><span className="text-xs text-slate-400">Not configured</span><button disabled className="text-xs font-semibold text-slate-400 bg-slate-100 rounded-lg px-3 py-2 cursor-not-allowed">Coming later</button></div>
            </article>)}</div>
        </section>
    </main>;
}
