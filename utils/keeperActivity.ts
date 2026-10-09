export interface KeeperActivity {
  serverElapsedMs?:number;
  clientElapsedMs?:number;
  localInspectionMs?:number;
  requestMs?:number;
  attempts?:{model:string;provider:string;elapsedMs:number;outcome:string;failure?:string}[];
  events?:{kind:'model_round'|'tool';name?:string;model?:string;round?:number;elapsedMs:number;outcome:string;records?:number}[];
}
