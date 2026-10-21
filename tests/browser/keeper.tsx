import React from 'react';
import {createRoot} from 'react-dom/client';
import Keeper from '../../pages/Keeper';
import '../../index.css';
const actualFetch=window.fetch;
window.fetch=(input,init)=>String(input).startsWith('/api/')?Promise.resolve(Response.json({error:'Synthetic provider unavailable. Retry after checking settings.',code:'AI_UNAVAILABLE'},{status:503})):actualFetch(input,init);
createRoot(document.getElementById('root')!).render(<Keeper/>);
