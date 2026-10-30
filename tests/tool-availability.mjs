import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import * as Router from 'react-router';
import {MemoryRouter, Routes, Route, Navigate, useNavigate, useLocation} from 'react-router';
import {renderToStaticMarkup} from 'react-dom/server';
import * as Icons from 'lucide-react';
import * as Motion from 'motion/react';
import {ToolId} from '../types.ts';
import {TOOL_REGISTRY, DASHBOARD_TOOL_IDS, EXPERIMENTAL_TOOL_IDS, isDashboardTool, isExperimentalTool, getToolInfo, findToolsForScenario} from '../utils/toolRegistry.ts';

assert.equal(ToolId.FORMULA_EDITOR_EXP,'formulaEditorExp','Keep existing grants and pinned-tool IDs compatible.');
for(const value of [ToolId.FORMULA_EDITOR_EXP,'/formulaEditorExp','/formulaEditor','#/formulaEditor']) {
    assert.equal(isDashboardTool(value),true);
    assert.equal(isExperimentalTool(value),false);
    assert.equal(getToolInfo(value).route,'/formulaEditor');
}
assert.ok(findToolsForScenario('formula').some(tool=>tool.id===ToolId.FORMULA_EDITOR_EXP));
assert.ok(!EXPERIMENTAL_TOOL_IDS.includes(ToolId.FORMULA_EDITOR_EXP));
assert.ok(!Object.values(ToolId).includes('highlightsGen'));
assert.ok(!DASHBOARD_TOOL_IDS.includes('highlightsGen'));
assert.ok(!TOOL_REGISTRY.some(tool=>tool.route==='/highlightsGen'));
assert.equal(isExperimentalTool(ToolId.CITATION_LINKER_EXP),true);

const source=fs.readFileSync('App.tsx','utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations={},routes=new Map();
function visit(node){
    if(ts.isVariableDeclaration(node)&&['ProtectedRoute','NodeAccessController'].includes(node.name.getText(ast)))declarations[node.name.getText(ast)]='const '+node.getText(ast)+';';
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='Route') {
        const path=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(ast)==='path');
        if(path?.initializer&&ts.isStringLiteral(path.initializer))routes.set(path.initializer.text,node.getText(ast));
    }
    ts.forEachChild(node,visit);
}visit(ast);
const paths=['/dashboard','/keeper','/highlightsGen','/formulaEditorExp','/formulaEditor'];
for(const path of paths)assert.ok(routes.has(path),path);
let auth;
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.None}}).outputText;
const Dashboard=()=>React.createElement('main',null,'Dashboard');
const FormulaEditorExperimental=()=>React.createElement('main',null,'Formula Studio');
const Layout=({children})=>React.createElement('div',null,children);
const AuthModal=()=>React.createElement('main',null,'Tool access required');
const LoadingOverlay=()=>React.createElement('main',null,'Loading');
const useAuth=()=>auth;
const factory=new Function('React','Route','Navigate','useNavigate','useAuth','useToolMetrics','ToolId','Dashboard','FormulaEditorExperimental','Layout','AuthModal','LoadingOverlay',compile(
    declarations.ProtectedRoute+declarations.NodeAccessController+'\nreturn <>'+paths.map(path=>routes.get(path)).join('')+'<Route path="/login" element={<main>Login</main>}/></>;'
));
const routeTree=()=>factory(React,Route,Navigate,useNavigate,useAuth,()=>{},ToolId,Dashboard,FormulaEditorExperimental,Layout,AuthModal,LoadingOverlay);
const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{url:'https://tool-availability.test'});
for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
const {createRoot}=await import('react-dom/client');
const Location=()=>React.createElement('output',null,useLocation().pathname);
let checks=0;
for(const entry of [
    {path:'/keeper',target:'/dashboard',text:'Dashboard'},
    {path:'/highlightsGen',target:'/dashboard',text:'Dashboard'},
    {path:'/formulaEditorExp',target:'/formulaEditor',text:'Formula Studio'},
    {path:'/formulaEditor',target:'/formulaEditor',text:'Formula Studio'},
    {path:'/formulaEditor',target:'/formulaEditor',text:'Tool access required',unlocked:false},
    {path:'/formulaEditorExp',target:'/login',text:'Login',signedOut:true}
]) {
    auth={loading:false,session:entry.signedOut?null:{},profile:{is_subscribed:false,unlocked_tools:entry.unlocked===false?[]:['formulaEditorExp']},freeTools:[],isAdmin:false};
    const root=createRoot(document.getElementById('root'));
    await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[entry.path]},React.createElement(Location),React.createElement(Routes,null,routeTree()))));
    assert.equal(document.querySelector('output').textContent,entry.target,entry.path);
    assert.ok(document.body.textContent.includes(entry.text),entry.text);
    await act(async()=>root.unmount());checks++;
}
// Render the actual dashboard, experiment list and layout with inert service
// boundaries. No credentials, network calls or database writes are involved.
const previewAuth={session:{},user:{id:'fixture-user',email:'fixture@example.test'},profile:{name:'Fixture',is_subscribed:true,unlocked_tools:[]},freeTools:[],freeToolsData:{},isAdmin:true,loading:false};
function loadUi(path){
    const exports={};
    const require=name=>{
        if(name==='react')return React;
        if(name==='react-router'||name==='react-router-dom')return Router;
        if(name==='lucide-react')return Icons;
        if(name==='motion/react')return Motion;
        if(name.endsWith('/types'))return {ToolId};
        if(name.endsWith('/contexts/AuthContext'))return {useAuth:()=>previewAuth,withRetry:fn=>fn()};
        if(name.endsWith('/contexts/SettingsContext'))return {useSettings:()=>({isHardwareAccelerated:false,setHardwareAccelerated:()=>{}})};
        if(name.endsWith('/supabaseClient'))return {supabase:{}};
        return {default:()=>null,__esModule:true};
    };
    const compiled=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    new Function('exports','require',compiled)(exports,require);
    return exports.default;
}
const ui=path=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(loadUi(path))));
const dashboard=ui('pages/Dashboard.tsx'), experimental=ui('pages/Experimental.tsx'), layout=ui('components/Layout.tsx');
assert.ok(dashboard.includes('Formula Studio Pro'));
assert.ok(!dashboard.includes('Highlights Gen'));
assert.ok(!experimental.includes('Formula Studio Pro'));
assert.ok(!layout.includes('keeper-header-toggle-btn'));
assert.ok(!layout.includes('Open Keeper'));
console.log(`PASS dashboard/experimental/header rendering, registry compatibility and ${checks} actual route/access-control flows.`);
dom.window.close();
