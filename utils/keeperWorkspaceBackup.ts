import type {KeeperArtifact} from './keeperEvidenceCore';
import {validateKeeperLocalSources} from './keeperLocalLimits';
import {keeperArtifactScope} from './keeperConversationScope';
/** Imported chat is historical text, never trusted execution or approval evidence. */
export function parseKeeperWorkspaceBackup(text:string){
 if(new TextEncoder().encode(text).length>12_000_000)throw new Error('Backup exceeds 12 MB.');
 const value=JSON.parse(text);
 if(value?.version!==2||!Array.isArray(value.artifacts)||!Array.isArray(value.messages))throw new Error('Choose a Keeper version-2 workspace backup.');
 const string=(s:unknown,max:number)=>{if(typeof s!=='string'||s.length>max)throw new Error('Backup contains invalid text fields.');return s;};
 if(value.artifacts.length>2||value.messages.length>1000)throw new Error('Backup has too many files or messages.');
 const artifacts:KeeperArtifact[]=value.artifacts.map((a:any)=>{if(!a||!['xml','pdf'].includes(a.kind))throw new Error('Backup contains an unsupported file.');return {id:crypto.randomUUID(),name:string(a.name,200),kind:a.kind,content:string(a.content,6_000_000)};});
 validateKeeperLocalSources(artifacts);
 const messages=value.messages.map((m:any,index:number)=>{if(!m||!['user','assistant'].includes(m.role))throw new Error('Backup contains an invalid message.');return {id:`imported-${index}`,role:m.role,content:string(m.content,4_000_000),timestamp:0,artifactScope:'imported-history',modelUsed:'Imported conversation · unverified history'};});
 return {version:2,artifacts,messages,inputPrompt:string(value.inputPrompt,4_000_000),taskInstructions:string(value.taskInstructions,20_000),activeScope:keeperArtifactScope(artifacts)};
}
