import React from 'react';
import KeeperSandbox from '../components/KeeperSandbox';
import KeeperEvaluationDashboard from '../components/KeeperEvaluationDashboard';
import {useAuth} from '../contexts/AuthContext';

export default function Keeper(){
 const {user}=useAuth();
 return <section id="keeper-evaluation-panel" aria-label="Keeper production workspace"><KeeperEvaluationDashboard ownerIdentity={user?.id || 'signed-out'} operator advancedWorkspace={<KeeperSandbox />} /></section>;
}
