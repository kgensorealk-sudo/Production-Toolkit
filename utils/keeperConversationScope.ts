export function keeperArtifactScope(artifacts: {id:string}[]) {
  return JSON.stringify(artifacts.map(a=>a.id).sort());
}
export function keeperSameSources(previous:readonly {id:string;kind:string;name:string;content:string}[]|null,current:readonly {id:string;kind:string;name:string;content:string}[]){
  if(!previous||previous.length!==current.length)return false;
  return current.every(source=>previous.some(old=>old.id===source.id&&old.kind===source.kind&&old.name===source.name&&old.content===source.content));
}
export function keeperRetainSourceIds<T extends {id:string;kind:string;name:string;content:string}>(previous:readonly T[],current:readonly T[]):T[]{
  return current.map(source=>{
    const old=previous.find(item=>item.kind===source.kind&&item.name===source.name&&item.content===source.content);
    return old?{...source,id:old.id}:source;
  });
}
export function keeperScopedMessages<T extends {artifactScope?:string}>(messages:T[],scope:string) {
  // Legacy messages lack source identity; never treat them as evidence for new uploads.
  return messages.filter(message=>message.artifactScope===scope);
}
export interface KeeperPastedArtifact {id:string;name:string;kind:'xml';content:string}
export function keeperPastedXmlArtifact(previous:KeeperPastedArtifact|null,content:string,newId:()=>string=()=>crypto.randomUUID()):KeeperPastedArtifact {
  return previous?.content===content ? previous : {id:newId(),name:'Pasted XML',kind:'xml',content};
}
