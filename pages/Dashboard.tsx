
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ToolId } from '../types';
import AnnouncementModal from '../components/AnnouncementModal';

interface ToolCardProps {
    title: string;
    desc: string;
    iconBg: string;
    iconText: string;
    borderColor: string;
    Icon: React.FC<any>;
    onClick: () => void;
    delay: number;
}

const ToolCard: React.FC<ToolCardProps> = ({ title, desc, iconBg, iconText, borderColor, Icon, onClick, delay }) => (
    <div 
        onClick={onClick}
        className="glass-panel bg-white/80 rounded-2xl p-1 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 cursor-pointer group animate-slide-up"
        style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
    >
        <div className="h-full bg-white rounded-xl p-8 flex flex-col border border-slate-100 relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${borderColor}`}></div>
            
            {/* Background Blob Decoration */}
            <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-500 ${borderColor.replace('bg-', 'bg-opacity-20 ')}`}></div>

            <div className="flex items-start justify-between mb-6">
                <div className={`w-14 h-14 ${iconBg} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm border border-slate-100`}>
                    <Icon className={`h-7 w-7 ${iconText}`} />
                </div>
                <div className="text-slate-300 group-hover:text-indigo-500 transition-colors transform translate-x-2 -translate-y-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                </div>
            </div>

            <h3 className="text-xl font-bold text-slate-800 mb-3 group-hover:text-indigo-700 transition-colors">{title}</h3>
            <p className="text-slate-500 text-sm leading-relaxed flex-grow">{desc}</p>
        </div>
    </div>
);

const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    const handleLaunch = (toolId: ToolId) => {
        navigate(`/${toolId}`);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-20 sm:px-6 lg:px-8">
            <AnnouncementModal />
            <div className="text-center mb-20 animate-fade-in">
                <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-6">
                    Editorial <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Workflow Suite</span>
                </h2>
                <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
                    Professional utilities designed to streamline XML processing, citation management, and content validation.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <ToolCard 
                    title="XML Reference Normalizer"
                    desc="Automatically renumbers bibliography citations and updates all cross-references in XML documents with precision."
                    iconBg="bg-blue-50"
                    iconText="text-blue-600"
                    borderColor="bg-blue-500"
                    delay={100}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
                    onClick={() => handleLaunch(ToolId.XML_RENUMBER)}
                />

                <ToolCard 
                    title="Reference Updater"
                    desc="Merge updated/corrected references into existing XML lists while optionally preserving ID integrity."
                    iconBg="bg-cyan-50"
                    iconText="text-cyan-600"
                    borderColor="bg-cyan-500"
                    delay={150}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                    onClick={() => handleLaunch(ToolId.REFERENCE_GEN)}
                />

                <ToolCard 
                    title="Duplicate Ref Remover"
                    desc="Find and merge citations with similar titles. Auto-relinks references to the kept item."
                    iconBg="bg-rose-50"
                    iconText="text-rose-600"
                    borderColor="bg-rose-500"
                    delay={175}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                    onClick={() => handleLaunch(ToolId.REF_DUPE_CHECK)}
                />
                
                <ToolCard 
                    title="CRediT Author Tagging"
                    desc="Smart-detects roles from raw text, auto-corrects typos, and generates standardized NISO CRediT XML."
                    iconBg="bg-purple-50"
                    iconText="text-purple-600"
                    borderColor="bg-purple-500"
                    delay={200}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                    onClick={() => handleLaunch(ToolId.CREDIT_GENERATOR)}
                />

                <ToolCard 
                    title="Article Highlights Gen"
                    desc="Convert rich text input (bold, italic, sup/sub) into standardized author-highlights XML structures."
                    iconBg="bg-amber-50"
                    iconText="text-amber-600"
                    borderColor="bg-amber-500"
                    delay={300}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
                    onClick={() => handleLaunch(ToolId.HIGHLIGHTS_GEN)}
                />

                <ToolCard 
                    title="Quick Text Diff"
                    desc="Instant side-by-side text comparison with line numbers, character-level highlights, and diff statistics."
                    iconBg="bg-orange-50"
                    iconText="text-orange-600"
                    borderColor="bg-orange-500"
                    delay={400}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                    onClick={() => handleLaunch(ToolId.QUICK_DIFF)}
                />

                <ToolCard 
                    title="XML Tag Cleaner"
                    desc="Safely strip specific editing option tags while maintaining document structure and integrity."
                    iconBg="bg-teal-50"
                    iconText="text-teal-600"
                    borderColor="bg-teal-500"
                    delay={500}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                    onClick={() => handleLaunch(ToolId.TAG_CLEANER)}
                />

                <ToolCard 
                    title="XML Table Fixer"
                    desc="Detach footnotes from table cells and convert them into table legends automatically."
                    iconBg="bg-pink-50"
                    iconText="text-pink-600"
                    borderColor="bg-pink-500"
                    delay={600}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                    onClick={() => handleLaunch(ToolId.TABLE_FIXER)}
                />

                <ToolCard 
                    title="View Synchronizer"
                    desc="Synchronize content from Compact to Extended views while generating unique IDs for integrity."
                    iconBg="bg-indigo-50"
                    iconText="text-indigo-600"
                    borderColor="bg-indigo-500"
                    delay={700}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>}
                    onClick={() => handleLaunch(ToolId.VIEW_SYNC)}
                />
            </div>
        </div>
    );
};

export default Dashboard;
