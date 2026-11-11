// End-to-end test against a running server: node test.js  (server needs STAFF_EMAIL=test@example.com, STAFF_PASSCODE=demo123)
const B=process.env.BASE||'http://localhost:3000',SE=process.env.STAFF_EMAIL||'test@example.com';let fail=0;
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
const J=async(u,o={})=>{const r=await fetch(B+u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});return{s:r.status,j:await r.json().catch(()=>({}))}};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async()=>{
 const mk=async(sc,idem)=>{const a=await J('/api/assess',{method:'POST',body:JSON.stringify({productId:'DEMO-001',images:[png,png],location:'Front',scenario:sc})});return a};
 const h=await mk('hole'),z=await mk('zipper'),b=await mk('button'),u=await mk('unclear');
 ok(h.j.a.type==='hole'&&z.j.a.type==='zipper'&&b.j.a.type==='button','different scenarios give different results');
 ok(u.j.a.confidence==='Low'&&u.j.a.repairability!=='Likely Repairable','unclear photo -> low confidence, no confident diagnosis');
 ok(h.j.source.startsWith('DEMO'),'demo mode labelled');
 ok((await J('/api/assess',{method:'POST',body:JSON.stringify({productId:'DEMO-001',images:['data:text/html;base64,AAAA','x']})})).s>=400,'rejects non-image');
 const payload={idem:'t-'+Date.now(),name:'Test',email:'cust@example.com',productId:'DEMO-001',images:[png,png],ai:h.j.a,aiSource:h.j.source,method:'Basic stitching',storeId:'ST-A',consent:true};
 ok((await J('/api/cases',{method:'POST',body:JSON.stringify({...payload,consent:false})})).s===400,'consent required');
 const c1=await J('/api/cases',{method:'POST',body:JSON.stringify(payload)}),c2=await J('/api/cases',{method:'POST',body:JSON.stringify(payload)});
 ok(c1.s===201&&/^RU-\d{8}-\d{4}$/.test(c1.j.ref),'case created '+c1.j.ref);ok(c2.j.duplicate&&c2.j.ref===c1.j.ref,'duplicate submission blocked');
 ok((await J('/api/staff/cases')).s===401,'staff API needs auth');ok((await J('/api/staff/login',{method:'POST',body:JSON.stringify({email:'x@y.com',passcode:'demo123'})})).s===401,'wrong email rejected');
 const L=await J('/api/staff/login',{method:'POST',body:JSON.stringify({email:SE,passcode:process.env.STAFF_PASSCODE||'demo123'})});const H={Authorization:'Bearer '+L.j.token};
 const list=await J('/api/staff/cases',{headers:H}),id=list.j[0].id,det=await J('/api/staff/cases/'+id,{headers:H});
 const ph=await fetch(det.j.photoLinks[0].url);ok(ph.status===200,'signed photo link works');ok((await fetch(B+'/photo/'+id+'/0')).status===403,'unsigned photo blocked');
 ok((await J(`/api/staff/cases/${id}/decide`,{method:'POST',headers:H,body:JSON.stringify({decision:'APPROVED'})})).s===400,'approval needs fields');
 ok((await J(`/api/staff/cases/${id}/decide`,{method:'POST',headers:H,body:JSON.stringify({decision:'REJECTED'})})).s===400,'rejection needs reason');
 const d=await J(`/api/staff/cases/${id}/decide`,{method:'POST',headers:H,body:JSON.stringify({decision:'APPROVED',method:'Basic stitching',price:80000,eta:'3 working days',storeId:'ST-A'})});
 ok(d.j.status==='CUSTOMER_NOTIFIED'&&/SIMULATED|SENT/.test(d.j.emailStatus),'approved -> customer email: '+d.j.emailStatus);
 ok((await J(`/api/staff/cases/${id}/decide`,{method:'POST',headers:H,body:JSON.stringify({decision:'APPROVED',method:'x',price:1,eta:'1',storeId:'ST-A'})})).s===409,'no duplicate customer email');
 const t=await J('/api/track?t='+c1.j.token);ok(t.j.decision&&t.j.decision.price===80000,'tracking shows confirmed price');
 const o=await J('/api/staff/outbox',{headers:H});ok(o.j.some(e=>e.type==='STAFF_NEW_REQUEST')&&o.j.some(e=>e.type==='CUSTOMER_DECISION'),'both emails logged');
 console.log(fail?fail+' FAILED':'ALL PASSED');process.exit(fail?1:0)})();
