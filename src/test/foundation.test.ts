import { describe,expect,it } from 'vitest';
const url=process.env['SUPABASE_URL'],key=process.env['SUPABASE_SERVICE_ROLE_KEY'];
describe.skipIf(!url||!key)('Read-only foundation checks',()=>{
 it('retains the original history and contains no automated strategy-test entries',async()=>{
  if(!url||!key) throw new Error('Cloud unavailable');
  const headers=new Headers({apikey:key});if(!key.startsWith('sb_'))headers.set('Authorization',`Bearer ${key}`);
  const [versions,annotations]=await Promise.all(['strategy_versions','annotations'].map(async(table)=>{
   const r=await fetch(`${url}/rest/v1/${table}?select=*`,{headers});expect(r.status).toBe(200);return r.json();
  }));
  expect(versions.some((v:{version_no:number})=>v.version_no===1)).toBe(true);
  expect(annotations.some((a:{date:string;label:string})=>a.date==='2026-10-12'&&a.label==='Profile relaunch (headline, About, Featured, banner, Experience)')).toBe(true);
  expect(versions.some((v:{change_note:string|null})=>v.change_note==='Unsaved check')).toBe(false);
  expect(annotations.some((a:{label:string})=>a.label==='Unsaved event')).toBe(false);
 });
});
