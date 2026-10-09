import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {localTaskRecords,removeKeeperLocalTask,KeeperWorkspaceWriter,KeeperWorkspaceConflict,readKeeperTaskWorkspace,keeperSelectedTask} from '../utils/keeperLocalStore.ts';
for(const status of ['Needs attention','Ready','Preparation pending']){
  const id=`remove-${status}`;
  const task={id,name:'CEJ_182103.zip',zip:new Blob(['zip']),status,artifacts:[],issues:['Missing XML']};
  await localTaskRecords('owner',task);
  await localTaskRecords('other',task);
  const writer=new KeeperWorkspaceWriter('owner',id);
  await writer.save({messages:['private conversation'],artifacts:['private XML']});
  await keeperSelectedTask('owner',id);
  await removeKeeperLocalTask('owner',id);
  assert.equal((await localTaskRecords('owner')).some(row=>row.id===id),false);
  assert.equal(await readKeeperTaskWorkspace('owner',id),undefined);
  assert.equal(await keeperSelectedTask('owner'),'scratch');
  assert.equal((await localTaskRecords('other')).some(row=>row.id===id),true);
  await assert.rejects(writer.save({messages:['late save']}),KeeperWorkspaceConflict);
  await localTaskRecords('owner',{...task,status:'Ready'});
  assert.equal((await localTaskRecords('owner')).some(row=>row.id===id),false,'late worker cannot restore removed task');
  await removeKeeperLocalTask('owner',id);
  const replacement={...task,id:crypto.randomUUID()};
  await localTaskRecords('owner',replacement);
  assert.equal((await localTaskRecords('owner')).some(row=>row.id===replacement.id),true,'same ZIP can be imported as a new task');
}
await keeperSelectedTask('owner','keep-selected');
await removeKeeperLocalTask('owner','unselected');
assert.equal(await keeperSelectedTask('owner'),'keep-selected');
await assert.rejects(removeKeeperLocalTask('owner','scratch'));
console.log('PASS removal for all statuses, persisted content cleanup, account isolation, selected-task reset, stale writer/worker protection, and reimport');
