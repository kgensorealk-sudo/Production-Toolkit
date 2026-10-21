import React from 'react';
import KeeperSandbox from '../components/KeeperSandbox';
import '../components/KeeperWorkspace.css';
export default function Keeper(){return <section id="keeper-evaluation-panel" className="keeper-workspace" aria-label="Keeper production workspace"><header className="mb-5"><h1 className="text-2xl font-bold">Keeper article workspace</h1><p className="mt-2 text-slate-700">One task, shared source files, local checks and AI review.</p></header><KeeperSandbox /></section>;}
