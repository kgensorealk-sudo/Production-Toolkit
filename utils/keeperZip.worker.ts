import {unpackKeeperZip} from './keeperLocalZip';
self.onmessage=async event=>{
  try{self.postMessage({result:await unpackKeeperZip(event.data)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:'ZIP inspection failed.'});}
};
