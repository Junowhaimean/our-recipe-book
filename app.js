import { allRecipes, putRecipe, getRecipe } from './db.js';
import {
  getCloudConfig, setCloudConfig, getHouseholdId, setHouseholdId, isConfigured,
  getSession, connectDevice, signOut, getHouseholds, createHousehold,
  joinHousehold, syncNow, onSyncChange, startAutoSync, isSyncing, getLastSyncError
} from './sync.js';

const CATEGORIES = ['Breakfast','Lunch','Dinner','Sides','Dessert','Snacks','Drinks','Other'];
const STATUS = {'to-try':'To try','favorite':'Favorite','needs-work':'Adjustments'};
const state = {recipes: [], view:'all', search:'', category:'all', limit:30, session:null, syncing:false};
const $ = (sel,root=document) => root.querySelector(sel);
const el = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = status => ['favorite','needs-work'].includes(status) ? status : '';
const active = () => state.recipes.filter(r => !r.deletedAt);
const fmtDate = iso => {try{return new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}catch{return '';}};
const validImage = value => typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
const validUrl = value => {try{const u = new URL(value);return ['https:','http:'].includes(u.protocol) ? u.href : '';}catch{return '';}};
let toastTimer;
function toast(message) {
  const box = el('toast'); box.textContent = message; box.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('show'), 4200);
}
function counts() {
  const data = active();
  return {all: data.length, 'to-try': data.filter(r => r.status === 'to-try').length,
    favorite: data.filter(r => r.status === 'favorite').length,
    'needs-work': data.filter(r => r.status === 'needs-work').length};
}
function filtered() {
  const query = state.search.trim().toLowerCase();
  return active().filter(r => (state.view === 'all' || r.status === state.view) &&
    (state.category === 'all' || r.category === state.category) &&
    (!query || [r.title,r.ingredients,r.instructions,r.notes,r.category,r.sourceUrl].join(' ').toLowerCase().includes(query)))
    .sort((a,b) => Date.parse(b.updatedAt || 0)-Date.parse(a.updatedAt || 0));
}
function recipeCard(r) {
  const hasPhoto = validImage(r.photo);
  return `<button type="button" class="recipe-card" data-recipe="${escapeHtml(r.id)}" aria-label="View ${escapeHtml(r.title)}">
   ${hasPhoto ? `<img class="recipe-image" src="${r.photo}" alt="">` : `<div class="recipe-image no-image" aria-hidden="true">✳</div>`}
   <div class="recipe-info"><span class="tag ${slug(r.status)}">${STATUS[r.status] || 'To try'}</span>
   <h3>${escapeHtml(r.title)}</h3><div class="meta"><span>◦</span> ${escapeHtml(r.category || 'Other')}
   ${r.cookMinutes ? `<span> · ${Number(r.cookMinutes)} min cook</span>` : ''}</div></div></button>`;
}
function renderGrid() {
  const data = filtered();
  const shown = data.slice(0,state.limit);
  const root = el('recipe-results'); if (!root) return;
  el('result-count').textContent = `${data.length} ${data.length===1?'recipe':'recipes'}`;
  if (!data.length) {
    const isNoRecipes = counts().all === 0;
    root.innerHTML = `<div class="empty-state"><div class="empty-icon">${isNoRecipes?'🥘':'⌕'}</div>
      <h3>${isNoRecipes?'Your cookbook starts here':'No matching recipes'}</h3>
      <p>${isNoRecipes ? 'Start by importing a recipe screenshot or adding a recipe you want to try.' : 'Try a different search, category or collection.'}</p>
      ${isNoRecipes ? '<button class="primary" data-action="add">＋ Add your first recipe</button>' : '<button class="secondary" data-action="clear-filters">Clear filters</button>'}
    </div>`;
  } else root.innerHTML = `<div class="recipe-grid">${shown.map(recipeCard).join('')}</div>${data.length>state.limit?`<div style="text-align:center;margin:25px 0"><button class="secondary" data-action="show-more">Show more (${data.length-shown.length} remaining)</button></div>`:''}`;
}
function render() {
  const c = counts();
  const nav = [{id:'all',label:'All recipes',symbol:'▦'},{id:'to-try',label:'To try',symbol:'◷'},
    {id:'favorite',label:'Favorites',symbol:'♡'},{id:'needs-work',label:'Adjustments',symbol:'✎'}];
  const cloudLabel = !isConfigured() ? 'Saved on this device' : (getLastSyncError() ? 'Sync needs attention' : getHouseholdId() ? 'Shared collection' : 'Cloud setup pending');
  const dot = !isConfigured() ? '' : getLastSyncError() ? 'error' : getHouseholdId() ? 'live' : '';
  const heading = state.view === 'all' ? 'Your kitchen, organized.' :
    state.view === 'to-try' ? 'Recipes to discover.' : state.view === 'favorite' ? 'Worth making again.' : 'Refine & retry.';
  el('app').innerHTML = `<div class="app-shell">
    <aside class="sidebar"><div class="brand"><div class="brand-icon">✳</div><div><div class="brand-name">Our Recipes</div><div class="brand-small">A family cookbook</div></div></div>
      <div class="nav-section">Your collection</div>
      ${nav.map(n => `<button class="nav-btn ${state.view===n.id?'active':''}" data-view="${n.id}"><span class="emoji">${n.symbol}</span>${n.label}<span class="count">${c[n.id]}</span></button>`).join('')}
      <div class="nav-section">Manage</div><button class="nav-btn" data-action="settings"><span class="emoji">⚙</span>Settings & backup</button>
      <div class="side-footer"><strong>Owned by you</strong> Your recipes stay on this device and can be backed up as one portable file.</div>
    </aside>
    <main class="content">
      <div class="topline"><span class="eyebrow">THE HOUSEHOLD COOKBOOK</span>
        <div class="top-actions"><span class="sync-status"><span class="status-dot ${dot}"></span>${escapeHtml(cloudLabel)}</span>
          <button class="icon-btn" data-action="settings" title="Settings & backup" aria-label="Settings & backup">⚙</button>
          <button class="primary" data-action="add"><span aria-hidden="true">＋</span> Add recipe</button>
        </div></div>
      <div class="hero"><div><span class="eyebrow">WELCOME TO YOUR COLLECTION</span>
        <h1>${heading}</h1><p>Save the recipes you find. Keep the ones you love.</p></div>
        <div class="hero-art" aria-hidden="true">♨</div></div>
      <div class="stats"><div class="stat-card"><div><div class="stat-num">${c.all}</div><div class="stat-title">Saved recipes</div></div><div class="stat-icon">▦</div></div>
        <div class="stat-card"><div><div class="stat-num">${c['to-try']}</div><div class="stat-title">Waiting to try</div></div><div class="stat-icon">◷</div></div>
        <div class="stat-card"><div><div class="stat-num">${c.favorite}</div><div class="stat-title">Favorites</div></div><div class="stat-icon">♡</div></div></div>
      <div class="toolbar"><label class="search-wrap"><span>⌕</span><input id="search" type="search" aria-label="Search recipes" placeholder="Find a recipe or ingredient…" value="${escapeHtml(state.search)}"></label>
        <select id="category-filter" class="category-select" aria-label="Filter category"><option value="all">All categories</option>${CATEGORIES.map(n => `<option value="${n}" ${state.category===n?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="collection-head"><h2>${state.view==='all'?'All recipes': nav.find(n=>n.id===state.view)?.label}</h2><span id="result-count"></span></div>
      <div id="recipe-results"></div>
    </main></div>
    <nav class="bottom-nav" aria-label="Collections">${[...nav.slice(0,3), {id:'settings',label:'Settings',symbol:'⚙'}].map(n=>`<button data-${n.id==='settings'?'action':'view'}="${n.id}" class="${state.view===n.id?'active':''}"><span>${n.symbol}</span>${n.label}</button>`).join('')}</nav>`;
  renderGrid();
  $('#search').addEventListener('input', e => {state.search=e.target.value;state.limit=30;renderGrid();});
  $('#category-filter').addEventListener('change',e => {state.category=e.target.value;state.limit=30;renderGrid();});
}
function modal(title, content, wide=false) {
  el('modal-root').innerHTML = `<div class="overlay" id="overlay"><div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="close" type="button" data-action="close" aria-label="Close">×</button></div><div class="modal-content">${content}</div></div></div>`;
  $('#overlay').addEventListener('click',e => {if(e.target.id==='overlay') closeModal();});
}
function closeModal() { el('modal-root').innerHTML = ''; }
async function reload() { state.recipes = await allRecipes(); render(); }
function optionList(current) {return CATEGORIES.map(x=>`<option value="${x}" ${current===x?'selected':''}>${x}</option>`).join('');}
async function choosePhoto(file) {
  if (!file?.type.startsWith('image/')) throw new Error('Choose a photo or screenshot.');
  if (file.size > 40*1024*1024) throw new Error('This image is too large. Choose one under 40 MB.');
  const img = new Image(); const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Could not read this picture.'));img.src=objectUrl;});
    const max = 1280, scale = Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.78);
  } finally { URL.revokeObjectURL(objectUrl); }
}
let editingPhoto = null;
async function showEditor(id='') {
  const existing = id ? await getRecipe(id) : null;
  if (id && !existing) return toast('Recipe could not be found.');
  editingPhoto = existing?.photo || null;
  modal(existing?'Edit recipe':'Add a recipe', `<form id="recipe-form">
    <div class="form-grid">
      <div class="field full"><label for="title">Recipe name *</label><input id="title" name="title" required maxlength="200" placeholder="e.g. Lemon garlic chicken" value="${escapeHtml(existing?.title || '')}"></div>
      <div class="field"><label for="category">Category</label><select name="category" id="category">${optionList(existing?.category || 'Dinner')}</select></div>
      <div class="field"><label for="status">Collection</label><select name="status" id="status">${Object.entries(STATUS).map(([key,txt])=>`<option value="${key}" ${existing?.status===key?'selected':''}>${txt}</option>`).join('')}</select></div>
      <div class="field full"><label>Recipe screenshot or photo</label><div class="photo-import"><div><label class="secondary" style="cursor:pointer" for="photo-input">▣ Choose screenshot<input id="photo-input" type="file" accept="image/*" style="display:none"></label>
        <p class="muted small" style="margin:7px 0 0">One image per recipe in this first version.</p></div>
        <div id="photo-preview">${validImage(editingPhoto)?`<img src="${editingPhoto}" alt="Selected screenshot">`:''}</div>
        <div class="actions"><button class="secondary" type="button" id="run-ocr" ${!editingPhoto?'disabled':''}>Read text from photo</button>
        <button class="secondary" type="button" id="remove-photo" ${!editingPhoto?'disabled':''}>Remove photo</button></div></div>
        <p class="muted small">Text recognition is optional and requires internet the first time. Always check ingredient amounts and steps.</p></div>
      <div class="field full"><label for="sourceUrl">Recipe website or social media link</label><input name="sourceUrl" id="sourceUrl" type="url" placeholder="https://…" value="${escapeHtml(existing?.sourceUrl || '')}"></div>
      <div class="field full"><label for="ingredients">Ingredients (one per line)</label><textarea id="ingredients" name="ingredients" rows="5" placeholder="1 cup flour&#10;2 eggs&#10;…">${escapeHtml(existing?.ingredients || '')}</textarea></div>
      <div class="field full"><label for="instructions">Directions</label><textarea id="instructions" name="instructions" rows="6" placeholder="1. Preheat the oven…">${escapeHtml(existing?.instructions || '')}</textarea></div>
      <div class="field full"><label for="notes">Your notes and changes</label><textarea id="notes" name="notes" rows="3" placeholder="Less salt next time, extra garlic…">${escapeHtml(existing?.notes || '')}</textarea></div>
      <div class="field"><label for="servings">Servings</label><input type="number" min="1" max="1000" id="servings" name="servings" value="${escapeHtml(existing?.servings || '')}"></div>
      <div class="field"><label for="prepMinutes">Prep minutes</label><input type="number" min="0" max="10000" id="prepMinutes" name="prepMinutes" value="${escapeHtml(existing?.prepMinutes ?? '')}"></div>
      <div class="field"><label for="cookMinutes">Cook minutes</label><input type="number" min="0" max="10000" id="cookMinutes" name="cookMinutes" value="${escapeHtml(existing?.cookMinutes ?? '')}"></div>
    </div>
    <div class="form-actions"><button class="secondary" type="button" data-action="close">Cancel</button><button class="primary" type="submit">${existing?'Save changes':'Save recipe'}</button></div>
  </form>`,true);
  $('#photo-input').addEventListener('change',async e => {
    if (!e.target.files?.length) return;
    try { editingPhoto=await choosePhoto(e.target.files[0]); $('#photo-preview').innerHTML=`<img src="${editingPhoto}" alt="Selected screenshot">`;
      $('#run-ocr').disabled=false;$('#remove-photo').disabled=false;
    } catch(error) { toast(error.message); }
  });
  $('#remove-photo').addEventListener('click', () => {editingPhoto=null;$('#photo-preview').innerHTML='';$('#run-ocr').disabled=true;$('#remove-photo').disabled=true;});
  $('#run-ocr').addEventListener('click',async e => {
    if(!editingPhoto) return;
    const button=e.target;button.disabled=true;button.textContent='Reading photo…';
    try {
      if (!window.Tesseract) {
        await new Promise((resolve,reject)=>{
          const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
          s.onload=resolve;s.onerror=()=>reject(new Error('Text recognition needs an internet connection.'));
          document.head.appendChild(s);
        });
      }
      const {data} = await window.Tesseract.recognize(editingPhoto,'eng');
      const text=(data?.text||'').trim();
      if (!text) throw new Error('No text was recognized. You can still save the screenshot.');
      const parsed=parseRecipeText(text);
      if (!$('#title').value.trim() && parsed.title) $('#title').value=parsed.title;
      if (parsed.ingredients) $('#ingredients').value = [$('#ingredients').value,parsed.ingredients].filter(Boolean).join('\n');
      if (parsed.instructions) $('#instructions').value = [$('#instructions').value,parsed.instructions].filter(Boolean).join('\n');
      if (!parsed.ingredients && !parsed.instructions) $('#instructions').value=[ $('#instructions').value,text ].filter(Boolean).join('\n');
      toast('Text added. Check the measurements and directions before saving.');
    } catch(error) {toast(error.message || 'Could not read photo.');}
    finally {button.disabled=false;button.textContent='Read text from photo';}
  });
  $('#recipe-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const title=String(form.get('title')||'').trim(); if(!title) return toast('Enter a recipe name.');
    const now=new Date().toISOString();
    const photoChanged=(existing?.photo||null)!==editingPhoto;
    const updated={
      ...existing, id:existing?.id||crypto.randomUUID(),title,category:String(form.get('category')),
      status:String(form.get('status')),sourceUrl:validUrl(String(form.get('sourceUrl')||'').trim()),
      ingredients:String(form.get('ingredients')||'').trim(),instructions:String(form.get('instructions')||'').trim(),
      notes:String(form.get('notes')||'').trim(),
      servings: numberField(form.get('servings')), prepMinutes:numberField(form.get('prepMinutes')),
      cookMinutes:numberField(form.get('cookMinutes')),
      photo: editingPhoto, imagePath: photoChanged ? '' : (existing?.imagePath||''),
      imageDirty: !!editingPhoto && photoChanged, createdAt:existing?.createdAt || now,
      updatedAt:now, deletedAt:null,dirty:true
    };
    try { await putRecipe(updated); closeModal(); await reload(); toast('Recipe saved on this device.');
      syncNow().then(async()=> {await reload();});
    } catch(error) { toast('Could not save: '+error.message); }
  });
  if (!existing) $('#title').focus();
}
function numberField(value) {const n=Number(value);return value!==''&&value!==null&&Number.isFinite(n)?n:'';}
function parseRecipeText(text) {
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const ingredients=[], instructions=[];let mode='';
  const ingredientHeader=/^(ingredients|what you need|you will need)\s*:?$/i;
  const stepsHeader=/^(instructions|directions|method|preparation|steps|how to make it)\s*:?$/i;
  for (const line of lines) {
    if (ingredientHeader.test(line)){mode='ingredients';continue;}
    if (stepsHeader.test(line)){mode='steps';continue;}
    if (mode==='ingredients') ingredients.push(line);
    if (mode==='steps') instructions.push(line);
  }
  return {title: lines.length && !ingredientHeader.test(lines[0]) && !stepsHeader.test(lines[0]) && lines[0].length <= 75 ? lines[0] : '',
    ingredients:ingredients.join('\n'),instructions:instructions.join('\n')};
}
async function showRecipe(id) {
  const r=await getRecipe(id);if(!r||r.deletedAt)return toast('Recipe not found.');
  const meta=[r.category,r.servings?`${r.servings} servings`:'',r.prepMinutes?`${r.prepMinutes} min prep`:'',r.cookMinutes?`${r.cookMinutes} min cook`:''].filter(Boolean);
  const safeLink=validUrl(r.sourceUrl);
  modal('Recipe details',`${validImage(r.photo)?`<img class="view-photo" src="${r.photo}" alt="Recipe photo">`:''}
    <div class="view-meta"><span class="tag ${slug(r.status)}">${STATUS[r.status]||'To try'}</span>${meta.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>
    <div class="view-title">${escapeHtml(r.title)}</div>
    ${r.ingredients ? `<div class="recipe-section"><h3>Ingredients</h3><pre>${escapeHtml(r.ingredients)}</pre></div>`:''}
    ${r.instructions ? `<div class="recipe-section"><h3>Directions</h3><pre>${escapeHtml(r.instructions)}</pre></div>`:''}
    ${r.notes ? `<div class="recipe-section"><h3>Personal notes</h3><pre>${escapeHtml(r.notes)}</pre></div>`:''}
    ${safeLink ? `<div class="recipe-section"><h3>Original source</h3><a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">Open recipe website ↗</a></div>`:''}
    ${!r.ingredients&&!r.instructions?'<div class="disclaimer" style="margin-top:20px">This recipe currently has a link or picture only. You can add the written ingredients and steps by editing it.</div>':''}
    <div class="form-actions" style="justify-content:space-between"><button class="danger" type="button" id="delete-recipe">Delete</button><div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="secondary" type="button" id="toggle-favorite">${r.status==='favorite'?'Remove favorite':'♡ Mark favorite'}</button><button class="primary" type="button" id="edit-recipe">✎ Edit recipe</button></div></div>`,true);
  $('#edit-recipe').addEventListener('click',()=>showEditor(r.id));
  $('#toggle-favorite').addEventListener('click',async()=>{
    const changed={...r,status:r.status==='favorite'?'to-try':'favorite',updatedAt:new Date().toISOString(),dirty:true};
    await putRecipe(changed);closeModal();await reload();toast('Collection updated.');syncNow().then(reload);
  });
  $('#delete-recipe').addEventListener('click',async()=>{
    if (!confirm(`Delete "${r.title}" from your cookbook? This will also remove it from the shared collection when synced.`)) return;
    await putRecipe({...r,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),photo:null,dirty:true});
    closeModal(); await reload(); toast('Recipe deleted.'); syncNow().then(reload);
  });
}
function downloadBackup(data) {
  const blob = new Blob([JSON.stringify({format:'our-recipe-book',version:1,exportedAt:new Date().toISOString(),recipes:data},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
  a.download=`our-recipes-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function exportBackup() {
  const data=active();
  if (!data.length) return toast('Add a recipe before making a backup.');
  const missingImages = data.filter(r => r.imagePath && !r.photo).length;
  if (missingImages) return toast(`${missingImages} cloud photos are not cached here. Connect to the internet and sync before exporting a complete backup.`);
  downloadBackup(data.map(({dirty,imageDirty,...fields}) => fields));
  toast('Backup prepared. Save the downloaded file to Files or your preferred backup location.');
}
async function importBackup(file) {
  const text=await file.text();if (text.length > 80_000_000)throw new Error('Backup is too large for the app.');
  const backup=JSON.parse(text);
  if (backup.format!=='our-recipe-book'||backup.version!==1||!Array.isArray(backup.recipes))throw new Error('This is not a valid Our Recipe Book v1 backup.');
  if(backup.recipes.length>15000)throw new Error('Too many recipes in this backup.');
  let count=0;const now=new Date();
  for(const raw of backup.recipes) {
    if (!raw||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>200) continue;
    const id= /^[\da-f-]{36}$/i.test(raw.id||'')?raw.id:crypto.randomUUID();
    const previous=await getRecipe(id);
    const r={
      id,title:raw.title.trim(),category:CATEGORIES.includes(raw.category)?raw.category:'Other',
      status:STATUS[raw.status]?raw.status:'to-try',
      ingredients:String(raw.ingredients||'').slice(0,100000),instructions:String(raw.instructions||'').slice(0,100000),
      notes:String(raw.notes||'').slice(0,100000),sourceUrl:validUrl(raw.sourceUrl),
      servings:numberField(raw.servings),prepMinutes:numberField(raw.prepMinutes),cookMinutes:numberField(raw.cookMinutes),
      photo:validImage(raw.photo)?raw.photo:null,imagePath:'',imageDirty:validImage(raw.photo),
      createdAt:previous?.createdAt || raw.createdAt || now.toISOString(),
      updatedAt:new Date(now.getTime()+count).toISOString(),deletedAt:null,dirty:true
    };
    await putRecipe(r); count++;
  }
  await reload();syncNow().then(reload);
  return count;
}
async function renderSettings() {
  const c=getCloudConfig();let session=null, households=[];
  let connectionError='';
  if (isConfigured()) {
    try {session=await getSession();state.session=session;if(session)households=await getHouseholds();}
    catch(e){connectionError=e.message;}
  }
  const h=households.find(x=>x.id===getHouseholdId())||households[0];
  if (h && !getHouseholdId()) setHouseholdId(h.id);
  const backupCount=counts().all;
  const configFields=`<form id="cloud-config-form" class="setup-fields">
      <div class="field"><label>Supabase project URL</label><input id="sb-url" type="url" required autocomplete="off" placeholder="https://xxxxxxxx.supabase.co" value="${escapeHtml(c.url||'')}"></div>
      <div class="field"><label>Publishable key (never a secret key)</label><input id="sb-key" type="text" required autocomplete="off" placeholder="sb_publishable_…" value="${escapeHtml(c.key||'')}"></div>
      <div class="actions"><button class="primary" type="submit">Save sharing settings</button></div>
    </form>`;
  const sharingPanel = !isConfigured() ? `<p>Sharing is optional. Set up a free Supabase project once, enable Anonymous Sign-Ins, then enter its public connection details on each device. No email account is needed in the app.</p>${configFields}` :
    connectionError ? `<div class="cloud-notice error">Connection issue: ${escapeHtml(connectionError)}</div>${configFields}` :
    !session ? `<p>The connection is configured. Activate this device to join your family collection. No email, password, or subscription is required.</p>
      <button class="primary" type="button" id="connect-device">Connect this device</button>
      <details style="margin-top:14px"><summary class="small muted">Change cloud connection</summary><div style="margin-top:12px">${configFields}</div></details>` :
    `<div class="cloud-notice success">This device is connected to your private cloud account.</div>
      ${h ? `<p><strong>${escapeHtml(h.name)}</strong> is linked to this device. Changes will sync when online.</p>
      <div class="code-box"><div><div class="small muted">Private invitation code for another device or family member</div><code>${escapeHtml(h.invite_code)}</code></div><button class="secondary" id="copy-invite">Copy code</button></div>
      <div class="actions" style="margin-top:12px"><button class="secondary" id="sync-now">${isSyncing()?'Syncing…':'↻ Sync now'}</button><button class="secondary" id="rotate-code">Generate new invite code</button></div>` :
      `<p>Create a household cookbook, or enter the invitation code from a device already connected.</p>
      <form id="create-household" class="setup-fields"><div class="field"><label>Library name</label><input name="name" maxlength="100" placeholder="Our Recipes" value="Our Recipes"></div><button class="primary" type="submit">Create our shared cookbook</button></form>
      <hr class="divider"><form id="join-household" class="setup-fields"><div class="field"><label>Household invite code</label><input name="code" required placeholder="Paste 24-character invite code"></div><button class="secondary" type="submit">Join existing cookbook</button></form>`}
      <div class="actions" style="margin-top:15px"><button class="secondary" id="cloud-signout">Disconnect this device</button></div>
      <details style="margin-top:14px"><summary class="small muted">Change cloud connection</summary><div style="margin-top:12px">${configFields}</div></details>`;
  modal('Settings & backups',`<div class="settings-panels">
    <section class="setting-panel"><h3>Keep your recipes forever</h3><p>Export all ${backupCount} saved recipes, including their cached pictures and notes, into one JSON file. Store copies in iCloud Drive, on a computer, or external storage. Import later even if this app or its cloud service disappears.</p>
      <div class="actions"><button class="primary" id="export-backup">↓ Export complete backup</button><label class="secondary" style="cursor:pointer" for="backup-file">↑ Restore / merge backup<input id="backup-file" type="file" accept="application/json,.json" style="display:none"></label></div>
      <p class="small">Restore merges recipes by ID and updates matching entries. Make a fresh backup before restoring.</p>
    </section>
    <section class="setting-panel"><h3>Share with your household</h3>${sharingPanel}
      <div class="disclaimer" style="margin-top:15px">Free cloud tiers can change or pause inactive projects. Keep your own backup file. Recipes on this device remain readable offline; syncing needs internet.</div>
    </section>
    <section class="setting-panel"><h3>Your data</h3><p>This device stores your recipes in its browser's IndexedDB. Clearing browser/site data or deleting the Home Screen app may erase its local copy. Your exported backup is the long-term safety net.</p>
      <p class="small">Photos are resized on your device before saving. Optional text recognition runs in your browser. With cloud sharing enabled, recipe data and photos are also sent to your private household collection.</p>
    </section>
  </div>`,true);
  $('#export-backup').addEventListener('click', exportBackup);
  $('#backup-file').addEventListener('change',async e=>{
    if (!e.target.files.length)return;
    if(!confirm('Merge this backup into your existing cookbook? Recipes with matching IDs will be updated.'))return;
    try {const n=await importBackup(e.target.files[0]);closeModal();toast(`${n} recipes restored or merged. Make a new backup after reviewing.`);}catch(err){toast('Restore failed: '+err.message);}
  });
  const configForm=$('#cloud-config-form');
  if(configForm) configForm.addEventListener('submit',async e=>{
    e.preventDefault();const url=$('#sb-url').value.trim(),key=$('#sb-key').value.trim();
    if(!/^https:\/\/[a-z\d-]+\.supabase\.co$/i.test(url.replace(/\/$/,'')))return toast('Enter a valid Supabase project URL.');
    if(!key.startsWith('sb_publishable_')) return toast('Enter a Supabase sb_publishable_ key, never a secret key.');
    setCloudConfig({url,key});toast('Cloud connection saved.');await renderSettings();
  });
  if($('#connect-device'))$('#connect-device').addEventListener('click',async e=>{
    e.currentTarget.disabled=true;
    try {await connectDevice();toast('Device connected. Create or join your shared cookbook.');await renderSettings();}
    catch(err){toast('Could not connect device: '+err.message);e.currentTarget.disabled=false;}
  });
  if($('#create-household'))$('#create-household').addEventListener('submit',async e=>{
    e.preventDefault();try{await createHousehold(new FormData(e.currentTarget).get('name'));toast('Shared cookbook created.');await syncNow();await reload();await renderSettings();}
    catch(err){toast('Could not create cookbook: '+err.message);}
  });
  if($('#join-household'))$('#join-household').addEventListener('submit',async e=>{
    e.preventDefault();try{await joinHousehold(new FormData(e.currentTarget).get('code'));toast('You joined the household cookbook.');await syncNow();await reload();await renderSettings();}
    catch(err){toast('Could not join cookbook: '+err.message);}
  });
  if($('#copy-invite'))$('#copy-invite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(h.invite_code);toast('Invite code copied.');}catch{toast('Select the code and copy it manually.');}});
  if($('#rotate-code'))$('#rotate-code').addEventListener('click',async()=>{
    if(!confirm('Generate a new invite code? The old code will no longer work for new members.'))return;
    try{ const {initializeCloud}=await import('./sync.js');const api=await initializeCloud();const {error}=await api.rpc('rotate_household_code',{p_household:h.id});if(error)throw error;toast('Invite code changed.');await renderSettings();}catch(err){toast(err.message);}
  });
  if($('#sync-now'))$('#sync-now').addEventListener('click',async()=>{const ok=await syncNow();await reload();toast(ok?'Collection synced.':getLastSyncError()||'Could not sync; check connection.');await renderSettings();});
  if($('#cloud-signout'))$('#cloud-signout').addEventListener('click',async()=>{if(!confirm('Disconnect cloud sharing on this device? Locally cached recipes will remain on this device.'))return;try{await signOut();await renderSettings();}catch(err){toast(err.message);}});
}
document.addEventListener('click',e=>{
  const view=e.target.closest('[data-view]'); if(view){state.view=view.dataset.view;state.search='';state.category='all';state.limit=30;render();return;}
  const recipe=e.target.closest('[data-recipe]');if(recipe){showRecipe(recipe.dataset.recipe);return;}
  const action=e.target.closest('[data-action]');if(!action)return;
  if(action.dataset.action==='show-more'){state.limit+=30;renderGrid();}
  if(action.dataset.action==='add')showEditor();
  if(action.dataset.action==='settings')renderSettings();
  if(action.dataset.action==='close')closeModal();
  if(action.dataset.action==='clear-filters'){state.search='';state.category='all';state.view='all';state.limit=30;render();}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#overlay'))closeModal();});
async function boot() {
  try {
    await reload();
    onSyncChange(async()=>{try{await reload();}catch(err){console.error(err);}});
    startAutoSync();
    if (isConfigured()) {
      getSession().then(async session=>{
        state.session=session;
        if(session && !getHouseholdId()) {
          const hs=await getHouseholds(); if(hs.length) setHouseholdId(hs[0].id);
        }
        if(session) await syncNow();
        await reload();
      }).catch(error=>console.warn('Cloud login check:',error));
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(console.warn);
  } catch(error) {
    el('app').innerHTML=`<main class="content"><h1>Local storage could not start</h1><p>${escapeHtml(error.message)}</p><p>Try opening this app in a current version of Safari, Chrome, or Edge.</p></main>`;
  }
}
boot();
