const $ = (selector) => document.querySelector(selector);
const types = {memory:['A small thing worth keeping.','What do you want future-you to remember?'],travel:['A road, a day, a place.','Start with the part that surprised you.'],photo:['A frame with a story.','What happened around this photograph?'],car:['Why this one?','The reason it matters more than the specifications.'],music:['A song attached to a time.','What does this sound bring back?'],thought:['A thought before it disappears.','Write it down without trying to finish it.'],idea:['An unfinished idea.','What is the spark?'],experiment:['Something you tried.','What happened, or what are you trying next?'],place:['A place worth pinning.','Why does this place belong in your world?'],milestone:['A marker in time.','What changed?'],dream:['Something waiting in the distance.','Why does this matter to you?']};
let entries=[]; let activeType='';
const today=()=>new Date().toISOString().slice(0,10);
function show(id){document.querySelectorAll('.panel').forEach(x=>x.hidden=x.id!==id);if(id==='entries')renderEntryList();if(id==='currently')loadCurrently();if(id==='life-list')loadLife();location.hash=id;}
document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>show(button.dataset.go));
function esc(v=''){return String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function request(url,options={}){const res=await fetch(url,options);const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not save.');return data;}
async function loadEntries(){entries=await request('/api/entries');renderTypeButtons();renderEntryList();}
function renderTypeButtons(){const box=$('#types');box.innerHTML=Object.entries(types).map(([id,[name]])=>`<button type="button" data-type="${id}">${name}</button>`).join('');box.querySelectorAll('button').forEach(button=>button.onclick=()=>newEntry(button.dataset.type));}
function newEntry(type){activeType=type;const form=$('#entry-form');form.reset();form.elements.existingId.value='';form.elements.date.value=today();form.elements.cover.value='';$('#image-status').textContent='Optional. It will be saved locally with the project.';$('#delete').hidden=true;setupForm(type);form.hidden=false;document.querySelectorAll('.types button').forEach(x=>x.classList.toggle('selected',x.dataset.type===type));form.scrollIntoView({behavior:'smooth',block:'start'});}
function setupForm(type,data={}){const [heading,prompt]=types[type];$('#type-label').textContent=type;$('#form-title').textContent=heading;$('#story-field textarea').placeholder=prompt;$('#location-field').hidden=type==='car'||type==='music'||type==='thought'||type==='idea'||type==='experiment';$('#tag-options').innerHTML=[...new Set(entries.flatMap(e=>e.tags||[]))].sort().map(tag=>`<label><input type="checkbox" name="tags" value="${esc(tag)}" ${(data.tags||[]).includes(tag)?'checked':''}>${esc(tag)}</label>`).join('')||'<small>No tags yet—add one below.</small>';
$('#related-options').innerHTML=entries.filter(e=>e.id!==data.id).map(e=>`<label><input type="checkbox" name="related" value="${esc(e.id)}" ${(data.related||[]).includes(e.id)?'checked':''}>${esc(e.title)}</label>`).join('')||'<small>No other entries yet.</small>';
}
function formData(){const form=$('#entry-form');return {existingId:form.elements.existingId.value,type:activeType,title:form.elements.title.value.trim(),date:form.elements.date.value,location:form.elements.location.value.trim(),story:form.elements.story.value.trim(),tags:[...form.querySelectorAll('input[name="tags"]:checked')].map(x=>x.value).concat(form.elements.newTag.value.trim()?[form.elements.newTag.value.trim().toLowerCase().replace(/\s+/g,'-')]:[]),related:[...form.querySelectorAll('input[name="related"]:checked')].map(x=>x.value),people:form.elements.people.value.split(',').map(x=>x.trim()).filter(Boolean),cover:form.elements.cover.value};}
async function upload(){const file=$('#image').files[0];if(!file)return;$('#image-status').textContent='Saving image locally…';const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});const result=await request('/api/image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,dataUrl})});$('#entry-form').elements.cover.value=result.url;$('#image-status').textContent=`Attached: ${file.name}`;}
$('#image').onchange=()=>upload().catch(error=>$('#image-status').textContent=error.message);
$('#entry-form').onsubmit=async(event)=>{event.preventDefault();const message=$('#message');message.textContent='Saving…';try{const saved=await request('/api/entry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(formData())});message.textContent='Saved. It is now part of your archive.';await loadEntries();$('#entry-form').elements.existingId.value=saved.id;$('#delete').hidden=false;}catch(error){message.textContent=error.message}};
$('#cancel').onclick=()=>{$('#entry-form').hidden=true;document.querySelectorAll('.types button').forEach(x=>x.classList.remove('selected'));};
$('#delete').onclick=async()=>{const id=$('#entry-form').elements.existingId.value;if(!id)return;if(!confirm('Move this entry to the local .trash folder? You can restore it manually if needed.'))return;try{await request(`/api/entry/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:true})});$('#entry-form').hidden=true;await loadEntries();show('entries');}catch(error){$('#message').textContent=error.message}};
function renderEntryList(){const box=$('#entry-list');box.innerHTML=entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>`<button data-id="${esc(e.id)}"><span>${esc(e.type)}</span><strong>${esc(e.title)}</strong><small>${esc(e.location||e.date||'undated')}</small><b>↗</b></button>`).join('')||'<p>Nothing saved yet. Capture the first thing.</p>';box.querySelectorAll('button').forEach(button=>button.onclick=()=>editEntry(button.dataset.id));}
async function editEntry(id){const entry=await request(`/api/entry/${encodeURIComponent(id)}`);show('capture');activeType=entry.data.type;const form=$('#entry-form');form.hidden=false;form.elements.existingId.value=id;form.elements.title.value=entry.data.title||'';form.elements.date.value=(entry.data.date||'').slice(0,10);form.elements.location.value=entry.data.location||'';form.elements.story.value=entry.story||'';form.elements.people.value=(entry.data.people||[]).join(', ');form.elements.cover.value=entry.data.cover||'';form.elements.newTag.value='';$('#image-status').textContent=entry.data.cover?`Attached: ${entry.data.cover}`:'Optional. It will be saved locally with the project.';setupForm(activeType,{...entry.data,id});$('#delete').hidden=false;document.querySelectorAll('.types button').forEach(x=>x.classList.toggle('selected',x.dataset.type===activeType));}
async function loadCurrently(){const data=await request('/api/currently');const fields=['listening','learning','reading','watching','building','thinking','wanting','planning','obsessed'];const form=$('#currently-form');form.innerHTML=fields.map(field=>`<label>${field}<input name="${field}" value="${esc(data[field]||'')}" placeholder="Add what is true right now"></label>`).join('')+'<div class="actions"><button class="primary">Save currently <b>→</b></button><p class="form-message" role="status"></p></div>';form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form));await request('/api/currently',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(values)});$('.form-message').textContent='Saved.'};}
async function loadLife(){const data=await request('/api/life-list');const form=$('#life-form');['done','next','someday'].forEach(key=>form.elements[key].value=(data[key]||[]).join('\n'));form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(['done','next','someday'].map(key=>[key,form.elements[key].value.split('\n').map(x=>x.trim()).filter(Boolean)]));await request('/api/life-list',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(values)});form.querySelector('.form-message').textContent='Saved.'};}
loadEntries().catch(error=>alert(error.message));

// Mention Autocomplete
const storyTextarea = document.querySelector('textarea[name="story"]');
const mentionBox = $('#mention-autocomplete');
let mentionEntities = [];
let mentionActive = false;
let mentionStartIndex = -1;
let mentionSelectedIndex = 0;
let currentSuggestions = [];

function buildEntityIndex() {
  const list = [];
  const places = new Set();
  for (const e of entries) {
    list.push({ id: e.id, label: e.title, type: e.type, insertText: e.id });
    if (e.location) places.add(e.location);
  }
  for (const p of places) {
    list.push({ id: `place-${p}`, label: p, type: 'place', insertText: p.replace(/\s+/g, '-') });
  }
  mentionEntities = list;
}

function closeMentionBox() {
  mentionActive = false;
  mentionBox.hidden = true;
  mentionSelectedIndex = 0;
}

function renderMentions(query) {
  const lowerQuery = query.toLowerCase();
  currentSuggestions = mentionEntities.filter(e => e.label.toLowerCase().includes(lowerQuery) || e.insertText.toLowerCase().includes(lowerQuery)).slice(0, 8);
  
  if (currentSuggestions.length === 0) {
    mentionBox.innerHTML = `<div class="mention-empty">No matches. <span class="mention-create">Create new entity… (Coming in Phase 5C+)</span></div>`;
  } else {
    mentionBox.innerHTML = currentSuggestions.map((e, i) => `
      <div class="mention-item ${i === mentionSelectedIndex ? 'selected' : ''}" data-index="${i}">
        <span class="mention-label">${esc(e.label)}</span>
        <span class="mention-type">${esc(e.type)}</span>
      </div>
    `).join('') + `<div class="mention-item create-item" data-index="${currentSuggestions.length}">Create new entity…</div>`;
  }
  
  mentionBox.hidden = false;
  
  mentionBox.querySelectorAll('.mention-item').forEach(el => {
    el.onmousedown = (ev) => {
      ev.preventDefault();
      const idx = parseInt(el.dataset.index, 10);
      if (idx === currentSuggestions.length) {
        alert("Create new entity feature will be fully enabled in a future phase.");
        closeMentionBox();
      } else {
        insertMention(currentSuggestions[idx]);
      }
    };
  });
}

function insertMention(entity) {
  const text = storyTextarea.value;
  const before = text.slice(0, mentionStartIndex);
  const after = text.slice(storyTextarea.selectionEnd);
  const insert = `@${entity.insertText} `;
  storyTextarea.value = before + insert + after;
  storyTextarea.selectionStart = storyTextarea.selectionEnd = mentionStartIndex + insert.length;
  closeMentionBox();
  storyTextarea.focus();
}

storyTextarea.addEventListener('input', () => {
  if (!mentionEntities.length) buildEntityIndex();
  
  const text = storyTextarea.value;
  const pos = storyTextarea.selectionStart;
  
  // Find if we are currently typing a mention
  const textBeforeCursor = text.slice(0, pos);
  const match = textBeforeCursor.match(/(?:\s|^)(@[\w-]*)$/);
  
  if (match) {
    mentionActive = true;
    mentionStartIndex = pos - match[1].length + 1; // index after @
    const query = match[1].slice(1);
    mentionSelectedIndex = 0;
    renderMentions(query);
  } else {
    closeMentionBox();
  }
});

storyTextarea.addEventListener('keydown', (e) => {
  if (!mentionActive) return;
  
  const totalItems = currentSuggestions.length > 0 ? currentSuggestions.length + 1 : 0; // +1 for "Create new"
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    mentionSelectedIndex = (mentionSelectedIndex + 1) % totalItems;
    renderMentions(storyTextarea.value.slice(mentionStartIndex, storyTextarea.selectionStart));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    mentionSelectedIndex = (mentionSelectedIndex - 1 + totalItems) % totalItems;
    renderMentions(storyTextarea.value.slice(mentionStartIndex, storyTextarea.selectionStart));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentSuggestions.length > 0 && mentionSelectedIndex < currentSuggestions.length) {
      insertMention(currentSuggestions[mentionSelectedIndex]);
    } else {
      alert("Create new entity feature will be fully enabled in a future phase.");
      closeMentionBox();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeMentionBox();
  }
});
