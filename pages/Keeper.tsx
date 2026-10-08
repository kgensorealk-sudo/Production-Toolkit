import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, LayoutDashboard, FlaskConical, Compass, FileText, BookOpen } from 'lucide-react';
import KeeperSandbox from '../components/KeeperSandbox';
import { KeeperAvatar } from '../components/KeeperAvatar';

const tasks = [
    { title: 'Tag a reference', description: 'Draft reference XML from the citation you provide, without inventing data or IDs.', icon: BookOpen, prompt: 'Tag this reference as structured Journal CE/SB XML within the Keeper sandbox. Preserve the original in plain-text ce:source-text and do not generate IDs: ' },
    { title: 'Draft a JM query', description: 'Prepare an editorial query from your correction notes.', icon: FileText, prompt: 'Query to JM: ' },
    { title: 'Explore XML guidance', description: 'Ask about tags, references, and editorial conventions.', icon: BookOpen, prompt: 'Explain the XML structure for ' },
    { title: 'Review a snippet', description: 'Work through XML or editorial text pasted into this sandbox.', icon: Compass, prompt: 'Review this snippet within the Keeper sandbox: ' },
];

export default function Keeper() {
    const [view, setView] = useState<'dashboard' | 'sandbox'>('dashboard');
    const [request, setRequest] = useState<{ text: string; id: number }>();
    return <div className="max-w-7xl mx-auto w-full px-4 py-8 flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-56 shrink-0" aria-label="Keeper workspace navigation">
            <div className="flex items-center gap-3 mb-8"><KeeperAvatar size="lg" showBadge={false} /><div><h1 className="text-xl font-bold text-slate-900">Keeper</h1><p className="text-xs text-slate-500">Editorial workspace</p></div></div>
            <nav className="flex lg:flex-col gap-2">
                {(['dashboard', 'sandbox'] as const).map(item => <button key={item} onClick={() => setView(item)} aria-current={view === item ? 'page' : undefined} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-left ${view === item ? 'bg-indigo-100 text-indigo-800' : 'text-slate-600 hover:bg-white'}`}>{item === 'dashboard' ? <LayoutDashboard size={18} /> : <FlaskConical size={18} />}{item === 'dashboard' ? 'Overview' : 'Sandbox'}</button>)}
            </nav>
            <p className="hidden lg:block mt-8 border-t border-slate-200 pt-5 text-xs leading-relaxed text-slate-500">Keeper works only with content you provide here. Other tools and their inputs remain outside this sandbox.</p>
        </aside>
        <main className="flex-1 min-w-0">
            {view === 'dashboard' && <>
                <section className="rounded-3xl bg-slate-900 text-white p-8 md:p-10">
                    <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Keeper workspace</span>
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight mt-4">What are we working on?</h2>
                    <p className="text-slate-300 max-w-lg mt-4 leading-relaxed">Bring your editorial notes, explore an XML question, or prepare your next query to the journal manager.</p>
                    <button onClick={() => setView('sandbox')} className="inline-flex items-center gap-2 mt-7 bg-white text-slate-900 px-5 py-3 rounded-xl text-sm font-semibold hover:bg-indigo-50">Open sandbox<ArrowRight size={17} /></button>
                </section>
                <section className="mt-8" aria-labelledby="keeper-tasks">
                    <h2 id="keeper-tasks" className="text-lg font-bold text-slate-900">Start a task</h2><p className="text-sm text-slate-500 mt-1">Choose a starting point, then add your details in the sandbox.</p>
                    <div className="grid md:grid-cols-3 gap-4 mt-5">{tasks.map(task => <button key={task.title} onClick={() => { setRequest({ text: task.prompt, id: Date.now() }); setView('sandbox'); }} className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-indigo-400 hover:shadow-md transition-all group">
                        <task.icon size={22} className="text-indigo-600 mb-5" /><h3 className="font-semibold text-slate-900 flex items-center justify-between gap-2">{task.title}<ArrowUpRight size={16} className="text-slate-400" /></h3><p className="text-sm text-slate-500 leading-relaxed mt-2">{task.description}</p>
                    </button>)}</div>
                </section>
                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold text-slate-900">Your sandbox, your content</h2><p className="text-sm text-slate-500 mt-1">Drafts and suggestions stay here. Keeper cannot open, read, or change another tool's workspace.</p></section>
            </>}
            <div hidden={view !== 'sandbox'}>
                <div className="mb-5"><h2 className="text-2xl font-bold text-slate-900">Editorial sandbox</h2><p className="text-sm text-slate-500 mt-1">Work through your questions and drafts with Keeper.</p></div>
                <KeeperSandbox promptRequest={request} />
            </div>
        </main>
    </div>;
}
