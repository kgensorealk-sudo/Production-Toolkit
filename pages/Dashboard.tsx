

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ToolId } from '../types';

interface ToolCardProps {
    title: string;
    desc: string;
    iconColor: string;
    borderColor: string;
    Icon: React.FC<any>;
    onClick: () => void;
    delay: number;
}

const ToolCard: React.FC<ToolCardProps> = ({ title, desc, iconColor, borderColor, Icon, onClick, delay }) => (
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
                <div className={`w-14 h-14 ${iconColor} bg-opacity-10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className={`h-7 w-7 ${iconColor.replace('bg-', 'text-')}`} />
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
                    iconColor="bg-blue-50 text-blue-600"
                    borderColor="bg-blue-500"
                    delay={100}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
                    onClick={() => handleLaunch(ToolId.XML_RENUMBER)}
                />

                <ToolCard 
                    title="Reference Generator"
                    desc="Convert raw text citations into structured NISO/Elsevier XML with smart field detection."
                    iconColor="bg-sky-50 text-sky-600"
                    borderColor="bg-sky-500"
                    delay={150}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                    onClick={() => handleLaunch(ToolId.REFERENCE_GEN)}
                />
                
                <ToolCard 
                    title="CRediT Author Tagging"
                    desc="Smart-detects roles from raw text, auto-corrects typos, and generates standardized NISO CRediT XML."
                    iconColor="bg-purple-50 text-purple-600"
                    borderColor="bg-purple-500"
                    delay={200}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                    onClick={() => handleLaunch(ToolId.CREDIT_GENERATOR)}
                />

                <ToolCard 
                    title="Article Highlights Gen"
                    desc="Convert rich text input (bold, italic, sup/sub) into standardized author-highlights XML structures."
                    iconColor="bg-yellow-50 text-yellow-600"
                    borderColor="bg-yellow-500"
                    delay={300}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                    onClick={() => handleLaunch(ToolId.HIGHLIGHTS_GEN)}
                />

                <ToolCard 
                    title="Quick Text Diff"
                    desc="Instant side-by-side text comparison with line numbers, character-level highlights, and diff statistics."
                    iconColor="bg-orange-50 text-orange-600"
                    borderColor="bg-orange-500"
                    delay={400}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                    onClick={() => handleLaunch(ToolId.QUICK_DIFF)}
                />

                <ToolCard 
                    title="XML Tag Cleaner"
                    desc="Safely strip specific editing option tags while maintaining document structure and integrity."
                    iconColor="bg-teal-50 text-teal-600"
                    borderColor="bg-teal-500"
                    delay={500}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                    onClick={() => handleLaunch(ToolId.TAG_CLEANER)}
                />

                <ToolCard 
                    title="XML Table Fixer"
                    desc="Detach footnotes from table cells and convert them into table legends automatically."
                    iconColor="bg-pink-50 text-pink-600"
                    borderColor="bg-pink-500"
                    delay={600}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
                    onClick={() => handleLaunch(ToolId.TABLE_FIXER)}
                />

                <ToolCard 
                    title="View Synchronizer"
                    desc="Synchronize content from Compact to Extended views while generating unique IDs for integrity."
                    iconColor="bg-indigo-50 text-indigo-600"
                    borderColor="bg-indigo-500"
                    delay={700}
                    Icon={(props: any) => <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                    onClick={() => handleLaunch(ToolId.VIEW_SYNC)}
                />
            </div>
        </div>
    );
};

export default Dashboard;
