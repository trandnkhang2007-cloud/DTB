// RE.UNIQLO Smart Repair demo prototype (independent, not an official UNIQLO service). Zero dependencies, Node 18+.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
try{fs.readFileSync('.env','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim()})}catch{}
const E=process.env,PORT=E.PORT||3000,STAFF=(E.STAFF_EMAIL||'').toLowerCase(),PASS=E.STAFF_PASSCODE||'demo123',BASE=E.NEXT_PUBLIC_APP_URL||E.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`;
const SECRET=E.APP_SECRET||crypto.randomBytes(16).toString('hex');
const D=E.DATA_DIR||'.';fs.mkdirSync(D+'/data',{recursive:true});fs.mkdirSync(D+'/uploads',{recursive:true});
if(!/localhost|127\.0\.0\.1/.test(BASE)&&PASS==='demo123'){console.error('Refusing to start on a public URL with the default STAFF_PASSCODE. Set a strong STAFF_PASSCODE.');process.exit(1)}
if(!E.APP_SECRET)console.warn('Warning: APP_SECRET not set; signed photo links stop working after each restart.');
const aiLive=()=>E.AI_MODE==='live'&&!!E.ANTHROPIC_API_KEY&&!!E.ANTHROPIC_MODEL;
const mailLive=()=>E.EMAIL_MODE==='live'&&!!E.RESEND_API_KEY&&!!E.RESEND_FROM_EMAIL;
// ---- seed data (DEMO records, not official UNIQLO data) ----
const PRODUCTS=[['DEMO-001','AIRism Cotton T-Shirt','Tops','Cotton blend','Smooth stretch tee'],['DEMO-002','Oxford Shirt','Shirts','Cotton','Button-front shirt'],['DEMO-003','Stretch Denim Jeans','Bottoms','Denim','Slim stretch jeans'],['DEMO-004','Lightweight Down Jacket','Outerwear','Nylon / Down','Packable zip jacket'],['DEMO-005','Knit Crew Neck Sweater','Knitwear','Wool blend','Crew neck knit'],['DEMO-006','Supima Cotton T-Shirt','Tops','Cotton','Crew neck tee'],['DEMO-007','Linen Blend Shirt','Shirts','Linen blend','Relaxed linen shirt'],['DEMO-008','Chino Trousers','Bottoms','Cotton twill','Straight chinos'],['DEMO-009','Selvedge Jeans','Bottoms','Denim','Rigid selvedge denim'],['DEMO-010','Fleece Full-Zip Jacket','Outerwear','Polyester fleece','Zip fleece'],['DEMO-011','Merino V-Neck Sweater','Knitwear','Merino wool','V-neck knit'],['DEMO-012','Cotton Cardigan','Knitwear','Cotton','Button cardigan'],['DEMO-013','Blocktech Parka','Outerwear','Nylon','Zip + snap parka'],['DEMO-014','Flannel Shirt','Shirts','Cotton flannel','Brushed check shirt'],['DEMO-015','Ultra Stretch Trousers','Bottoms','Polyester blend','Zip-fly trousers']].map(p=>({id:p[0],name:p[1],category:p[2],material:p[3],description:p[4],image:'/img/'+p[2].toLowerCase()+'.svg'}));
const STORES=[{id:'ST-A',name:'RE.UNIQLO STUDIO Demo A',address:'1 Demo Street, Dist. 1, HCMC',city:'Ho Chi Minh City',district:'District 1',contact:'+84 28 0000 0001',hours:'10:00–21:00',sup:['Basic stitching','Button replacement','Seam reinforcement'],limits:'No zipper work'},{id:'ST-B',name:'RE.UNIQLO STUDIO Demo B',address:'2 Demo Avenue, Thu Duc, HCMC',city:'Ho Chi Minh City',district:'Thu Duc',contact:'+84 28 0000 0002',hours:'09:30–21:30',sup:['Basic stitching','Button replacement','Seam reinforcement','Zipper inspection','Zipper replacement'],limits:'Down items: 5+ days'},{id:'ST-C',name:'RE.UNIQLO STUDIO Demo C',address:'3 Demo Road, Dist. 7, HCMC',city:'Ho Chi Minh City',district:'District 7',contact:'+84 28 0000 0003',hours:'10:00–22:00',sup:['Basic stitching','Patch repair','Surface treatment'],limits:'Fabric repair only'}];
// Editable pricing rules (fictional demo values). Edit data/pricing.json to change without touching code.
const PRICING=(()=>{try{return JSON.parse(fs.readFileSync('data/pricing.json','utf8'))}catch{}return{
hole:[{m:'Basic stitching',min:50000,max:100000,d:'2–3 working days'},{m:'Patch repair',min:70000,max:130000,d:'3–5 working days'}],
seam:[{m:'Seam reinforcement',min:40000,max:90000,d:'1–3 working days'},{m:'Basic stitching',min:50000,max:100000,d:'2–3 working days'}],
button:[{m:'Button replacement',min:20000,max:50000,d:'1 working day'}],
zipper:[{m:'Zipper inspection',min:0,max:30000,d:'Same day'},{m:'Zipper replacement',min:100000,max:250000,d:'4–7 working days'}],
pilling:[{m:'Surface treatment',min:30000,max:80000,d:'1–2 working days'}],
unclear:[{m:'In-store inspection',min:0,max:0,d:'Same day'}]};})();
const DB_FILE=D+'/data/db.json';let db={cases:[],emails:[],seq:{}};try{db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch{}
const save=()=>fs.writeFileSync(DB_FILE,JSON.stringify(db,null,1));
const ev=(c,t,d)=>{(c.events=c.events||[]).push({t,d,at:new Date().toISOString()})};
// ---- email ----
async function sendMail(c,type,to,subject,html,text){
  const log={id:crypto.randomUUID(),caseId:c.id,type,to,subject,html,text,at:new Date().toISOString()};
  if(!mailLive()){log.status='SIMULATED (EMAIL_MODE=demo — not delivered)'}
  else try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+E.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:E.RESEND_FROM_EMAIL,to:[to],subject,html,text})});const j=await r.json().catch(()=>({}));if(r.ok){log.status='SENT';log.providerId=j.id}else{log.status='FAILED';log.error=j.message||('HTTP '+r.status)}}catch(e){log.status='FAILED';log.error=e.message}
  db.emails.push(log);ev(c,'email',`${type} → ${to}: ${log.status}${log.error?' ('+log.error+')':''}`);save();return log;}
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const vnd=n=>new Intl.NumberFormat('en-US').format(n)+' VND';
const wrap=b=>`<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:auto;color:#222"><div style="background:#E60012;color:#fff;padding:16px 24px;font-weight:bold">RE.UNIQLO Smart Repair <small>(demo prototype)</small></div><div style="padding:24px;border:1px solid #eee">${b}</div></div>`;
const photoUrl=(c,i,ttl=7*864e5)=>{const exp=Date.now()+ttl,sig=crypto.createHmac('sha256',SECRET).update(c.id+i+exp).digest('hex').slice(0,32);return `${BASE}/photo/${c.id}/${i}?exp=${exp}&sig=${sig}`};
const store=id=>STORES.find(s=>s.id===id);
const prod=id=>PRODUCTS.find(p=>p.id===id);
function staffMail(c){const p=prod(c.productId),a=c.ai,s=store(c.storeId);
  const links=c.photos.map((x,i)=>`<li><a href="${photoUrl(c,i)}">${esc(x.type)} photo</a></li>`).join('');
  const html=wrap(`<h2>New repair request ${c.ref}</h2><p><b>Customer:</b> ${esc(c.name)} (${esc(c.email)})<br><b>Preferred store:</b> ${esc(s.name)}</p><p><b>Garment:</b> ${esc(p.id)} ${esc(p.name)} — ${esc(p.category)}, ${esc(p.material)}</p><p><b>AI assessment (${esc(c.aiSource)}):</b> ${esc(a.damageType)}, ${esc(a.location)}, severity ${esc(a.severity)}, confidence ${esc(a.confidence)}<br><b>Repairability:</b> ${esc(a.repairability)}<br><b>Recommended:</b> ${esc(a.method)}<br><b>Indicative price:</b> ${vnd(c.min)} – ${vnd(c.max)}</p><p><b>Customer selected:</b> ${esc(c.method)} at ${esc(s.name)}</p><p>Photos (links expire in 7 days):</p><ul>${links}</ul><p><a href="${BASE}/staff.html?case=${c.id}" style="background:#E60012;color:#fff;padding:10px 16px;text-decoration:none">Open Staff Review Dashboard</a></p>`);
  return[`[RE.UNIQLO] New Repair Request – ${c.ref}`,html,`New repair request ${c.ref}\nCustomer: ${c.name} <${c.email}>\nGarment: ${p.name}\nDamage: ${a.damageType} (${a.severity}, ${a.confidence})\nRepairability: ${a.repairability}\nSelected: ${c.method} @ ${s.name}\nReview: ${BASE}/staff.html?case=${c.id}`]}
function custMail(c){const d=c.decision,s=store(d.storeId||c.storeId),p=prod(c.productId),link=`${BASE}/track.html?t=${c.token}`;let subj,body;
  const store_=`<p><b>${esc(s.name)}</b><br>${esc(s.address)}<br>${esc(s.contact)} · ${esc(s.hours)}</p>`;
  if(d.decision==='APPROVED'){subj=`[RE.UNIQLO] Your Repair Request Has Been Confirmed – ${c.ref}`;body=`<p>Dear ${esc(c.name)},</p><p>Good news! Your garment repair request has been reviewed by our RE.UNIQLO team.</p><p><b>Reference ID:</b> ${c.ref}<br><b>Product:</b> ${esc(p.name)}<br><b>Confirmed repair:</b> ${esc(d.method)}<br><b>Final price:</b> ${vnd(d.price)}<br><b>Estimated completion:</b> ${esc(d.eta)}</p>${store_}<p><b>Next step:</b> bring your garment and your Reference ID to the store above. Staff may do a final physical inspection; any change to scope or price will be discussed with you before work begins.</p>${d.notes?`<p>Note from staff: ${esc(d.notes)}</p>`:''}`}
  else if(d.decision==='INSPECTION'){subj=`[RE.UNIQLO] Physical Inspection Needed – ${c.ref}`;body=`<p>Dear ${esc(c.name)},</p><p>Your photos were not enough for us to confirm repairability or a final price, so we need to inspect the garment in person. This is <b>not</b> yet an approval.</p>${store_}<p>Please bring the garment, any care label, and your Reference ID <b>${c.ref}</b>.</p><p>${esc(d.notes)}</p>`}
  else{subj=`[RE.UNIQLO] Update on Your Repair Request – ${c.ref}`;body=`<p>Dear ${esc(c.name)},</p><p>After review, we are unable to proceed with this repair (Ref ${c.ref}).</p><p><b>Reason:</b> ${esc(d.notes)}</p><p>Alternatives: bring the garment to a store for a second opinion, or ask about our clothing-reuse programs. Questions? ${esc(s.contact)}.</p>`}
  const html=wrap(body+`<p><a href="${link}">Track your request</a></p>`);return[subj,html,body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')+`\nTrack: ${link}`]}
// ---- AI assessment ----
const DEMO={hole:['Small hole','Low','Likely Repairable','High'],seam:['Loose / open seam','Low','Likely Repairable','Medium'],button:['Missing button','Low','Likely Repairable','High'],zipper:['Broken zipper','Medium','Requires In-Store Inspection','Medium'],pilling:['Fabric pilling','Low','Likely Repairable','Medium'],unclear:['Unclear — photo insufficient','Unknown','Requires In-Store Inspection','Low']};
const ruleFor=(t,m)=>{const r=PRICING[t]||PRICING.unclear;return r.find(x=>x.m===m)||r[0]};
async function assess(p,imgs,loc,note,scenario){
  const mk=(t,src,extra={})=>{const d=DEMO[t]||DEMO.unclear;return{damageType:d[0],type:t,location:loc||'Unspecified',material:p.material,severity:d[1],evidence:t==='unclear'?'Image too blurry/insufficient':'Demo scenario (no image analysis)',method:PRICING[t][0].m,alt:(PRICING[t][1]||{}).m||null,repairability:d[2],confidence:d[3],inspectionNeeded:d[2]!=='Likely Repairable',uncertainty:'Hidden damage cannot be judged from photos.',...extra}};
  if(!aiLive())return{source:'DEMO — AI Vision Not Connected (deterministic demo scenario, photos not analysed)',a:mk(PRICING[scenario]?scenario:'unclear')};
  const content=[...imgs.map(i=>({type:'image',source:{type:'base64',media_type:i.mime,data:i.b64}})),{type:'text',text:`Garment: ${p.name}, ${p.category}, material ${p.material}. Customer location hint: ${loc}. Note: ${note||'none'}.\nImages: full garment, close-up of damage, optional care label. Assess ONLY visible damage. Reply with JSON only: {"type":"hole|seam|button|zipper|pilling|unclear","damageType":str,"location":str,"material":str,"severity":"Low|Medium|High|Unknown","evidence":str,"method":str,"alt":str|null,"repairability":"Likely Repairable|Requires In-Store Inspection|Potentially Not Repairable","confidence":"High|Medium|Low","inspectionNeeded":bool,"uncertainty":str}. If blurry or ambiguous use type "unclear", low confidence, and ask for better photos. Never claim hidden damage.`}];
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':E.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:E.ANTHROPIC_MODEL,max_tokens:900,system:'You are a garment repair triage assistant. Output valid JSON only.',messages:[{role:'user',content}]})});
  const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Anthropic API error');
  const txt=(j.content||[]).map(x=>x.text||'').join(''),a=JSON.parse(txt.slice(txt.indexOf('{'),txt.lastIndexOf('}')+1));
  if(!PRICING[a.type])a.type='unclear';
  if(!['Likely Repairable','Requires In-Store Inspection','Potentially Not Repairable'].includes(a.repairability)||!['High','Medium','Low'].includes(a.confidence))throw new Error('Invalid AI output');
  if(a.confidence==='Low'&&a.repairability==='Likely Repairable')a.repairability='Requires In-Store Inspection';
  return{source:'LIVE — Claude Vision ('+E.ANTHROPIC_MODEL+')',a};}
// ---- http helpers ----
const hits=new Map();const limited=ip=>{const n=Date.now(),a=(hits.get(ip)||[]).filter(t=>n-t<6e4);a.push(n);hits.set(ip,a);return a.length>40};
const sessions=new Map(),lh=new Map();
const body=req=>new Promise((res,rej)=>{let b='',n=0;req.on('data',d=>{n+=d.length;if(n>30e6){rej(new Error('Payload too large'));req.destroy()}else b+=d});req.on('end',()=>{try{res(b?JSON.parse(b):{})}catch{rej(new Error('Bad JSON'))}})});
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))};
const authed=req=>{const t=(req.headers.authorization||'').replace('Bearer ','');const s=sessions.get(t);return s&&s.exp>Date.now()?s.email:null};
const pub=c=>({ref:c.ref,status:c.status,product:prod(c.productId)?.name,method:c.method,min:c.min,max:c.max,store:store(c.storeId)?.name,decision:c.decision&&{decision:c.decision.decision,method:c.decision.method,price:c.decision.price,eta:c.decision.eta,notes:c.decision.notes,store:store(c.decision.storeId)},createdAt:c.createdAt});
const MIME={'.html':'text/html','.svg':'image/svg+xml','.css':'text/css','.js':'text/javascript'};
const OKMIME=['image/jpeg','image/png','image/webp'];
http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,BASE),p=u.pathname,ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').pop().trim();
  if(p==='/healthz'){res.writeHead(200);return res.end('ok')}
  if(p.startsWith('/api/')&&limited(ip))return send(res,429,{error:'Too many requests'});
  if(p==='/api/config')return send(res,200,{aiMode:aiLive()?'live':'demo',emailMode:mailLive()?'live':'demo',staffConfigured:!!STAFF,missing:[!aiLive()&&'Anthropic (AI_MODE/ANTHROPIC_API_KEY/ANTHROPIC_MODEL)',!mailLive()&&'Resend (EMAIL_MODE/RESEND_API_KEY/RESEND_FROM_EMAIL)',!STAFF&&'STAFF_EMAIL'].filter(Boolean)});
  if(p==='/api/products')return send(res,200,PRODUCTS);
  if(p==='/api/stores'){const m=u.searchParams.get('method'),q=(u.searchParams.get('city')||'').toLowerCase();return send(res,200,STORES.map(s=>({...s,compatible:!m||s.sup.includes(m),near:!!q&&(s.district+s.city).toLowerCase().includes(q)})).sort((a,b)=>(b.compatible-a.compatible)||(b.near-a.near)))}
  if(p==='/api/assess'&&req.method==='POST'){const b=await body(req),pr=prod(b.productId);if(!pr)return send(res,400,{error:'Unknown product'});
    const imgs=(b.images||[]).slice(0,3).map(i=>{const m=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(i||'');if(!m)throw new Error('Only JPG, PNG or WEBP images allowed');if(m[2].length>7e6)throw new Error('Image over 5 MB');return{mime:m[1],b64:m[2]}});
    if(imgs.length<2)return send(res,400,{error:'Upload the full garment and a close-up photo'});
    let r;try{r=await assess(pr,imgs,b.location,String(b.note||'').slice(0,500),b.scenario)}catch(e){return send(res,502,{error:'AI assessment failed: '+e.message})}
    const opts=PRICING[r.a.type].map(o=>({method:o.m,min:o.min,max:o.max,turnaround:o.d}));return send(res,200,{...r,options:opts})}
  if(p==='/api/cases'&&req.method==='POST'){const b=await body(req),pr=prod(b.productId);
    if(!b.consent)return send(res,400,{error:'Consent is required'});
    if(!pr||!b.name||!/^\S+@\S+\.\S+$/.test(b.email||'')||!store(b.storeId)||!b.ai||!b.method)return send(res,400,{error:'Missing or invalid fields'});
    const dup=db.cases.find(c=>c.idem===b.idem);if(dup)return send(res,200,{ref:dup.ref,token:dup.token,duplicate:true,emailStatus:'(already submitted)'});
    const d=new Date().toISOString().slice(0,10).replace(/-/g,'');db.seq[d]=(db.seq[d]||0)+1;
    const id=crypto.randomUUID(),rule=ruleFor(b.ai.type,b.method);
    const c={id,ref:`RU-${d}-${String(db.seq[d]).padStart(4,'0')}`,token:crypto.randomBytes(16).toString('hex'),idem:b.idem,name:String(b.name).slice(0,100),email:b.email,productId:pr.id,ai:b.ai,aiSource:String(b.aiSource||'').slice(0,200),method:b.method,min:rule.min,max:rule.max,storeId:b.storeId,status:'SUBMITTED_TO_STAFF',consent:true,photos:[],createdAt:new Date().toISOString(),events:[]};
    (b.images||[]).slice(0,3).forEach((im,i)=>{const m=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(im||'');if(!m)return;const f=`${id}-${i}.${m[1].split('/')[1]}`;fs.writeFileSync(D+'/uploads/'+f,Buffer.from(m[2],'base64'));c.photos.push({file:f,mime:m[1],type:['Full garment','Close-up damage','Care label'][i]})});
    ev(c,'submitted','Customer submitted case');db.cases.push(c);save();
    const [s,h,t]=staffMail(c);const log=await sendMail(c,'STAFF_NEW_REQUEST',STAFF||'(STAFF_EMAIL not set)',s,h,t);
    return send(res,201,{ref:c.ref,token:c.token,emailStatus:log.status,emailError:log.error||null})}
  if(p==='/api/track'){const c=db.cases.find(x=>x.token===u.searchParams.get('t'));return c?send(res,200,pub(c)):send(res,404,{error:'Not found'})}
  if(p.startsWith('/photo/')){const[,,id,i]=p.split('/'),c=db.cases.find(x=>x.id===id),ph=c&&c.photos[+i],exp=+u.searchParams.get('exp');
    const sig=c&&crypto.createHmac('sha256',SECRET).update(id+i+exp).digest('hex').slice(0,32);
    if(!ph||exp<Date.now()||sig!==u.searchParams.get('sig'))return send(res,403,{error:'Link invalid or expired'});
    res.writeHead(200,{'Content-Type':ph.mime,'Cache-Control':'private'});return res.end(fs.readFileSync(D+'/uploads/'+ph.file))}
  if(p==='/api/staff/login'&&req.method==='POST'){const b=await body(req);
    {const n=Date.now(),a=(lh.get(ip)||[]).filter(t=>n-t<6e4);a.push(n);lh.set(ip,a);if(a.length>6)return send(res,429,{error:'Too many login attempts. Wait a minute.'})}
    if(!STAFF)return send(res,503,{error:'STAFF_EMAIL is not configured'});
    if(String(b.email||'').toLowerCase()!==STAFF||b.passcode!==PASS)return send(res,401,{error:'Not authorised'});
    const t=crypto.randomBytes(24).toString('hex');sessions.set(t,{email:STAFF,exp:Date.now()+36e5*8});return send(res,200,{token:t,email:STAFF,mode:'LOCAL DEMO AUTH (passcode) — use Supabase magic link in production'})}
  if(p.startsWith('/api/staff/')){const me=authed(req);if(!me)return send(res,401,{error:'Staff login required'});
    const full=c=>({...c,product:prod(c.productId),storeName:store(c.storeId)?.name,photoLinks:c.photos.map((x,i)=>({type:x.type,url:photoUrl(c,i,6e5)})),emails:db.emails.filter(e=>e.caseId===c.id).map(e=>({type:e.type,to:e.to,status:e.status,error:e.error,at:e.at}))});
    if(p==='/api/staff/cases')return send(res,200,db.cases.slice().reverse().map(c=>({id:c.id,ref:c.ref,name:c.name,product:prod(c.productId).name,damage:c.ai.damageType,repairability:c.ai.repairability,status:c.status,decision:c.decision?.decision||null,createdAt:c.createdAt})));
    if(p==='/api/staff/outbox')return send(res,200,db.emails.slice().reverse().map(({html,...e})=>e));
    const m=/^\/api\/staff\/cases\/([^/]+)(\/(decide|resend|open))?$/.exec(p);const c=m&&db.cases.find(x=>x.id===m[1]);if(!c)return send(res,404,{error:'Case not found'});
    if(!m[3]){if(c.status==='SUBMITTED_TO_STAFF'){c.status='UNDER_STAFF_REVIEW';ev(c,'review','Opened by '+me);save()}return send(res,200,full(c))}
    if(m[3]==='resend'){if(!c.decision)return send(res,400,{error:'No decision yet'});const[s,h,t]=custMail(c),l=await sendMail(c,'CUSTOMER_DECISION_RETRY',c.email,s,h,t);return send(res,200,{emailStatus:l.status,emailError:l.error||null})}
    if(m[3]==='open'){const[s,h,t]=staffMail(c),l=await sendMail(c,'STAFF_NEW_REQUEST_RETRY',STAFF,s,h,t);return send(res,200,{emailStatus:l.status,emailError:l.error||null})}
    const b=await body(req),dec=b.decision;if(!['APPROVED','INSPECTION','REJECTED'].includes(dec))return send(res,400,{error:'Choose a decision'});
    if(c.decision&&c.status==='CUSTOMER_NOTIFIED')return send(res,409,{error:'Customer already notified for this case. Use resend if delivery failed.'});
    const d={decision:dec,method:String(b.method||''),price:Math.round(+b.price||0),eta:String(b.eta||''),storeId:b.storeId||c.storeId,notes:String(b.notes||'').slice(0,1000),staff:me,at:new Date().toISOString()};
    if(!store(d.storeId))return send(res,400,{error:'Select a store'});
    if(dec==='APPROVED'&&(!d.method||!(d.price>0)||!d.eta))return send(res,400,{error:'Approval needs method, price (>0), and estimated completion'});
    if((dec==='REJECTED'||dec==='INSPECTION')&&!d.notes)return send(res,400,{error:dec==='REJECTED'?'A rejection reason is required':'Inspection instructions are required'});
    c.decision=d;c.status={APPROVED:'APPROVED',INSPECTION:'INSPECTION_REQUIRED',REJECTED:'REJECTED'}[dec];ev(c,'decision',dec+' by '+me);save();
    const[s,h,t]=custMail(c),l=await sendMail(c,'CUSTOMER_DECISION',c.email,s,h,t);
    if(l.status==='SENT'||l.status.startsWith('SIMULATED')){c.status='CUSTOMER_NOTIFIED';save()}
    return send(res,200,{status:c.status,emailStatus:l.status,emailError:l.error||null})}
  // static
  let f=path.join('public',p==='/'?'index.html':p);if(!f.startsWith('public')||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,{error:'Not found'});
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));
}catch(e){send(res,e.message.startsWith('Only')||e.message.includes('5 MB')?400:500,{error:e.message})}}).listen(PORT,()=>console.log(`RE.UNIQLO Smart Repair on ${BASE}  AI:${aiLive()?'LIVE':'DEMO'} EMAIL:${mailLive()?'LIVE':'DEMO'} STAFF:${STAFF||'NOT SET'}`));
