
const SUPABASE_URL='https://fcftkhcvsgifdpwterlz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_5M0htEiXcAaMxn824eW52g_hfsfSvcm';
let sb=null,cloudUser=null,cloudLibraryId=null,cloudLastRevision=0,cloudSaveTimer=null,cloudPollTimer=null,cloudApplying=false,cloudReady=false,cloudUploadQueue=new Map();
const CLOUD_POLL_MS=10000;

const DEFAULT_COURSES=[
 {id:'vestibuler',name:'Vestibüler',topics:['BPPV','Ménière Hastalığı','Vestibüler Migren','VEMP','vHIT','Kalorik Test','Postürografi','Vestibüler Rehabilitasyon','Santral Vestibüler Bozukluklar','Pediatrik Vestibüler Sistem']},
 {id:'isitme-cihazlari',name:'İşitme Cihazları',topics:['Doğrulama','REM','Fitting','Yönlülük','Gürültü Azaltma']},
 {id:'koklear-implant',name:'Koklear İmplant',topics:['Adaylık','Programlama','Konuşma Algısı','Pediatrik CI']},
 {id:'pediatrik',name:'Pediatrik Odyoloji',topics:['Yenidoğan Tarama','Davranışsal Testler','Erken Müdahale']},
 {id:'elektrofizyoloji',name:'Elektrofizyoloji',topics:['ABR','ASSR','OAE','ECochG']},
 {id:'psikoakustik',name:'Psikoakustik',topics:['Frekans Seçiciliği','Loudness','Temporal İşleme']}
];
let state={courses:[],articles:[],view:'home',courseId:null,topic:null,currentArticleId:null,articleTab:'summary',indexCache:{},settings:{}};
const $=s=>document.querySelector(s), content=$('#content');

async function db(){return await new Promise((resolve,reject)=>{const r=indexedDB.open('audiologyLibrary',2);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('files'))d.createObjectStore('files');if(!d.objectStoreNames.contains('textIndex'))d.createObjectStore('textIndex')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}

async function localPutFile(id,file){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('files','readwrite');t.objectStore('files').put(file,id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function localGetFile(id){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('files','readonly');const r=t.objectStore('files').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function localDeleteFile(id){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('files','readwrite');t.objectStore('files').delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function cloudFilePath(id){return cloudLibraryId?`${cloudLibraryId}/objects/${encodeURIComponent(id)}`:null}
async function uploadFileToCloud(id,file){
 if(!sb||!cloudReady||!cloudLibraryId||!file)return false;
 const path=cloudFilePath(id);
 try{
  setCloudStatus('syncing','Dosya yükleniyor…');
  const {error}=await sb.storage.from('library-files').upload(path,file,{upsert:true,contentType:file.type||'application/octet-stream'});
  if(error)throw error;
  setCloudStatus('saved','Buluta kaydedildi ✓');
  return true;
 }catch(e){console.warn('Cloud file upload',e);setCloudStatus('pending','Senkronizasyon bekliyor');return false}
}
async function putFile(id,file){
 await localPutFile(id,file);
 if(cloudReady){cloudUploadQueue.set(id,file);flushCloudFileQueue()}
}
async function getFile(id){
 const local=await localGetFile(id);if(local)return local;
 if(sb&&cloudReady&&cloudLibraryId){
  try{const {data,error}=await sb.storage.from('library-files').download(cloudFilePath(id));if(error)throw error;if(data){await localPutFile(id,data);return data}}catch(e){console.warn('Cloud file download',e)}
 }
 return null
}
async function deleteFile(id){
 await localDeleteFile(id);
 if(sb&&cloudReady&&cloudLibraryId){try{await sb.storage.from('library-files').remove([cloudFilePath(id)])}catch(e){console.warn(e)}}
}
async function flushCloudFileQueue(){
 if(!cloudReady||!navigator.onLine)return;
 for(const [id,file] of [...cloudUploadQueue.entries()]){if(await uploadFileToCloud(id,file))cloudUploadQueue.delete(id)}
}
async function migrateKnownLocalFiles(){
 if(!cloudReady)return;
 const keys=new Set();
 for(const a of state.articles){if(a.pdfKey)keys.add(a.pdfKey);if(a.summaryPdfKey)keys.add(a.summaryPdfKey);for(const r of (a.inkNoteRefs||[])){if(r.key)keys.add(r.key)}}
 for(const key of keys){const f=await localGetFile(key);if(f)cloudUploadQueue.set(key,f)}
 flushCloudFileQueue();
}
async function putIndex(id,pages){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('textIndex','readwrite');t.objectStore('textIndex').put(pages||[],id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function getIndex(id){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('textIndex','readonly');const r=t.objectStore('textIndex').get(id);r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function deleteIndex(id){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('textIndex','readwrite');t.objectStore('textIndex').delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function articlePages(a){return state.indexCache?.[a.id]||a.pageTexts||[]}
function cleanLegacyAutoNoteText(text=''){return String(text)
 .replace(/(?:^|\n\n?)\[(?:El Yazısı Notu|Kenar Notu|Alıntı)\s*·[^\]]+\]\n?/g,'\n\n')
 .replace(/(?:^|\n\n?)PDF üzerindeki el yazısı\/anotasyon bu makaleye iliştirildi\.?/g,'')
 .replace(/\n{3,}/g,'\n\n').trim()}

function normalizeLoadedState(saved){
 state.courses=saved?.courses||DEFAULT_COURSES;
 state.articles=saved?.articles||[];
 state.settings=saved?.settings||{};
 let changed=false;
 state.articles.forEach(a=>{const cleaned=cleanLegacyAutoNoteText(a.summary||'');if(cleaned!==(a.summary||'')){a.summary=cleaned;changed=true}a.smartNotes=a.smartNotes||[];a.pageTexts=a.pageTexts||[];a.aiSummary=a.aiSummary||null;a.thesis=!!(a.thesis||a.favorite);a.readStatus=a.readStatus||'unread';a.thesisSection=a.thesisSection||'';a.research=a.research||{aim:'',sample:'',method:'',tests:'',finding:'',limits:'',relevance:''};});
 return changed;
}
function load(){
 const saved=JSON.parse(localStorage.getItem('audiology-state')||'null');
 normalizeLoadedState(saved||{courses:DEFAULT_COURSES,articles:[],settings:{}});
}
function cloudStatePayload(){const articles=state.articles.map(a=>{const {pageTexts,...rest}=a;return rest});return{courses:state.courses,articles,settings:state.settings||{}}}
function save(){
 const payload=cloudStatePayload();
 localStorage.setItem('audiology-state',JSON.stringify(payload));
 if(!cloudApplying)scheduleCloudSave();
}
function scheduleCloudSave(){
 if(!cloudReady||!cloudUser||!cloudLibraryId)return;
 clearTimeout(cloudSaveTimer);
 setCloudStatus('syncing','Kaydediliyor…');
 cloudSaveTimer=setTimeout(()=>pushCloudState(),650);
}
async function pushCloudState(force=false){
 if(!sb||!cloudReady||!cloudUser||!cloudLibraryId)return false;
 if(!navigator.onLine){setCloudStatus('pending','İnternet bekleniyor');return false}
 const revision=Date.now();
 try{
  const {error}=await sb.from('library_state').upsert({library_id:cloudLibraryId,data:cloudStatePayload(),revision,updated_by:cloudUser.id,deleted_at:null},{onConflict:'library_id'});
  if(error)throw error;
  cloudLastRevision=revision;
  setCloudStatus('saved','Buluta kaydedildi ✓');
  return true;
 }catch(e){console.warn('Cloud state save',e);setCloudStatus('pending','Senkronizasyon bekliyor');return false}
}

function setCloudStatus(kind,text){
 const el=document.querySelector('#cloudStatus');if(el){el.className='cloud-status cloud-'+kind;el.textContent='● '+text}
 const a=document.querySelector('#accountSyncState');if(a)a.textContent=text;
}
function showAuthMessage(msg,kind=''){const el=document.querySelector('#authMessage');if(el){el.textContent=msg;el.className='auth-message '+kind}}
function showAuthScreen(show=true){document.body.classList.toggle('cloud-authenticated',!show);const el=document.querySelector('#authScreen');if(el)el.classList.toggle('hidden',!show)}
async function ensureCloudLibrary(){
 const {data:libs,error}=await sb.from('libraries').select('id,name,created_at').order('created_at',{ascending:true}).limit(1);
 if(error)throw error;
 if(libs?.length){cloudLibraryId=libs[0].id;return cloudLibraryId}
 const {data,error:insErr}=await sb.from('libraries').insert({name:'Odyoloji Kütüphanesi',created_by:cloudUser.id}).select('id').single();
 if(insErr)throw insErr;
 cloudLibraryId=data.id;return cloudLibraryId
}
async function pullCloudState({initial=false}={}){
 if(!sb||!cloudLibraryId)return false;
 try{
  const {data,error}=await sb.from('library_state').select('data,revision,updated_at').eq('library_id',cloudLibraryId).maybeSingle();
  if(error)throw error;
  if(!data)return false;
  const remote=data.data||{};
  const remoteHasContent=Array.isArray(remote.articles)&&remote.articles.length>0;
  const localRaw=localStorage.getItem('audiology-state');
  const localHasSaved=!!localRaw;
  const remoteRev=Number(data.revision||0);
  if(initial){
    if(remoteHasContent || !localHasSaved){
      cloudApplying=true;normalizeLoadedState(remote);localStorage.setItem('audiology-state',JSON.stringify(cloudStatePayload()));cloudApplying=false;cloudLastRevision=remoteRev;await hydrateIndexCache();render();
    }else{
      await pushCloudState(true);
    }
  }else if(remoteRev>cloudLastRevision){
    cloudApplying=true;normalizeLoadedState(remote);localStorage.setItem('audiology-state',JSON.stringify(cloudStatePayload()));cloudApplying=false;cloudLastRevision=remoteRev;await hydrateIndexCache();render();setCloudStatus('saved','Güncel ✓');
  }
  return true;
 }catch(e){console.warn('Cloud pull',e);setCloudStatus('pending','Buluta ulaşılamıyor');return false}
}
async function startCloudSession(session){
 cloudUser=session?.user||null;
 if(!cloudUser){cloudReady=false;showAuthScreen(true);setCloudStatus('offline','Giriş gerekli');return}
 showAuthScreen(false);setCloudStatus('syncing','Bulut hazırlanıyor…');
 try{
  await ensureCloudLibrary();
  cloudReady=true;
  await pullCloudState({initial:true});
  setCloudStatus('saved','Buluta bağlı ✓');
  migrateKnownLocalFiles();
  clearInterval(cloudPollTimer);cloudPollTimer=setInterval(()=>pullCloudState(),CLOUD_POLL_MS);
  const email=document.querySelector('#accountEmail');if(email)email.textContent=cloudUser.email||'Bulut hesabı';
 }catch(e){console.error(e);cloudReady=false;setCloudStatus('pending','Bulut kurulumu kontrol edilmeli');toast('Bulut bağlantısı kurulamadı')}
}

const authStorage={
 getItem(key){return localStorage.getItem(key)??sessionStorage.getItem(key)},
 setItem(key,value){
  const remember=localStorage.getItem('audiology-remember-session')!=='false';
  if(remember){localStorage.setItem(key,value);sessionStorage.removeItem(key)}
  else{sessionStorage.setItem(key,value);localStorage.removeItem(key)}
 },
 removeItem(key){localStorage.removeItem(key);sessionStorage.removeItem(key)}
};
async function bootstrapCloud(){
 load();
 await hydrateIndexCache();
 render();
 if(!window.supabase){showAuthScreen(true);showAuthMessage('Bulut kütüphanesi yüklenemedi. İnternet bağlantısını kontrol edin.','error');return}
 sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:authStorage}
 });
 wireCloudUi();
 const {data:{session}}=await sb.auth.getSession();
 if(session)await startCloudSession(session);else showAuthScreen(true);
 sb.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){showAuthScreen(false);setTimeout(()=>document.querySelector('#newPasswordDialog')?.showModal(),100)}
  if(event==='SIGNED_IN'&&session&&!cloudReady)startCloudSession(session);
  if(event==='SIGNED_OUT'){cloudReady=false;cloudUser=null;cloudLibraryId=null;clearInterval(cloudPollTimer);showAuthScreen(true)}
 });
}
function wireCloudUi(){
 const rememberBox=document.querySelector('#rememberSession');if(rememberBox)rememberBox.checked=localStorage.getItem('audiology-remember-session')!=='false';
 const login=document.querySelector('#loginForm');
 if(login)login.addEventListener('submit',async e=>{
  e.preventDefault();showAuthMessage('Giriş yapılıyor…');
  const email=document.querySelector('#loginEmail').value.trim(),password=document.querySelector('#loginPassword').value;
  localStorage.setItem('audiology-remember-session',document.querySelector('#rememberSession')?.checked?'true':'false');
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error){showAuthMessage('Giriş başarısız: '+(error.message||'Bilgileri kontrol edin.'),'error');return}
  showAuthMessage('');
  if(data.session)await startCloudSession(data.session);
 });
 const forgot=document.querySelector('#forgotPasswordBtn');
 if(forgot)forgot.onclick=async()=>{
  const email=document.querySelector('#loginEmail').value.trim();
  if(!email){showAuthMessage('Önce e-posta adresinizi yazın.','error');return}
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:'https://u98cakir.github.io/odyoloji-kutuphanesi/'});
  showAuthMessage(error?'Sıfırlama e-postası gönderilemedi: '+error.message:'Şifre sıfırlama bağlantısı e-postanıza gönderildi.',error?'error':'success');
 };
 document.querySelector('#accountBtn')?.addEventListener('click',()=>document.querySelector('#accountDialog')?.showModal());
 document.querySelector('#closeAccountBtn')?.addEventListener('click',()=>document.querySelector('#accountDialog')?.close());
 document.querySelector('#syncNowBtn')?.addEventListener('click',async()=>{await pushCloudState(true);await flushCloudFileQueue();toast('Senkronizasyon kontrol edildi')});
 document.querySelector('#logoutBtn')?.addEventListener('click',async()=>{document.querySelector('#accountDialog')?.close();await sb.auth.signOut()});
 document.querySelector('#changePasswordBtn')?.addEventListener('click',()=>{document.querySelector('#accountDialog')?.close();document.querySelector('#newPasswordDialog')?.showModal()});
 document.querySelector('#cancelPasswordBtn')?.addEventListener('click',()=>document.querySelector('#newPasswordDialog')?.close());
 document.querySelector('#newPasswordForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const a=document.querySelector('#newPassword').value,b=document.querySelector('#newPasswordAgain').value;
  if(a!==b){toast('Şifreler eşleşmiyor');return}
  const {error}=await sb.auth.updateUser({password:a});
  if(error){toast('Şifre değiştirilemedi: '+error.message);return}
  e.target.reset();document.querySelector('#newPasswordDialog')?.close();toast('Şifre güncellendi');
 });
 window.addEventListener('online',()=>{setCloudStatus('syncing','Bağlantı geldi, eşitleniyor…');pushCloudState(true);flushCloudFileQueue();pullCloudState()});
 window.addEventListener('offline',()=>setCloudStatus('pending','Çevrimdışı · değişiklikler cihazda'));
}
function seedArticles(){return[
{id:crypto.randomUUID(),title:'cVEMP Responses in Patients with Vestibular Migraine',authors:'Kim, J. H.; Park, S. H.; Lee, H.',year:2023,journal:'Otology & Neurotology',doi:'',courseId:'vestibuler',topic:'VEMP',tags:['vestibüler migren','tez'],summary:'Makalenin Amacı\nVestibüler migren hastalarında cVEMP yanıtlarını incelemek.\n\nMetodoloji\n42 vestibüler migren hastası ve sağlıklı kontrol grubu karşılaştırılmıştır.\n\nÖnemli Sonuçlar\nP13 ve N23 latanslarında farklılıklar raporlanmıştır.\n\nKendi Notlarım\nTezimin VEMP bölümünde kullanılabilir.',favorite:true,reread:false,createdAt:Date.now()-60000,pdfKey:null,summaryPdfKey:null},
{id:crypto.randomUUID(),title:'Comparison of vHIT and Caloric Testing in Peripheral Vestibular Disorders',authors:'Yılmaz, A.; Demir, E.',year:2022,journal:'Audiology Research',doi:'',courseId:'vestibuler',topic:'vHIT',tags:['kalorik test','vhit'],summary:'vHIT ve kalorik test sonuçlarının her zaman aynı patolojiyi göstermediğini vurguluyor. Testlerin birbirini tamamlayıcı kullanımı açısından önemli.',favorite:false,reread:true,createdAt:Date.now()-30000,pdfKey:null,summaryPdfKey:null}
]}
function courseById(id){return state.courses.find(c=>c.id===id)}
function countArticles(courseId,topic){return state.articles.filter(a=>(!courseId||a.courseId===courseId)&&(!topic||a.topic===topic)).length}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function apa(a){const authors=(a.authors||'Yazar bilgisi yok').split(';').map(x=>x.trim()).filter(Boolean).join(', ');let s=`${authors} (${a.year||'t.y.'}). ${a.title}.`;if(a.journal)s+=` ${a.journal}.`;if(a.doi)s+=` https://doi.org/${a.doi.replace(/^https?:\/\/doi.org\//,'')}`;return s}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}
function setHeader(title,sub='',back=false){$('#pageTitle').textContent=title;$('#pageSubtitle').textContent=sub;$('#backBtn').classList.toggle('hidden',!back)}
function navActive(view){document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}
function render(){navActive(state.view);if(state.view==='home')renderHome();else if(state.view==='course')renderCourse();else if(state.view==='topic')renderTopic();else if(state.view==='article')renderArticle();else if(state.view==='compare')renderCompare();else if(state.view==='insights')renderInsights();else if(state.view==='literature')renderLiteratureHub();else if(state.view==='matrix')renderLiteratureMatrix();else if(state.view==='thesiswork')renderThesisWorkspace();else if(state.view==='filters')renderAdvancedFilters();else renderListView(state.view)}
function renderHome(){setHeader('Merhaba, iyi çalışmalar! 🌿','Makalelerinizi, notlarınızı, alıntılarınızı ve tez kaynaklarınızı tek yerde yönetin.',false);content.innerHTML=`
<div class="love-note"><div class="love-note-heart">♥</div><div><strong>Sevgilim, seni seviyorum. ❤️</strong><p>Yoğun günlerini biraz olsun hafifletmek ve sana küçük bir nefes alanı bırakmak için bunu senin için yaptım.<br><b>Sen hayallerine ve bilime odaklan, gerisini biraz da bu program düşünsün.</b><br>Umarım her kullandığında sana ne kadar değerli olduğunu hatırlatır.</p></div></div>
<div class="searchbox"><span>⌕</span><input id="homeSearch" placeholder="Makale, konu veya notlarda ara..."/><button class="mini-btn" id="searchGo">Ara</button></div>
<div class="section-head"><h2>Dersler / Alanlar</h2><button class="link-btn" id="addCourse">＋ Yeni alan</button></div>
<div class="course-grid">${state.courses.map(c=>`<article class="course-card" data-course="${c.id}"><div class="course-icon">▣</div><strong>${esc(c.name)}</strong><small>${c.topics.length} alt konu · ${countArticles(c.id)} makale</small></article>`).join('')}</div>
<div class="section-head"><h2>Kısayollar</h2></div><div class="shortcut-grid">
<div class="stat-card" data-view="favorites"><span>⭐ Tezimde Kullanacağım</span><div class="num">${state.articles.filter(a=>a.favorite).length}</div></div>
<div class="stat-card" data-view="reread"><span>↻ Tekrar Okunacaklar</span><div class="num">${state.articles.filter(a=>a.reread).length}</div></div>
<div class="stat-card" data-view="missing"><span>▧ Özeti Eksik Olanlar</span><div class="num">${state.articles.filter(a=>!a.summary?.trim()).length}</div></div>
<div class="stat-card" data-view="recent"><span>◷ Son Eklenenler</span><div class="num">${Math.min(10,state.articles.length)}</div></div>
<div class="stat-card" data-view="literature"><span>◉ Güncel Literatür</span><div class="num">↗</div></div>
<div class="stat-card" data-view="matrix"><span>▦ Literatür Matrisi</span><div class="num">${state.articles.length}</div></div></div>`;
$('#searchGo').onclick=()=>{state.search=$('#homeSearch').value;state.view='search';render()};$('#homeSearch').onkeydown=e=>{if(e.key==='Enter')$('#searchGo').click()};document.querySelectorAll('[data-course]').forEach(el=>el.onclick=()=>{state.courseId=el.dataset.course;state.view='course';render()});document.querySelectorAll('.stat-card[data-view]').forEach(el=>el.onclick=()=>{state.view=el.dataset.view;render()});$('#addCourse').onclick=()=>$('#courseDialog').showModal()}
function renderCourse(){const c=courseById(state.courseId);setHeader(c.name,`${countArticles(c.id)} makale · ${c.topics.length} alt başlık`,true);content.innerHTML=`<div class="searchbox"><span>⌕</span><input id="courseSearch" placeholder="Bu alanda ara..."/></div><div class="section-head"><h2>Alt başlıklar</h2><button class="link-btn" id="apaCourse">APA kaynakça</button></div><div class="topic-list">${c.topics.map(t=>`<div class="topic-row" data-topic="${esc(t)}"><div class="topic-icon">▰</div><div class="grow"><strong>${esc(t)}</strong></div><small>${countArticles(c.id,t)} makale ›</small></div>`).join('')}</div><div id="courseResults"></div>`;document.querySelectorAll('[data-topic]').forEach(el=>el.onclick=()=>{state.topic=el.dataset.topic;state.view='topic';render()});$('#courseSearch').oninput=e=>renderInlineResults(e.target.value,c.id);$('#apaCourse').onclick=()=>showApa(state.articles.filter(a=>a.courseId===c.id),c.name)}
function renderTopic(){const c=courseById(state.courseId);setHeader(state.topic,`${c.name} · ${countArticles(c.id,state.topic)} makale`,true);const list=state.articles.filter(a=>a.courseId===c.id&&a.topic===state.topic);content.innerHTML=`<div class="toolbar"><button class="mini-btn" id="apaTopic">APA 7 kaynakça</button></div>${articleList(list)}`;wireArticleList();$('#apaTopic').onclick=()=>showApa(list,`${c.name} / ${state.topic}`)}
function articleList(list){if(!list.length)return`<div class="empty">Henüz makale yok. “Makale Ekle” ile başlayabilirsiniz.</div>`;return`<div class="article-list">${list.map(a=>`<article class="article-card"><div class="doc-icon">▤</div><div><h3>${esc(a.title)}</h3><p>${esc(a.authors||'Yazar yok')} · ${a.year||''}${a.journal?' · '+esc(a.journal):''}</p><div class="chips"><span class="chip">${esc(courseById(a.courseId)?.name||'')}</span><span class="chip">${esc(a.topic||'')}</span><span class="chip status-chip">${readStatusLabel(a.readStatus)}</span>${a.thesisSection?`<span class="chip thesis-chip">${esc(a.thesisSection)}</span>`:''}${(a.tags||[]).slice(0,2).map(t=>`<span class="chip">#${esc(t)}</span>`).join('')}</div></div><div class="article-actions"><button class="mini-btn ${a.favorite?'starred':''}" data-star="${a.id}">${a.favorite?'★':'☆'}</button><button class="mini-btn" data-open="${a.id}">Aç</button></div></article>`).join('')}</div>`}
function wireArticleList(){document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{state.currentArticleId=b.dataset.open;state.view='article';state.articleTab='summary';render()});document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>{const a=state.articles.find(x=>x.id===b.dataset.star);a.favorite=!a.favorite;save();render()})}

function readStatusLabel(v){return({unread:'Okunmadı',reading:'Okunuyor',read:'Okundu',review:'Tekrar incelenecek'})[v||'unread']||'Okunmadı'}
function researchOf(a){return a.research||{aim:'',sample:'',method:'',tests:'',finding:'',limits:'',relevance:''}}

function renderLiteratureHub(){
 setHeader('Güncel Literatür','Yeni yayınlara ve temel akademik kaynaklara tek noktadan ulaşın.',false);
 const y=new Date().getFullYear();
 const topics=[
  ['Vestibüler','vestibular audiology OR vestibular assessment OR VEMP'],
  ['İşitme Cihazları','hearing aids audiology'],
  ['Koklear İmplant','cochlear implant audiology'],
  ['Pediatrik Odyoloji','pediatric audiology OR childhood hearing loss'],
  ['Elektrofizyoloji','auditory electrophysiology OR ABR OR ASSR'],
  ['Psikoakustik','psychoacoustics hearing']
 ];
 const qurl=q=>'https://pubmed.ncbi.nlm.nih.gov/?term='+encodeURIComponent('('+q+') AND ("'+y+'/01/01"[Date - Publication] : "3000"[Date - Publication])')+'&sort=date';
 content.innerHTML=`<div class="literature-intro"><h2>Yeni Çalışmalar</h2><p>Konu kartları PubMed'de bu yıl yayımlanan çalışmaları <strong>en yeni önce</strong> açar. Dış kaynaklar yeni sekmede açılır; beğendiğiniz PDF'yi ardından kütüphaneye ekleyebilirsiniz.</p></div>
 <div class="literature-topic-grid">${topics.map(([n,q])=>`<a class="literature-topic-card" href="${qurl(q)}" target="_blank" rel="noopener"><strong>${n}</strong><span>${y} yayınlarını aç ↗</span></a>`).join('')}</div>
 <div class="section-head"><h2>Akademik Kaynaklar</h2></div>
 <div class="source-grid">
 <a class="source-card" href="https://pubmed.ncbi.nlm.nih.gov/" target="_blank" rel="noopener"><strong>PubMed</strong><span>Biyomedikal literatür ve PMID araması ↗</span></a>
 <a class="source-card" href="https://pubs.asha.org/journal/aja" target="_blank" rel="noopener"><strong>American Journal of Audiology</strong><span>ASHA Journals ↗</span></a>
 <a class="source-card" href="https://journals.lww.com/ear-hearing/pages/default.aspx" target="_blank" rel="noopener"><strong>Ear and Hearing</strong><span>Güncel sayılar ↗</span></a>
 <a class="source-card" href="https://www.tandfonline.com/journals/iija20" target="_blank" rel="noopener"><strong>International Journal of Audiology</strong><span>Güncel araştırmalar ↗</span></a>
 <a class="source-card" href="https://journals.lww.com/otology-neurotology/pages/default.aspx" target="_blank" rel="noopener"><strong>Otology & Neurotology</strong><span>Otoloji / implant literatürü ↗</span></a>
 <a class="source-card" href="https://scholar.google.com/" target="_blank" rel="noopener"><strong>Google Scholar</strong><span>Geniş akademik arama ↗</span></a>
 </div>
 <div class="pro-note"><strong>Profesyonel not:</strong> Bu ekran canlı yayın verisini uygulamanın içine kopyalamaz; kaynakların güncel arama sayfalarını doğrudan açar. Otomatik yeni-yayın bildirimleri sunucu entegrasyonu aşamasında eklenebilir.</div>`;
}

function renderLiteratureMatrix(){
 setHeader('Literatür Matrisi',`${state.articles.length} makaleyi yapılandırılmış olarak karşılaştırın.`,false);
 const rows=state.articles.map(a=>{const r=researchOf(a);return `<tr data-matrix="${a.id}">
 <td class="matrix-title"><button class="link-btn matrix-open" data-open="${a.id}">${esc(a.title)}</button><small>${esc(a.authors||'')} · ${a.year||''}</small></td>
 <td>${esc(r.aim||'-')}</td><td>${esc(r.sample||'-')}</td><td>${esc(r.method||'-')}</td><td>${esc(r.tests||'-')}</td><td>${esc(r.finding||'-')}</td><td>${esc(r.limits||'-')}</td><td>${esc(r.relevance||'-')}</td>
 </tr>`}).join('');
 content.innerHTML=`<div class="section-head"><h2>Karşılaştırma Tablosu</h2><div class="toolbar-inline"><button class="link-btn" id="matrixExcel">Excel</button><button class="link-btn" id="matrixWord">Word</button></div></div>
 <div class="matrix-scroll"><table class="matrix-table"><thead><tr><th>Makale</th><th>Amaç</th><th>Örneklem</th><th>Yöntem</th><th>Testler</th><th>Temel bulgu</th><th>Sınırlılıklar</th><th>Tez için önemi</th></tr></thead><tbody>${rows||'<tr><td colspan="8">Henüz makale yok.</td></tr>'}</tbody></table></div>`;
 document.querySelectorAll('.matrix-open').forEach(b=>b.onclick=()=>{state.currentArticleId=b.dataset.open;state.view='article';state.articleTab='summary';render()});
 $('#matrixExcel').onclick=()=>exportArticlesCsv(state.articles,'Literatur_Matrisi');
 $('#matrixWord').onclick=()=>exportArticlesDoc(state.articles,'Literatur_Matrisi');
}

function renderThesisWorkspace(){
 setHeader('Tez Çalışma Alanı','Kaynakları tez bölümlerine bağlayın ve eksikleri görün.',false);
 const sections=['Giriş','Kuramsal Çerçeve','Literatür','Yöntem','Bulgular','Tartışma','Sonuç'];
 const thesisArticles=state.articles.filter(a=>a.favorite||a.thesis||a.thesisSection);
 content.innerHTML=`<div class="thesis-overview"><div class="stat-card"><span>Tez kaynakları</span><div class="num">${thesisArticles.length}</div></div><div class="stat-card"><span>Bölüme bağlanmamış</span><div class="num">${thesisArticles.filter(a=>!a.thesisSection).length}</div></div><div class="stat-card"><span>Notu eksik</span><div class="num">${thesisArticles.filter(a=>!a.summary?.trim()).length}</div></div></div>
 <div class="thesis-sections">${sections.map(s=>{const arr=thesisArticles.filter(a=>a.thesisSection===s);return `<section class="thesis-section"><div class="section-head"><h2>${s}</h2><span>${arr.length} kaynak</span></div>${arr.length?articleList(arr):'<div class="empty compact-empty">Bu bölüme kaynak bağlanmadı.</div>'}</section>`}).join('')}
 <section class="thesis-section"><div class="section-head"><h2>Henüz Bölüme Bağlanmayanlar</h2></div>${articleList(thesisArticles.filter(a=>!a.thesisSection))}</section></div>`;
 wireArticleList();
}

function renderAdvancedFilters(){
 setHeader('Gelişmiş Filtreler','Yıl, ders, konu, okuma ve tez durumunu birlikte filtreleyin.',false);
 const years=[...new Set(state.articles.map(a=>a.year).filter(Boolean))].sort((a,b)=>b-a);
 const topics=[...new Set(state.articles.map(a=>a.topic).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
 content.innerHTML=`<div class="filter-panel">
 <label>Anahtar kelime<input id="fQuery" placeholder="Başlık, yazar, DOI, not..."></label>
 <label>Yıl<select id="fYear"><option value="">Tümü</option>${years.map(y=>`<option>${y}</option>`).join('')}</select></label>
 <label>Ders<select id="fCourse"><option value="">Tümü</option>${state.courses.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
 <label>Konu<select id="fTopic"><option value="">Tümü</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label>
 <label>Okuma durumu<select id="fStatus"><option value="">Tümü</option><option value="unread">Okunmadı</option><option value="reading">Okunuyor</option><option value="read">Okundu</option><option value="review">Tekrar incelenecek</option></select></label>
 <label>Tez<select id="fThesis"><option value="">Tümü</option><option value="yes">Tez havuzunda</option><option value="no">Tez dışında</option></select></label>
 <div class="filter-actions"><button class="primary-btn" id="applyFilters">Filtrele</button><button class="mini-btn" id="clearFilters">Temizle</button></div></div>
 <div class="section-head"><h2 id="filterCount">Tüm makaleler</h2><div class="toolbar-inline"><button class="link-btn" id="filterApa">APA</button><button class="link-btn" id="filterExcel">Excel</button></div></div><div id="filterResults">${articleList(state.articles)}</div>`;
 let current=[...state.articles];
 const apply=()=>{const q=$('#fQuery').value.trim(),year=$('#fYear').value,course=$('#fCourse').value,topic=$('#fTopic').value,status=$('#fStatus').value,thesis=$('#fThesis').value;
  current=state.articles.filter(a=>(!q||searchScore(a,q)>0)&&(!year||String(a.year)===year)&&(!course||a.courseId===course)&&(!topic||a.topic===topic)&&(!status||(a.readStatus||'unread')===status)&&(!thesis||(thesis==='yes'?!!(a.favorite||a.thesis):!(a.favorite||a.thesis))));
  $('#filterCount').textContent=`${current.length} sonuç`;$('#filterResults').innerHTML=articleList(current);wireArticleList();
 };
 $('#applyFilters').onclick=apply;$('#clearFilters').onclick=()=>{document.querySelectorAll('.filter-panel input,.filter-panel select').forEach(x=>x.value='');apply()};
 $('#filterApa').onclick=()=>showApa(current,'Filtrelenmiş Kaynaklar');$('#filterExcel').onclick=()=>exportArticlesCsv(current,'Filtrelenmis_Makaleler');
}

function renderListView(view){let title='Arama',list=state.articles;if(view==='favorites'||view==='thesis'){title='Tez Havuzu';list=list.filter(a=>a.favorite||a.thesis)}if(view==='reread'){title='Tekrar Okunacaklar';list=list.filter(a=>a.reread)}if(view==='missing'){title='Özeti Eksik Olanlar';list=list.filter(a=>!a.summary?.trim())}if(view==='recent'){title='Son Eklenenler';list=[...list].sort((a,b)=>b.createdAt-a.createdAt).slice(0,10)}setHeader(title,`${list.length} makale`,false);let q=state.search||'';if(view==='search'&&q)list=searchArticles(q);content.innerHTML=`<div class="searchbox"><span>⌕</span><input id="globalSearch" value="${esc(q)}" placeholder="Başlık, yazar, konu, etiket veya kendi notlarında ara..."/><button class="mini-btn" id="globalGo">Ara</button></div><div class="section-head"><h2>${view==='search'&&q?`“${esc(q)}” için sonuçlar`:title}</h2><div class="toolbar-inline"><button class="link-btn" id="apaList">APA kaynakça</button><button class="link-btn" id="exportCsv">Excel</button><button class="link-btn" id="exportDoc">Word</button></div></div><div id="results">${articleList(list)}</div>`;wireArticleList();$('#globalGo').onclick=()=>{state.search=$('#globalSearch').value.trim();state.view='search';render()};$('#globalSearch').onkeydown=e=>{if(e.key==='Enter')$('#globalGo').click()};$('#apaList').onclick=()=>showApa(list,title);$('#exportCsv').onclick=()=>exportArticlesCsv(list,title);$('#exportDoc').onclick=()=>exportArticlesDoc(list,title)}
function normalizeWords(s=''){return String(s).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9çğıöşü]+/gi,' ').split(/\s+/).filter(w=>w.length>2)}
function searchScore(a,q){const qs=normalizeWords(q);if(!qs.length)return 0;const title=normalizeWords(a.title).join(' '),meta=normalizeWords([a.authors,a.journal,a.topic,courseById(a.courseId)?.name,(a.tags||[]).join(' ')].join(' ')).join(' '),body=normalizeWords([a.summary,(a.smartNotes||[]).map(n=>n.text).join(' '),articlePages(a).join(' ')].join(' ')).join(' ');let s=0;for(const w of qs){if(title.includes(w))s+=8;if(meta.includes(w))s+=4;if(body.includes(w))s+=2}const phrase=String(q).toLocaleLowerCase('tr-TR');if((a.title||'').toLocaleLowerCase('tr-TR').includes(phrase))s+=15;return s}
function searchArticles(q){return state.articles.map(a=>({a,s:searchScore(a,q)})).filter(x=>x.s>0).sort((x,y)=>y.s-x.s).map(x=>x.a)}
function renderInlineResults(q,courseId){const box=$('#courseResults');if(!q.trim()){box.innerHTML='';return}const list=searchArticles(q).filter(a=>a.courseId===courseId);box.innerHTML=`<div class="section-head"><h2>Arama sonuçları</h2></div>${articleList(list)}`;wireArticleList()}
function capturePdfReadingPosition(a){
 const container=$('#pdfRenderScroll')||$('#splitPdfRenderScroll');
 if(!container)return;
 const shells=[...container.querySelectorAll('.pdf-page-shell')];
 if(!shells.length)return;
 const top=container.scrollTop;
 let current=shells[0];
 for(const sh of shells){if(sh.offsetTop<=top+24)current=sh;else break}
 const h=Math.max(1,current.offsetHeight);
 const ratio=Math.max(0,Math.min(1,(top-current.offsetTop)/h));
 a.pdfReadingPosition={page:Number(current.dataset.page)||1,ratio,scrollTop:top};
 save();
}
function restorePdfReadingPosition(container,a){
 const pos=a.pdfReadingPosition;if(!pos)return;
 const shell=container.querySelector(`.pdf-page-shell[data-page="${pos.page||1}"]`);
 requestAnimationFrame(()=>{
  if(shell)container.scrollTop=shell.offsetTop+(Math.max(0,Math.min(1,pos.ratio||0))*shell.offsetHeight);
  else if(Number.isFinite(pos.scrollTop))container.scrollTop=pos.scrollTop;
 });
}
function watchPdfReadingPosition(container,a){
 let t=null;
 container.addEventListener('scroll',()=>{clearTimeout(t);t=setTimeout(()=>capturePdfReadingPosition(a),180)},{passive:true});
}

async function renderArticle(){
 const a=state.articles.find(x=>x.id===state.currentArticleId);setHeader('Makale',courseById(a.courseId)?.name+' · '+(a.topic||''),true);
 let pdfUrl=null,summaryPdfUrl=null;if(a.pdfKey){const blob=await getFile(a.pdfKey);if(blob)pdfUrl=URL.createObjectURL(blob)}if(a.summaryPdfKey){const blob=await getFile(a.summaryPdfKey);if(blob)summaryPdfUrl=URL.createObjectURL(blob)}
 content.innerHTML=`<div class="article-view"><div class="article-header"><div class="grow"><h2>${esc(a.title)}</h2><p>${esc(a.authors||'')} · ${a.year||''} ${a.journal?'· '+esc(a.journal):''}</p></div><button class="mini-btn" id="favBtn">${a.favorite?'★ Tez':'☆ Teze Ekle'}</button><button class="mini-btn" id="editMeta">Düzenle</button><button class="mini-btn danger" id="deleteArticle">Sil</button></div><div class="tabs"><button class="tab ${state.articleTab==='summary'?'active':''}" data-tab="summary">ÖZETİM</button><button class="tab ${state.articleTab==='handwriting'?'active':''}" data-tab="handwriting">✎ EL YAZISI</button><button class="tab ${state.articleTab==='pdf'?'active':''}" data-tab="pdf">MAKALE</button><button class="tab ${state.articleTab==='split'?'active':''}" data-tab="split">BİRLİKTE</button><button class="tab ${state.articleTab==='assistant'?'active':''}" data-tab="assistant">✦ ASİSTAN</button></div><div id="tabContent" class="tab-panel"></div></div><div class="apa-card"><div class="section-head" style="margin:0 0 10px"><h2>APA 7</h2><button class="mini-btn" id="copyApa">Kopyala</button></div><div>${esc(apa(a))}</div></div>`;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{capturePdfReadingPosition(a);state.articleTab=b.dataset.tab;renderArticle()});$('#favBtn').onclick=()=>{a.favorite=!a.favorite;a.thesis=a.favorite;save();renderArticle()};$('#deleteArticle').onclick=async()=>{if(confirm('Bu makale silinsin mi?')){if(a.pdfKey)await deleteFile(a.pdfKey);if(a.summaryPdfKey)await deleteFile(a.summaryPdfKey);await deleteIndex(a.id);delete state.indexCache[a.id];state.articles=state.articles.filter(x=>x.id!==a.id);save();state.view='home';render()}};$('#copyApa').onclick=()=>navigator.clipboard.writeText(apa(a)).then(()=>toast('APA kaynakça kopyalandı'));$('#editMeta').onclick=()=>openArticleDialog(a);
 const tab=$('#tabContent');
 if(state.articleTab==='summary'){
  tab.innerHTML=`<div class="summary-workspace"><div class="summary-pdf-card"><div class="panel-title"><h3>Özet PDF</h3><span>${summaryPdfUrl?'GoodNotes / özet dosyası':'Henüz eklenmedi'}</span></div>${summaryPdfUrl?`<iframe src="${summaryPdfUrl}"></iframe>`:`<div class="no-pdf compact">Düzenle’ye basarak özet PDF’si ekleyebilirsiniz.</div>`}</div><div class="summary-panel"><div class="note-editor"><h3>Kendi Özetim / Notlarım</h3><textarea id="summaryEdit">${esc(a.summary||'')}</textarea><div style="margin-top:10px"><button class="primary-btn" id="saveSummary">Notu Kaydet</button> <button class="mini-btn" id="goHandwriting">✎ Apple Pencil ile Yaz</button></div><div id="inkNoteAttachments" class="ink-note-attachments"></div></div>${metaHtml(a)}</div></div>`;
  $('#saveSummary').onclick=()=>{a.summary=$('#summaryEdit').value;save();toast('Not kaydedildi')};$('#goHandwriting').onclick=()=>{capturePdfReadingPosition(a);state.articleTab='handwriting';renderArticle()};renderInkNoteAttachments(a)
 } else if(state.articleTab==='handwriting'){
  tab.innerHTML=`<div class="ink-workspace"><div class="ink-toolbar"><div class="tool-group"><button class="ink-tool active" data-tool="pen">✎ Kalem</button><button class="ink-tool" data-tool="marker">▰ Fosforlu</button><button class="ink-tool" data-tool="eraser">⌫ Silgi</button></div><div class="tool-group"><label>Kalınlık <input id="inkSize" type="range" min="1" max="16" value="3"></label><input id="inkColor" class="ink-color" type="color" value="#35245f" title="Kalem rengi"></div><div class="tool-group"><button class="mini-btn" id="inkUndo">↶ Geri</button><button class="mini-btn" id="inkRedo">↷ İleri</button><button class="mini-btn danger" id="inkClear">Temizle</button></div><label class="pencil-only"><input id="pencilOnly" type="checkbox" checked> Parmakla çizimi kapat (Mouse + Apple Pencil açık)</label></div><div class="ink-paper-wrap"><canvas id="inkCanvas" class="ink-canvas" aria-label="Apple Pencil not alanı"></canvas><div class="ink-hint">Apple Pencil veya mouse ile bu alana doğrudan yazabilirsiniz. Çizimler otomatik kaydedilir.</div></div></div>`;
  initInkCanvas($('#inkCanvas'),a)
 } else if(state.articleTab==='pdf'){
  tab.innerHTML=pdfUrl?`<div class="pdf-smart-layout"><div class="pdf-annotate-workspace"><div class="pdf-ink-toolbar simple-annot-toolbar">
<div class="tool-group main-annot-tools">
<button class="pdf-direct-tool active" data-tool="navigate">☝ Gezin</button>
<button class="pdf-direct-tool" data-tool="pen">✎ Kalem</button>
<button class="pdf-direct-tool" data-tool="marker">▰ Fosfor</button>
<button class="pdf-direct-tool" data-tool="eraser">⌫ Silgi</button>
</div>
<div class="tool-group annot-settings">
<label>Kalınlık <input id="pdfInkSize" type="range" min="1" max="18" value="3"></label>
<input id="pdfInkColor" class="ink-color" type="color" value="#7c3aed">
</div>
<div class="tool-group">
<button class="mini-btn" id="pdfInkUndo">↶ Geri</button>
<button class="mini-btn" id="pdfInkRedo">↷ İleri</button>
<button class="mini-btn danger" id="pdfInkClear">Tüm Anotasyonları Temizle</button>
</div>
<label class="pencil-only"><input id="pdfPencilOnly" type="checkbox" checked> Parmakla çizimi kapat (Mouse + Apple Pencil açık)</label>
</div><div class="pdf-panel pdf-annotatable"><div id="pdfRenderScroll" class="pdf-render-scroll" aria-label="PDF okuyucu"></div><div class="pdf-ink-hint" id="pdfInkHint">Gezin modunda PDF'yi kaydırın. “PDF Üzerine Yaz” ile Apple Pencil veya mouse anotasyonunu açın.</div></div></div><aside class="smart-note-panel"><div><h3>Notlara Aktar</h3><p>Buradan yalnızca istediğiniz içerikleri Notlarım’a gönderirsiniz.</p></div>
<button class="primary-btn full-btn" id="addPdfSelection">＋ Seçili Metni Notlarım’a Ekle</button>
<small><strong>Gezin</strong> aracındayken PDF’den cümleyi seçin.</small>
<div class="smart-divider"></div>
<button class="primary-btn full-btn pen-only-action" id="saveInkSnapshot">✎ Kalem Notunu Notlarım’a Ekle</button>
<small class="pen-note-help"><strong>Fosfor Notlarım’a aktarılmaz.</strong> Fosfor sadece PDF üzerinde kalıcı hatırlatıcıdır.</small>
<div class="smart-divider"></div>
<label><strong>Kenar Notu</strong><span>iPad Scribble ile yazarsanız metne çevrilebilir.</span><textarea id="marginNote" rows="6" placeholder="İsteğe bağlı kenar notu…"></textarea></label>
<div class="smart-status" id="marginStatus">Kenar notu yazıldığında otomatik olarak Notlarım’a aktarılır.</div>
<button class="mini-btn full-btn" id="captureClipboard">📋 Panodaki Metni Notlarım’a Ekle</button>
<div id="smartNoteHistory" class="smart-note-history"></div></aside></div>`:`<div class="pdf-panel no-pdf">Bu makaleye henüz PDF eklenmemiş.</div>`;
  if(pdfUrl){initPdfInkCanvas($('#pdfRenderScroll'),a,pdfUrl).then(()=>initSmartNotes(a,$('#pdfRenderScroll .pdf-page-ink-canvas')))}
 } else if(state.articleTab==='split'){
  tab.innerHTML=`<div class="split-panel"><div class="split-document"><div class="panel-title"><h3>Orijinal Makale</h3></div>${pdfUrl?`<div id="splitPdfRenderScroll" class="pdf-render-scroll split-pdf-scroll" aria-label="PDF okuyucu"></div>`:`<div class="no-pdf">Makale PDF’si eklenmemiş.</div>`}</div><div class="split-summary"><div class="panel-title"><h3>Özet PDF + Notlar</h3><button class="mini-btn" id="splitHandwriting">✎ El Yazısı</button></div>${summaryPdfUrl?`<iframe src="${summaryPdfUrl}"></iframe>`:`<div class="no-pdf compact">Özet PDF’si eklenmemiş.</div>`}<div class="note-editor split-notes"><textarea id="summarySplit">${esc(a.summary||'')}</textarea><button class="primary-btn" id="saveSplit">Notu Kaydet</button></div></div></div>`;$('#saveSplit').onclick=()=>{a.summary=$('#summarySplit').value;save();toast('Not kaydedildi')};$('#splitHandwriting').onclick=()=>{capturePdfReadingPosition(a);state.articleTab='handwriting';renderArticle()};if(pdfUrl)initPdfReadOnly($('#splitPdfRenderScroll'),a,pdfUrl)
 } else if(state.articleTab==='assistant'){renderArticleAssistant(tab,a)}
}


function addStructuredNote(a,kind,text,meta={}){
 const clean=(text||'').replace(/\s+/g,' ').trim();if(!clean)return false;
 a.smartNotes=a.smartNotes||[];
 const duplicate=a.smartNotes.some(n=>n.text===clean&&Math.abs((n.createdAt||0)-Date.now())<5000);if(duplicate)return false;
 const item={id:crypto.randomUUID(),kind,text:clean,createdAt:Date.now(),page:meta.page||null,pageRatio:meta.pageRatio??null};
 a.smartNotes.unshift(item);
 a.summary=(a.summary||'').trimEnd()+`${a.summary?.trim()?'\n\n':''}${clean}`;
 save();return true
}
function renderSmartHistory(a){
 const box=$('#smartNoteHistory');if(!box)return;
 const items=(a.smartNotes||[]).slice(0,10);
 box.innerHTML=items.length?`<h4>Son aktarılanlar</h4>${items.map(n=>`<button class="smart-note-item smart-note-jump" data-note-id="${n.id}"><span>${esc(n.text)}</span>${n.page?`<small>Sayfa ${n.page} · Kaynağa git</small>`:''}</button>`).join('')}`:`<div class="smart-empty">Henüz otomatik aktarılan not yok.</div>`;
 box.querySelectorAll('[data-note-id]').forEach(b=>b.onclick=()=>{const n=(a.smartNotes||[]).find(x=>x.id===b.dataset.noteId);if(n?.page){a.pdfReading={page:n.page,ratio:n.pageRatio||0};save();state.articleTab='pdf';renderArticle()}})
}

async function renderInkNoteAttachments(a){
 const box=$('#inkNoteAttachments');if(!box)return;
 const refs=(a.inkNoteRefs||[]).filter(r=>r?.key);
 if(!refs.length){box.innerHTML='';return}
 box.innerHTML='<h4>Kalem Notları</h4><div class="ink-note-grid"></div>';
 const grid=box.querySelector('.ink-note-grid');
 for(const ref of refs){
  try{
   const blob=await getFile(ref.key);if(!blob)continue;
   const url=URL.createObjectURL(blob);
   const card=document.createElement('div');card.className='ink-note-card';
   card.innerHTML=`<img alt="PDF kalem notu${ref.page?' · Sayfa '+ref.page:''}"><div class="ink-note-actions">${ref.page?`<button class="mini-btn ink-note-jump">Sayfa ${ref.page} → PDF</button>`:''}<button class="mini-btn danger ink-note-delete">Sil</button></div>`;
   const img=card.querySelector('img');img.src=url;img.onload=()=>URL.revokeObjectURL(url);
   card.querySelector('.ink-note-jump')?.addEventListener('click',()=>{a.pdfReading={page:ref.page,ratio:0};save();state.articleTab='pdf';renderArticle()});
   card.querySelector('.ink-note-delete').onclick=async()=>{if(!confirm('Bu kalem notu Notlarım’dan silinsin mi?'))return;await deleteFile(ref.key);a.inkNoteRefs=(a.inkNoteRefs||[]).filter(x=>x!==ref);save();renderInkNoteAttachments(a)};
   grid.appendChild(card);
  }catch(e){console.warn('Kalem notu yüklenemedi',e)}
 }
}

function initSmartNotes(a,canvas){
 renderSmartHistory(a);let timer=null,lastAuto='';
 const selectedPdfInfo=()=>{const sel=window.getSelection?.();if(!sel||sel.isCollapsed)return null;const text=sel.toString().replace(/\s+/g,' ').trim();if(!text)return null;const node=sel.anchorNode;const el=node?.nodeType===1?node:node?.parentElement;const layer=el?.closest?.('.pdf-text-layer');if(!layer)return null;const shell=layer.closest('.pdf-page-shell');const page=Number(layer.dataset.page||shell?.dataset.page)||null;let pageRatio=0;try{const range=sel.getRangeAt(0),rr=range.getBoundingClientRect(),sr=shell.getBoundingClientRect();pageRatio=Math.max(0,Math.min(1,(rr.top-sr.top)/Math.max(1,sr.height)))}catch{}return{text,page,pageRatio}};
 const selectedPdfText=()=>selectedPdfInfo()?.text||'';
 const addSelection=()=>{const info=selectedPdfInfo();if(!info){toast('Önce Gezin modunda PDF’den bir cümle veya bölüm seçin');return}if(addStructuredNote(a,'quote',info.text,info)){renderSmartHistory(a);window.getSelection?.().removeAllRanges();toast(`Seçili metin Notlarım’a eklendi${info.page?' · Sayfa '+info.page:''}`)}};
 const selectBtn=$('#addPdfSelection');if(selectBtn)selectBtn.onclick=addSelection;
 // Mouse/touch ile metin seçimi bittiğinde seçim varsa butonu hazır hale getir.
 const refreshSelectionButton=()=>{const b=$('#addPdfSelection');if(!b)return;const t=selectedPdfText();b.classList.toggle('selection-ready',!!t);b.textContent=t?'＋ Seçimi Notlarıma Ekle':'＋ Seçili Metni Notlarıma Ekle'};
 document.addEventListener('selectionchange',refreshSelectionButton);
 $('#captureClipboard').onclick=async()=>{
  try{const text=(await navigator.clipboard.readText()).trim();if(!text){toast('Panoda metin yok');return}if(addStructuredNote(a,'quote',text)){renderSmartHistory(a);toast('Cümle Notlarım’a eklendi')}}
  catch{toast('Pano izni gerekli. PDF’de cümleyi kopyaladıktan sonra tekrar deneyin.')}
 };
 const margin=$('#marginNote'),status=$('#marginStatus');
 margin.oninput=()=>{status.textContent='Yazılıyor…';clearTimeout(timer);timer=setTimeout(()=>{const text=margin.value.trim();if(!text||text===lastAuto){status.textContent='Kaydedilecek yeni not yok.';return}if(addStructuredNote(a,'margin',text)){lastAuto=text;margin.value='';status.textContent='✓ Kenar notu Özetim’e aktarıldı.';renderSmartHistory(a);toast('Kenar notu otomatik aktarıldı')}},1000)};
 $('#saveInkSnapshot').onclick=async()=>{
  const strokes=(a.pdfInkStrokes||[]);
  const penStrokes=strokes.filter(s=>s.tool==='pen'&&s.points?.length);
  if(!penStrokes.length){toast('Nota eklemek için önce Kalem ile PDF üzerine yazın');return}
  const page=penStrokes[penStrokes.length-1].page;
  try{
   // Kalem notunu PDF görüntüsünden bağımsız SVG olarak üret. Bu yöntem iPad/Safari'de canvas.toBlob sorunlarını önler.
   const pagePen=strokes.filter(s=>s.page===page&&s.tool==='pen'&&s.points?.length);
   const paths=pagePen.map(st=>{
    const pts=st.points.map(p=>`${Math.max(0,Math.min(1,p.x))*1000},${Math.max(0,Math.min(1,p.y))*1400}`).join(' ');
    const width=Math.max(1,Number(st.size||3))*1.7;
    return `<polyline points="${pts}" fill="none" stroke="${st.color||'#35245f'}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
   }).join('');
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1400" width="1000" height="1400"><rect width="100%" height="100%" fill="white"/>${paths}</svg>`;
   const blob=new Blob([svg],{type:'image/svg+xml'});
   const key=crypto.randomUUID();await putFile(key,blob);
   a.inkNoteRefs=a.inkNoteRefs||[];
   a.inkNoteRefs.unshift({id:crypto.randomUUID(),key,page,createdAt:Date.now(),type:'pen'});
   save();
   toast(`Kalem notu Notlarım’a eklendi · Sayfa ${page}`);
  }catch(e){console.error('Kalem notu aktarımı',e);toast('Kalem notu eklenemedi')}
 }
}


function initPdfInkCanvas(container,a,pdfUrl){
 return (async()=>{
  if(typeof pdfjsLib==='undefined')throw new Error('PDF okuyucu yüklenemedi.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument(pdfUrl).promise;
  let activeTool='navigate',drawing=false,current=null,redo=[];
  a.pdfInkStrokes=(a.pdfInkStrokes||[]).filter(st=>Number.isInteger(st.page)&&['pen','marker','eraser'].includes(st.tool));
  const pages=new Map();

  async function renderPage(pageNo){
   const page=await pdf.getPage(pageNo);
   const base=page.getViewport({scale:1});
   const available=Math.max(320,container.clientWidth-30);
   const scale=Math.min(2,Math.max(.5,available/base.width));
   const viewport=page.getViewport({scale});
   const shell=document.createElement('div');shell.className='pdf-page-shell';shell.dataset.page=pageNo;
   const pdfCanvas=document.createElement('canvas');pdfCanvas.className='pdf-page-canvas';
   const textLayer=document.createElement('div');textLayer.className='pdf-text-layer';textLayer.dataset.page=pageNo;
   const ink=document.createElement('canvas');ink.className='pdf-page-ink-canvas navigate';ink.dataset.page=pageNo;ink.setAttribute('aria-label',`PDF sayfa ${pageNo} anotasyon katmanı`);
   const badge=document.createElement('div');badge.className='pdf-page-number';badge.textContent=`${pageNo} / ${pdf.numPages}`;
   shell.append(pdfCanvas,textLayer,ink,badge);container.appendChild(shell);
   const dpr=Math.max(1,window.devicePixelRatio||1);
   pdfCanvas.width=Math.round(viewport.width*dpr);pdfCanvas.height=Math.round(viewport.height*dpr);pdfCanvas.style.width=viewport.width+'px';pdfCanvas.style.height=viewport.height+'px';
   await page.render({canvasContext:pdfCanvas.getContext('2d'),viewport,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;

   try{
    const textContent=await page.getTextContent();
    state.indexCache[a.id]=state.indexCache[a.id]||[];state.indexCache[a.id][pageNo-1]=textContent.items.map(i=>i.str||'').join(' ').replace(/\s+/g,' ').trim();
    textLayer.style.width=viewport.width+'px';textLayer.style.height=viewport.height+'px';
    for(const item of textContent.items){
     if(!item.str)continue;
     const tx=pdfjsLib.Util.transform(viewport.transform,item.transform);
     const span=document.createElement('span');span.textContent=item.str;
     span.style.left=tx[4]+'px';span.style.top=(tx[5]-Math.hypot(tx[2],tx[3]))+'px';
     span.style.fontSize=Math.max(1,Math.hypot(tx[2],tx[3]))+'px';span.style.fontFamily='sans-serif';
     const angle=Math.atan2(tx[1],tx[0]);if(angle)span.style.transform=`rotate(${angle}rad)`;
     textLayer.appendChild(span);
    }
   }catch(e){console.warn('PDF metin katmanı oluşturulamadı',e)}

   ink.width=Math.round(viewport.width*dpr);ink.height=Math.round(viewport.height*dpr);ink.style.width=viewport.width+'px';ink.style.height=viewport.height+'px';
   const ictx=ink.getContext('2d');ictx.setTransform(dpr,0,0,dpr,0,0);
   pages.set(pageNo,{shell,ink,ctx:ictx,w:viewport.width,h:viewport.height});
   bindInk(ink,pageNo);redrawPage(pageNo);
  }

  function drawStroke(st){
   const pg=pages.get(st.page);if(!pg||!st.points?.length)return;
   const {ctx,w,h}=pg;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
   ctx.strokeStyle=st.tool==='marker'?(st.color||'#ffe066'):(st.color||'#35245f');
   ctx.lineWidth=st.size;
   ctx.globalAlpha=st.tool==='marker'?.28:1;
   ctx.globalCompositeOperation=st.tool==='eraser'?'destination-out':'source-over';
   ctx.beginPath();const p=st.points[0];ctx.moveTo(p.x*w,p.y*h);for(const q of st.points.slice(1))ctx.lineTo(q.x*w,q.y*h);ctx.stroke();ctx.restore();
  }
  function redrawPage(pageNo){const pg=pages.get(pageNo);if(!pg)return;pg.ctx.clearRect(0,0,pg.w,pg.h);for(const st of a.pdfInkStrokes.filter(x=>x.page===pageNo))drawStroke(st)}
  function redrawAll(){for(const n of pages.keys())redrawPage(n)}
  function point(e,canvas){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,p:e.pressure||.5}}
  function allowed(e){const blockTouch=$('#pdfPencilOnly')?.checked;return e.pointerType!=='touch'||!blockTouch}

  function bindInk(canvas,pageNo){
   canvas.onpointerdown=e=>{
    if(activeTool==='navigate'||!allowed(e))return;
    e.preventDefault();drawing=true;canvas.setPointerCapture?.(e.pointerId);
    const baseSize=Number($('#pdfInkSize')?.value||3);
    const color=$('#pdfInkColor')?.value||'#7c3aed';
    current={page:pageNo,tool:activeTool,color,size:baseSize,points:[point(e,canvas)]};
    if(activeTool==='marker'){current.size=Math.max(14,baseSize*2.5);current.color='#ffe066'}
    if(activeTool==='eraser')current.size=Math.max(22,baseSize*2.7);
    a.pdfInkStrokes.push(current);redo=[];redrawPage(pageNo)
   };
   canvas.onpointermove=e=>{if(!drawing||!current||current.page!==pageNo)return;e.preventDefault();current.points.push(point(e,canvas));redrawPage(pageNo)};
   const finish=()=>{if(!drawing)return;drawing=false;current=null;save()};
   canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onpointerleave=e=>{if(drawing&&e.buttons===0)finish()};
  }

  function setTool(tool){
   activeTool=tool;
   const nav=tool==='navigate';
   container.classList.toggle('draw-mode',!nav);
   container.querySelectorAll('.pdf-page-ink-canvas').forEach(c=>c.classList.toggle('navigate',nav));
   container.querySelectorAll('.pdf-text-layer').forEach(t=>t.classList.toggle('disabled',!nav));
   document.querySelectorAll('.pdf-direct-tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
   const hint=$('#pdfInkHint');
   if(hint){
    hint.textContent=tool==='navigate'?'Gezin: PDF’yi kaydırın ve metin seçin.'
      :tool==='pen'?'Kalem: Apple Pencil veya mouse ile yazın. İsterseniz sağdan Notlarım’a ekleyebilirsiniz.'
      :tool==='marker'?'Fosfor: PDF üzerinde kalıcı hatırlatıcıdır. Notlarım’a aktarılmaz.'
      :'Silgi: Kalem ve fosfor anotasyonlarını siler.';
   }
   const penBtn=$('#saveInkSnapshot');if(penBtn)penBtn.disabled=false;
  }

  container.innerHTML='<div class="pdf-loading">PDF sayfaları hazırlanıyor…</div>';
  const loading=container.firstElementChild;
  for(let p=1;p<=pdf.numPages;p++)await renderPage(p);
  loading?.remove();
  restorePdfReadingPosition(container,a);watchPdfReadingPosition(container,a);

  document.querySelectorAll('.pdf-direct-tool').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  $('#pdfInkUndo').onclick=()=>{if(a.pdfInkStrokes.length){redo.push(a.pdfInkStrokes.pop());save();redrawAll()}};
  $('#pdfInkRedo').onclick=()=>{if(redo.length){a.pdfInkStrokes.push(redo.pop());save();redrawAll()}};
  $('#pdfInkClear').onclick=()=>{if(confirm('Bu PDF üzerindeki tüm kalem ve fosfor anotasyonları temizlensin mi?')){a.pdfInkStrokes=[];redo=[];save();redrawAll()}};
  setTool('navigate');
 })().catch(err=>{console.error(err);container.innerHTML='<div class="no-pdf">PDF görüntülenirken hata oluştu.</div>';toast('PDF görüntülenemedi')})
}

function initPdfReadOnly(container,a,pdfUrl){
 return (async()=>{
  if(!container||typeof pdfjsLib==='undefined')return;
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument(pdfUrl).promise;
  container.innerHTML='<div class="pdf-loading">PDF sayfaları hazırlanıyor…</div>';
  const loading=container.firstElementChild;
  for(let p=1;p<=pdf.numPages;p++){
   const page=await pdf.getPage(p);const base=page.getViewport({scale:1});
   const available=Math.max(320,container.clientWidth-30);const scale=Math.min(2,Math.max(.5,available/base.width));const viewport=page.getViewport({scale});
   const shell=document.createElement('div');shell.className='pdf-page-shell';shell.dataset.page=p;
   const canvas=document.createElement('canvas');canvas.className='pdf-page-canvas';const badge=document.createElement('div');badge.className='pdf-page-number';badge.textContent=`${p} / ${pdf.numPages}`;shell.append(canvas,badge);container.appendChild(shell);
   const dpr=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.round(viewport.width*dpr);canvas.height=Math.round(viewport.height*dpr);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
   await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
  }
  loading?.remove();restorePdfReadingPosition(container,a);watchPdfReadingPosition(container,a);
 })().catch(err=>{console.error(err);container.innerHTML='<div class="no-pdf">PDF görüntülenirken hata oluştu.</div>'})
}

function initInkCanvas(canvas,a){
 const ctx=canvas.getContext('2d');let tool='pen',drawing=false,current=null,redo=[];a.inkStrokes=a.inkStrokes||[];
 function sizeCanvas(){const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);redraw()}
 function drawStroke(st){if(!st||st.points.length<1)return;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=st.color;ctx.lineWidth=st.size;ctx.globalAlpha=st.tool==='marker'?.22:1;ctx.globalCompositeOperation=st.tool==='eraser'?'destination-out':'source-over';ctx.beginPath();const p0=st.points[0];ctx.moveTo(p0.x*canvas.clientWidth,p0.y*canvas.clientHeight);for(const p of st.points.slice(1))ctx.lineTo(p.x*canvas.clientWidth,p.y*canvas.clientHeight);ctx.stroke();ctx.restore()}
 function redraw(){ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);for(const st of a.inkStrokes)drawStroke(st)}
 function pointerPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height,p:e.pressure||.5}}
 function allowed(e){const blockTouch=$('#pencilOnly')?.checked;return e.pointerType!=='touch'||!blockTouch}
 canvas.onpointerdown=e=>{if(!allowed(e))return;e.preventDefault();drawing=true;canvas.setPointerCapture?.(e.pointerId);current={tool,color:$('#inkColor').value,size:Number($('#inkSize').value),points:[pointerPoint(e)]};if(tool==='marker')current.size=Math.max(10,current.size*2);if(tool==='eraser')current.size=Math.max(18,current.size*2);a.inkStrokes.push(current);redo=[];drawStroke(current)};
 canvas.onpointermove=e=>{if(!drawing||!current)return;e.preventDefault();current.points.push(pointerPoint(e));redraw()};
 const finish=e=>{if(!drawing)return;drawing=false;current=null;save();};canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onpointerleave=e=>{if(drawing&&e.buttons===0)finish(e)};
 document.querySelectorAll('.ink-tool').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('.ink-tool').forEach(x=>x.classList.toggle('active',x===b))});
 $('#inkUndo').onclick=()=>{if(a.inkStrokes.length){redo.push(a.inkStrokes.pop());save();redraw()}};$('#inkRedo').onclick=()=>{if(redo.length){a.inkStrokes.push(redo.pop());save();redraw()}};$('#inkClear').onclick=()=>{if(confirm('Bu makaledeki el yazısı notları temizlensin mi?')){a.inkStrokes=[];redo=[];save();redraw()}};
 window.requestAnimationFrame(sizeCanvas);const ro=new ResizeObserver(sizeCanvas);ro.observe(canvas);canvas._inkResizeObserver=ro;
}


function sentenceList(text=''){return String(text).replace(/\s+/g,' ').split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/).map(s=>s.trim()).filter(s=>s.length>35)}
function sectionExtract(text,labelPatterns,nextPatterns=[]){const low=text.toLowerCase();let start=-1;for(const p of labelPatterns){const i=low.indexOf(p);if(i>=0&&(start<0||i<start))start=i}if(start<0)return '';let end=Math.min(text.length,start+4500);for(const p of nextPatterns){const i=low.indexOf(p,start+20);if(i>start&&i<end)end=i}return text.slice(start,end).replace(/^.{0,80}?(abstract|introduction|methods?|materials and methods|results?|discussion|conclusion|sonuçlar?|yöntem)[:\s-]*/i,'').trim()}
function localAcademicSummary(a){const text=articlePages(a).join(' ');if(!text)return null;const abs=sectionExtract(text,['abstract','özet'],['introduction','giriş']);const methods=sectionExtract(text,['methods','method','materials and methods','yöntem'],['results','bulgular']);const results=sectionExtract(text,['results','bulgular'],['discussion','tartışma','conclusion']);const conc=sectionExtract(text,['conclusion','conclusions','sonuç'],['references','kaynaklar']);const pick=x=>sentenceList(x).slice(0,3).join(' ');return {purpose:pick(abs)||sentenceList(text).slice(0,2).join(' '),methods:pick(methods),results:pick(results),conclusion:pick(conc),limitations:sentenceList(text).filter(s=>/limitation|sınırl|constraint/i.test(s)).slice(0,2).join(' '),generatedAt:Date.now(),mode:'yerel'} }
function answerFromArticle(a,q){const qs=normalizeWords(q);const pages=articlePages(a);let candidates=[];pages.forEach((t,i)=>sentenceList(t).forEach(s=>{let score=0;const low=normalizeWords(s);for(const w of qs)if(low.includes(w))score+=2;if(/sample|participants|patients|subjects|control|n\s*=|hasta|katılımcı/i.test(q)&&/\d+|patient|participant|subject|control|hasta|katılımcı/i.test(s))score+=2;if(score)candidates.push({s,score,page:i+1})}));candidates.sort((x,y)=>y.score-x.score);if(!candidates.length)return {text:'Bu soru için indekslenmiş PDF metninde yeterli eşleşme bulamadım. Makale PDF’sini MAKALE sekmesinde bir kez açarak metni indeksleyin.',refs:[]};const top=candidates.slice(0,4);return {text:top.map(x=>x.s).join(' '),refs:top.map(x=>x.page)}}
function similarArticles(a){return state.articles.filter(x=>x.id!==a.id).map(x=>({a:x,s:searchScore(x,[a.topic,...(a.tags||[]),...normalizeWords(a.title).slice(0,8)].join(' '))})).filter(x=>x.s>0).sort((x,y)=>y.s-x.s).slice(0,5).map(x=>x.a)}
function renderArticleAssistant(tab,a){const sm=a.aiSummary||localAcademicSummary(a);if(sm&&!a.aiSummary){a.aiSummary=sm;save()}const sims=similarArticles(a);tab.innerHTML=`<div class="assistant-grid"><section class="assistant-card"><div class="section-head"><h3>✦ Otomatik Akademik Özet</h3><button class="mini-btn" id="regenSummary">Yenile</button></div>${sm?`<dl class="academic-summary"><dt>Amaç</dt><dd>${esc(sm.purpose||'Belirlenemedi')}</dd><dt>Yöntem</dt><dd>${esc(sm.methods||'Belirlenemedi')}</dd><dt>Bulgular</dt><dd>${esc(sm.results||'Belirlenemedi')}</dd><dt>Sonuç</dt><dd>${esc(sm.conclusion||'Belirlenemedi')}</dd><dt>Kısıtlılıklar</dt><dd>${esc(sm.limitations||'Metinde açık bir kısıtlılık cümlesi bulunamadı.')}</dd></dl>`:`<div class="empty compact">Özet oluşturmak için PDF’yi MAKALE sekmesinde bir kez açın.</div>`}<button class="primary-btn" id="appendAiSummary" ${sm?'':'disabled'}>Özetim’e Ekle</button></section><section class="assistant-card"><h3>💬 Makaleye Sor</h3><div class="ask-row"><input id="articleQuestion" placeholder="Örn. Örneklem kaç kişi? VEMP açısından ana sonuç ne?"/><button class="primary-btn" id="askArticle">Sor</button></div><div id="articleAnswer" class="answer-box">Cevaplar bu makalenin indekslenmiş PDF metninden ve sayfa referanslarıyla üretilir.</div></section><section class="assistant-card full"><h3>🔗 Benzer Makaleler</h3>${sims.length?articleList(sims):'<div class="empty compact">Benzer makale bulunamadı.</div>'}</section></div>`;wireArticleList();$('#regenSummary').onclick=()=>{a.aiSummary=localAcademicSummary(a);save();renderArticle()};$('#appendAiSummary').onclick=()=>{const x=a.aiSummary;if(!x)return;a.summary=(a.summary||'').trimEnd()+`${a.summary?.trim()?'\n\n':''}Amaç\n${x.purpose||''}\n\nYöntem\n${x.methods||''}\n\nBulgular\n${x.results||''}\n\nSonuç\n${x.conclusion||''}\n\nKısıtlılıklar\n${x.limitations||''}`;save();toast('Otomatik özet Özetim’e eklendi')};$('#askArticle').onclick=()=>{const q=$('#articleQuestion').value.trim();if(!q)return;const ans=answerFromArticle(a,q);$('#articleAnswer').innerHTML=`<p>${esc(ans.text)}</p>${ans.refs.length?`<small>Kaynak sayfalar: ${[...new Set(ans.refs)].join(', ')}</small>`:''}`};$('#articleQuestion').onkeydown=e=>{if(e.key==='Enter')$('#askArticle').click()}}
function renderCompare(){setHeader('Makale Karşılaştır','Seçtiğiniz çalışmaları yöntem, örneklem, bulgu ve not açısından yan yana görün.',false);content.innerHTML=`<div class="compare-picker"><div class="section-head"><h2>Makaleleri seçin</h2><button class="primary-btn" id="buildCompare">Karşılaştır</button></div><div class="compare-checks">${state.articles.map(a=>`<label><input type="checkbox" data-compare-id="${a.id}"> <span>${esc(a.title)}</span><small>${esc(a.authors||'')} · ${a.year||''}</small></label>`).join('')}</div></div><div id="compareResult"></div>`;$('#buildCompare').onclick=()=>{const ids=[...document.querySelectorAll('[data-compare-id]:checked')].map(x=>x.dataset.compareId);const list=state.articles.filter(a=>ids.includes(a.id));if(list.length<2){toast('En az 2 makale seçin');return}$('#compareResult').innerHTML=compareTable(list)}}
function compareTable(list){return `<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Alan</th>${list.map(a=>`<th>${esc(a.title)}</th>`).join('')}</tr></thead><tbody><tr><th>Yazar/Yıl</th>${list.map(a=>`<td>${esc(a.authors||'')} (${a.year||''})</td>`).join('')}</tr><tr><th>Konu</th>${list.map(a=>`<td>${esc(courseById(a.courseId)?.name||'')} → ${esc(a.topic||'')}</td>`).join('')}</tr><tr><th>Yöntem</th>${list.map(a=>`<td>${esc((a.aiSummary||localAcademicSummary(a))?.methods||'—')}</td>`).join('')}</tr><tr><th>Bulgular</th>${list.map(a=>`<td>${esc((a.aiSummary||localAcademicSummary(a))?.results||'—')}</td>`).join('')}</tr><tr><th>Sonuç</th>${list.map(a=>`<td>${esc((a.aiSummary||localAcademicSummary(a))?.conclusion||'—')}</td>`).join('')}</tr><tr><th>Kendi notlarım</th>${list.map(a=>`<td>${esc(a.summary||'—')}</td>`).join('')}</tr></tbody></table></div>`}
function renderInsights(){setHeader('Akademik Asistan','Tüm kütüphanede kavramsal arama ve çalışma keşfi.',false);content.innerHTML=`<div class="assistant-card library-assistant"><h2>🔎 Kütüphaneye Sor</h2><p>Başlık, özet, kendi notlarınız, alıntılar ve PDF metni birlikte taranır.</p><div class="ask-row"><input id="libraryQuestion" placeholder="Örn. Vestibüler migrende VEMP amplitüdü düşük bulunan çalışmalar"/><button class="primary-btn" id="askLibrary">Ara</button></div><div id="libraryAnswer"></div></div>`;$('#askLibrary').onclick=()=>{const q=$('#libraryQuestion').value.trim();if(!q)return;const list=searchArticles(q).slice(0,12);$('#libraryAnswer').innerHTML=`<div class="section-head"><h3>${list.length} ilgili çalışma</h3></div>${articleList(list)}`;wireArticleList()};$('#libraryQuestion').onkeydown=e=>{if(e.key==='Enter')$('#askLibrary').click()}}

async function exportFullBackup(){if(typeof JSZip==='undefined'){toast('ZIP modülü yüklenemedi; internet bağlantısını kontrol edin.');return}const zip=new JSZip();const manifest={version:2,exportedAt:new Date().toISOString(),courses:state.courses,articles:state.articles.map(a=>{const {pageTexts,...x}=a;return x}),settings:state.settings||{}};zip.file('manifest.json',JSON.stringify(manifest,null,2));for(const a of state.articles){if(a.pdfKey){const f=await getFile(a.pdfKey);if(f)zip.file(`files/${a.pdfKey}.pdf`,f)}if(a.summaryPdfKey){const f=await getFile(a.summaryPdfKey);if(f)zip.file(`files/${a.summaryPdfKey}.pdf`,f)}const pages=articlePages(a);if(pages.length)zip.file(`index/${a.id}.json`,JSON.stringify(pages))}const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(blob,`odyoloji-tam-yedek-${new Date().toISOString().slice(0,10)}.zip`);toast('Tam yedek oluşturuldu')}
async function importFullBackup(file){if(typeof JSZip==='undefined'){toast('ZIP modülü yüklenemedi.');return}try{const zip=await JSZip.loadAsync(file);const mf=zip.file('manifest.json');if(!mf)throw new Error('manifest yok');const data=JSON.parse(await mf.async('text'));if(!Array.isArray(data.articles)||!Array.isArray(data.courses))throw new Error('geçersiz manifest');state.courses=data.courses;state.articles=data.articles;state.settings=data.settings||{};state.indexCache={};for(const a of state.articles){for(const key of [a.pdfKey,a.summaryPdfKey].filter(Boolean)){const zf=zip.file(`files/${key}.pdf`);if(zf)await putFile(key,await zf.async('blob'))}const ix=zip.file(`index/${a.id}.json`);if(ix){const pages=JSON.parse(await ix.async('text'));state.indexCache[a.id]=pages;await putIndex(a.id,pages)}}save();render();toast('Tam yedek geri yüklendi')}catch(e){console.error(e);toast('Yedek dosyası geri yüklenemedi')}}
async function hydrateIndexCache(){state.indexCache=state.indexCache||{};let migrated=false;for(const a of state.articles){if(a.pageTexts?.length){state.indexCache[a.id]=a.pageTexts;await putIndex(a.id,a.pageTexts);delete a.pageTexts;migrated=true}else{const pages=await getIndex(a.id);if(pages?.length)state.indexCache[a.id]=pages}}if(migrated)save()}

function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function csvCell(v){return `"${String(v??'').replace(/"/g,'""')}"`}
function exportArticlesCsv(list,title='makaleler'){const heads=['Başlık','Yazarlar','Yıl','Dergi','DOI','Ders','Konu','Okuma Durumu','Tez Bölümü','Amaç','Örneklem','Yöntem','Testler','Temel Bulgu','Sınırlılıklar','Tez İçin Önemi','Notlar','APA'];const rows=list.map(a=>{const r=researchOf(a);return[a.title,a.authors,a.year,a.journal,a.doi,courseById(a.courseId)?.name,a.topic,readStatusLabel(a.readStatus),a.thesisSection||'',r.aim,r.sample,r.method,r.tests,r.finding,r.limits,r.relevance,a.summary,apa(a)]});const table=`<table><tr>${heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x??'')}</td>`).join('')}</tr>`).join('')}</table>`;downloadBlob(new Blob([`<html><meta charset=\"utf-8\"><body>${table}</body></html>`],{type:'application/vnd.ms-excel'}),`${title.replace(/\W+/g,'_')}.xls`)}
function exportArticlesDoc(list,title='Kaynaklar'){const body=list.map(a=>{const r=researchOf(a);return`<h2>${esc(a.title)}</h2><p><b>${esc(a.authors||'')}</b> (${a.year||''})</p><p><b>Durum:</b> ${readStatusLabel(a.readStatus)} ${a.thesisSection?' · <b>Tez:</b> '+esc(a.thesisSection):''}</p><p><b>Amaç:</b> ${esc(r.aim||'-')}</p><p><b>Örneklem:</b> ${esc(r.sample||'-')}</p><p><b>Yöntem:</b> ${esc(r.method||'-')}</p><p><b>Testler:</b> ${esc(r.tests||'-')}</p><p><b>Temel bulgu:</b> ${esc(r.finding||'-')}</p><p><b>Sınırlılıklar:</b> ${esc(r.limits||'-')}</p><p><b>Tezim için önemi:</b> ${esc(r.relevance||'-')}</p><p><b>Notlar:</b><br>${esc(a.summary||'').replace(/\n/g,'<br>')}</p><p><i>${esc(apa(a))}</i></p><hr>`}).join('');downloadBlob(new Blob([`<html><meta charset="utf-8"><body><h1>${esc(title)}</h1>${body}</body></html>`],{type:'application/msword'}),`${title.replace(/\W+/g,'_')}.doc`)}
async function indexPdfFile(file){if(!file||typeof pdfjsLib==='undefined')return [];try{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const tc=await (await pdf.getPage(i)).getTextContent();pages.push(tc.items.map(x=>x.str||'').join(' ').replace(/\s+/g,' ').trim())}return pages}catch(e){console.warn(e);return []}}
async function bulkAddPdfs(files){const arr=[...files];if(!arr.length)return;toast(`${arr.length} PDF işleniyor…`);for(const file of arr){try{const meta=await extractPdfMetadata(file);const doi=meta?.doi||'';const cr=doi?await crossrefByDoi(doi):null;const m={...meta,...(cr||{})};const key=crypto.randomUUID();await putFile(key,file);const pages=await indexPdfFile(file);const id=crypto.randomUUID();state.indexCache[id]=pages;await putIndex(id,pages);state.articles.unshift({id,title:m.title||file.name.replace(/\.pdf$/i,''),authors:m.authors||'',year:m.year||'',journal:m.journal||'',doi:m.doi||'',courseId:state.courses[0].id,topic:state.courses[0].topics[0],tags:[],summary:'',favorite:false,thesis:false,reread:false,readStatus:'unread',thesisSection:'',research:{aim:'',sample:'',method:'',tests:'',finding:'',limits:'',relevance:''},createdAt:Date.now(),pdfKey:key,summaryPdfKey:null,smartNotes:[]})}catch(e){console.error(e)}}save();render();toast('Toplu PDF ekleme tamamlandı')}

function metaHtml(a){return`<aside class="meta-card"><h3>Makale Bilgileri</h3><dl><dt>Ders</dt><dd>${esc(courseById(a.courseId)?.name||'')}</dd><dt>Konu</dt><dd>${esc(a.topic||'')}</dd><dt>Yıl</dt><dd>${a.year||''}</dd><dt>Dergi</dt><dd>${esc(a.journal||'-')}</dd><dt>DOI</dt><dd>${esc(a.doi||'-')}</dd><dt>Okuma</dt><dd>${readStatusLabel(a.readStatus)}</dd><dt>Tez bölümü</dt><dd>${esc(a.thesisSection||'-')}</dd></dl><div class="chips">${(a.tags||[]).map(t=>`<span class="chip">#${esc(t)}</span>`).join('')}</div></aside>`}
function showApa(list,title){setHeader(`APA 7 · ${title}`,`${list.length} kaynak`,true);const sorted=[...list].sort((a,b)=>(a.authors||'').localeCompare(b.authors||'','tr'));content.innerHTML=`<div class="apa-card"><div class="section-head" style="margin:0 0 12px"><h2>Kaynakça</h2><button class="primary-btn" id="copyAll">Tümünü Kopyala</button></div><textarea id="apaAll" readonly>${esc(sorted.map(apa).join('\n\n'))}</textarea></div>`;$('#copyAll').onclick=()=>navigator.clipboard.writeText($('#apaAll').value).then(()=>toast('Kaynakça kopyalandı'))}
function fillCourseSelect(selected){const sel=$('#course');sel.innerHTML=state.courses.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');fillTopics()}
function fillTopics(selected){const c=courseById($('#course').value);$('#topic').innerHTML=(c?.topics||[]).map(t=>`<option ${t===selected?'selected':''}>${esc(t)}</option>`).join('')}


function setPdfMetaStatus(message,type='info'){
 const el=$('#pdfMetaStatus'); if(!el)return;
 el.className=`pdf-meta-status ${type}`; el.textContent=message||'';
}
function cleanPdfText(s=''){return String(s).replace(/\s+/g,' ').replace(/\u00ad/g,'').trim()}
function initialsFromGiven(given=''){return given.split(/[\s-]+/).filter(Boolean).map(x=>x[0]?.toUpperCase()+'.').join(' ')}
function crossrefAuthors(list=[]){return list.map(a=>{const fam=cleanPdfText(a.family||'');const given=cleanPdfText(a.given||'');return fam?`${fam}, ${initialsFromGiven(given)}`:cleanPdfText(a.name||given)}).filter(Boolean).join('; ')}
function firstValue(v){return Array.isArray(v)?v[0]:v}
async function crossrefByDoi(doi){
 try{
  const clean=String(doi||'').replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').trim();
  if(!clean)return null;
  const r=await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`,{headers:{'Accept':'application/json'}});
  if(!r.ok)return null;
  const m=(await r.json()).message||{};
  // Publication year must come from bibliographic publication metadata, never deposit/creation year.
  const year=m.published?.['date-parts']?.[0]?.[0]
    ||m['published-print']?.['date-parts']?.[0]?.[0]
    ||m['published-online']?.['date-parts']?.[0]?.[0]
    ||m.issued?.['date-parts']?.[0]?.[0]
    ||'';
  return {title:cleanPdfText(firstValue(m.title)||''),authors:crossrefAuthors(m.author||[]),year,journal:cleanPdfText(firstValue(m['container-title'])||''),doi:cleanPdfText(m.DOI||clean),verifiedBy:'Crossref DOI'};
 }catch(e){return null}
}
function detectDoi(text=''){
 const m=text.match(/10\.\d{4,9}\/[\-._;()/:A-Z0-9]+/i);
 return m?m[0].replace(/[.,;:)\]]+$/,''):'';
}
function likelyYear(text=''){
 const years=[...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m=>Number(m[1])).filter(y=>y>=1900&&y<=new Date().getFullYear()+1);
 return years[0]||'';
}
function guessTitleAndAuthors(lines=[]){
 const cleaned=lines.map(cleanPdfText).filter(x=>x.length>2).slice(0,50);
 const skip=/^(abstract|summary|özet|keywords?|doi|received|accepted|published|copyright|original article|research article|introduction)\b/i;
 const titleCandidates=cleaned.filter(x=>!skip.test(x)&&x.length>=20&&x.length<=260&&!/^(https?:|www\.)/i.test(x));
 let title=titleCandidates[0]||'';
 // A title often spans 2 lines before author names.
 if(title && title.length<90){const i=cleaned.indexOf(title);const next=cleaned[i+1]||'';if(next.length>15&&next.length<180&&!/@|\b(university|department|hospital|faculty|clinic)\b/i.test(next)&&!/[;]|\bORCID\b/i.test(next)){title=`${title} ${next}`}}
 const ti=cleaned.findIndex(x=>title.startsWith(x));
 const authorZone=cleaned.slice(Math.max(0,ti+1),Math.max(0,ti+7));
 let authorLine=authorZone.find(x=>x.length<220&&(/[;,]/.test(x)||(/\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+/.test(x)))&&!/@|\b(university|department|hospital|faculty|clinic|abstract)\b/i.test(x))||'';
 authorLine=authorLine.replace(/\d+/g,'').replace(/[∗*†‡]/g,'').replace(/\s+/g,' ').trim();
 if(authorLine){
  const parts=authorLine.split(/\s*(?:,|;|\band\b|\bve\b|&)\s*/i).filter(Boolean);
  if(parts.length>1) authorLine=parts.map(n=>{const z=n.trim().split(/\s+/);if(z.length<2)return n.trim();const family=z.pop();return `${family}, ${z.map(x=>x[0]?.toUpperCase()+'.').join(' ')}`}).join('; ')
 }
 return {title,authors:authorLine};
}
async function extractPdfMetadata(file){
 if(!file)return null;
 if(typeof pdfjsLib==='undefined')throw new Error('PDF okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.');
 pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 const data=await file.arrayBuffer();
 const pdf=await pdfjsLib.getDocument({data}).promise;
 let info={}; try{info=(await pdf.getMetadata()).info||{}}catch(e){}
 const lines=[]; let all='';
 for(let p=1;p<=Math.min(pdf.numPages,3);p++){
  const page=await pdf.getPage(p);const tc=await page.getTextContent();
  const pageLines=[];let lastY=null,current='';
  for(const it of tc.items){const y=Math.round(it.transform?.[5]||0);if(lastY!==null&&Math.abs(y-lastY)>3){if(current.trim())pageLines.push(current.trim());current=''}current+=(current?' ':'')+(it.str||'');lastY=y}
  if(current.trim())pageLines.push(current.trim());
  lines.push(...pageLines); all+=' '+pageLines.join(' ');
 }
 const guessed=guessTitleAndAuthors(lines);
 let result={
  title:cleanPdfText(info.Title||guessed.title||''),
  authors:cleanPdfText(info.Author||guessed.authors||''),
  year:likelyYear(info.CreationDate||all),
  journal:'',
  doi:detectDoi(`${info.Subject||''} ${info.Keywords||''} ${all}`)
 };
 if(result.doi){
  const cr=await crossrefByDoi(result.doi);
  if(cr){
   // DOI metadata has priority over PDF heuristics for bibliographic fields.
   result={...result,...Object.fromEntries(Object.entries(cr).filter(([,v])=>v))};
  }
 }
 return result;
}
function applyDetectedMetadata(m){
 if(!m)return;
 const isEditing=!!$('#articleForm')?.dataset?.editId;
 const map={title:m.title,authors:m.authors,year:m.year,journal:m.journal,doi:m.doi};
 for(const [id,val] of Object.entries(map)){
  const el=$('#'+id);
  if(!el||val===undefined||val===null||String(val).trim()==='')continue;
  // Yeni makalede PDF/DOI metadata'sı form varsayılanlarının üzerine yazmalıdır.
  // Düzenleme ekranında ise kullanıcının mevcut künyesini ezmemek için yalnızca boş alanları doldurur.
  if(!isEditing || !String(el.value||'').trim()) el.value=val;
 }
}
async function autoFillFromPdf(file){
 if(!file)return;
 setPdfMetaStatus('PDF okunuyor; makale bilgileri otomatik aranıyor…','loading');
 try{
  const m=await extractPdfMetadata(file); applyDetectedMetadata(m);
  const found=[m?.title&&'başlık',m?.authors&&'yazarlar',m?.year&&'yıl',m?.journal&&'dergi',m?.doi&&'DOI'].filter(Boolean);
  const verified=m?.verifiedBy?` DOI ile doğrulandı (${m.verifiedBy})${m?.year?`; yayın yılı: ${m.year}`:''}.`:' PDF içinden tahmin edildi; kaydetmeden önce kontrol edin.';
  setPdfMetaStatus(found.length?`Otomatik dolduruldu: ${found.join(', ')}.${verified}`:'PDF okundu ancak güvenilir künye bilgisi bulunamadı. Alanları elle doldurabilirsiniz.',found.length?'success':'warn');
 }catch(err){setPdfMetaStatus(err.message||'PDF bilgileri otomatik okunamadı.','warn')}
}

function openArticleDialog(a=null){const f=$('#articleForm');f.dataset.editId=a?.id||'';f.reset();if(!a)$('#year').value='';setPdfMetaStatus('');fillCourseSelect(a?.courseId||state.courseId||state.courses[0].id);if(a){$('#title').value=a.title||'';$('#authors').value=a.authors||'';$('#year').value=a.year||'';$('#journal').value=a.journal||'';$('#doi').value=a.doi||'';$('#course').value=a.courseId;fillTopics(a.topic);$('#topic').value=a.topic||'';$('#tags').value=(a.tags||[]).join(', ');$('#summary').value=a.summary||'';$('#favorite').checked=!!a.favorite;$('#reread').checked=!!a.reread;$('#readStatus').value=a.readStatus||'unread';$('#thesisSection').value=a.thesisSection||'';const r=researchOf(a);$('#researchAim').value=r.aim||'';$('#researchSample').value=r.sample||'';$('#researchMethod').value=r.method||'';$('#researchTests').value=r.tests||'';$('#researchFinding').value=r.finding||'';$('#researchLimits').value=r.limits||'';$('#researchRelevance').value=r.relevance||''}else{$('#readStatus').value='unread';$('#thesisSection').value=''}$('#articleDialog').showModal()}
$('#course').addEventListener('change',()=>fillTopics());
$('#pdfFile').addEventListener('change',e=>autoFillFromPdf(e.target.files?.[0]));

$('#articleForm').addEventListener('submit',async e=>{e.preventDefault();const editId=e.currentTarget.dataset.editId;const existing=state.articles.find(a=>a.id===editId);const file=$('#pdfFile').files[0];const summaryFile=$('#summaryPdfFile').files[0];let pdfKey=existing?.pdfKey||null;let summaryPdfKey=existing?.summaryPdfKey||null;if(file){pdfKey=existing?.pdfKey||crypto.randomUUID();await putFile(pdfKey,file)}if(summaryFile){summaryPdfKey=existing?.summaryPdfKey||crypto.randomUUID();await putFile(summaryPdfKey,summaryFile)}const id=existing?.id||crypto.randomUUID();if(file){const pages=await indexPdfFile(file);state.indexCache[id]=pages;await putIndex(id,pages)}const a={id,title:$('#title').value.trim(),authors:$('#authors').value.trim(),year:Number($('#year').value)||'',journal:$('#journal').value.trim(),doi:$('#doi').value.trim(),courseId:$('#course').value,topic:$('#topic').value,tags:$('#tags').value.split(',').map(x=>x.trim()).filter(Boolean),summary:$('#summary').value,favorite:$('#favorite').checked,thesis:$('#favorite').checked,reread:$('#reread').checked,readStatus:$('#readStatus').value||'unread',thesisSection:$('#thesisSection').value||'',research:{aim:$('#researchAim').value.trim(),sample:$('#researchSample').value.trim(),method:$('#researchMethod').value.trim(),tests:$('#researchTests').value.trim(),finding:$('#researchFinding').value.trim(),limits:$('#researchLimits').value.trim(),relevance:$('#researchRelevance').value.trim()},createdAt:existing?.createdAt||Date.now(),pdfKey,summaryPdfKey};if(existing)Object.assign(existing,a);else state.articles.unshift(a);save();$('#articleDialog').close();state.currentArticleId=a.id;state.view='article';state.articleTab='summary';render();toast(existing?'Makale güncellendi':'Makale eklendi')});
$('#courseForm').addEventListener('submit',e=>{e.preventDefault();const name=$('#courseName').value.trim();const topics=$('#courseTopics').value.split(',').map(x=>x.trim()).filter(Boolean);state.courses.push({id:name.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g,'-'),name,topics});save();$('#courseDialog').close();e.target.reset();render();toast('Yeni alan eklendi')});
$('#addArticleBtn').onclick=()=>openArticleDialog();$('#bulkBtn').onclick=()=>$('#bulkPdfFile').click();$('#bulkPdfFile').onchange=e=>bulkAddPdfs(e.target.files).finally(()=>{e.target.value='' });
$('#backBtn').onclick=()=>{if(state.view==='article'){state.view=state.topic?'topic':state.courseId?'course':'home'}else if(state.view==='topic'){state.view='course'}else if(state.view==='course'){state.view='home'}else state.view='home';render()};
document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.courseId=null;state.topic=null;state.search='';render()});
$('#exportBtn').onclick=()=>exportFullBackup();
$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=e=>{const file=e.target.files[0];if(file)importFullBackup(file).finally(()=>{e.target.value=''})};
bootstrapCloud();
