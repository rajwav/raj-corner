import { renderEntryHeader, renderEntryCover, renderEntryTags, renderPersonTraces, renderContinuation, getPresentationClasses } from '/lib/entryTemplate.js';
import { transformPhotoStacks, initPhotoStacks, renderPhotoStackHtml } from '/lib/photoStack.js';
const $ = (selector) => document.querySelector(selector);
const typeWorld = {
  memory:'life', person:'life', milestone:'life', dream:'life', goal:'life', note:'life',
  travel:'travel', trip:'travel', place:'travel', photo:'travel',
  car:'interests', music:'interests', book:'interests', movie:'interests', anime:'interests', space:'interests', chess:'interests', collection:'interests',
  experiment:'making', project:'making', idea:'making', thought:'making',
};

window.goToSetup = async function() {
  if (window.USE_BLOCKNOTE_POC && window.BlockNotePOCModule) {
    const md = await window.BlockNotePOCModule.getBlockNoteMarkdown();
    document.forms['entry-form'].elements.story.value = md;
  }
  const typeStr = document.getElementById('type-select')?.value;
  if (typeStr) activeType = typeStr;
  
  const id = document.forms['entry-form'].elements.existingId.value || 'new';
  location.hash = '/setup/' + id;
};
window.goToEditor = function() {
  const form = document.getElementById('entry-form');
  const id = form ? (form.elements.existingId.value || 'new') : 'new';
  location.hash = '/editor/' + id;
};

document.getElementById('btn-continue-editor')?.addEventListener('click', window.goToEditor);
document.getElementById('btn-save-setup')?.addEventListener('click', async () => {
  try {
    await saveCurrentEntry();
  } catch (err) {
    const msg = document.getElementById('message');
    if (msg) {
      msg.textContent = err.message;
      msg.style.color = '#dc2626';
    }
  }
});
document.getElementById('btn-back-setup')?.addEventListener('click', window.goToSetup);
document.getElementById('type-select')?.addEventListener('change', (e) => {
  activeType = e.target.value;
  const worldSelect = document.getElementById('world-select');
  if (worldSelect) {
    worldSelect.value = typeWorld[activeType] || 'life';
  }
  setupForm(activeType);
  if (typeof window.markDirty === 'function') window.markDirty();
});
document.getElementById('world-select')?.addEventListener('change', () => {
  if (typeof window.markDirty === 'function') window.markDirty();
});
document.getElementById('btn-settings')?.addEventListener('click', () => {
  const panel = document.getElementById('page-settings-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});
const types = {
  memory:['A small thing worth keeping.','What do you want future-you to remember?'],
  trip:['A journey, a road, a day away.','What happened on the way?'],
  travel:['A road, a day, a place.','Start with the part that surprised you.'],
  photo:['A frame with a story.','What happened around this photograph?'],
  car:['Why this one?','The reason it matters more than the specifications.'],
  music:['A song attached to a time.','What does this sound bring back?'],
  thought:['A thought before it disappears.','Write it down without trying to finish it.'],
  idea:['An unfinished idea.','What is the spark?'],
  experiment:['Something you tried.','What happened, or what are you trying next?'],
  place:['A place worth pinning.','Why does this place belong in your world?'],
  milestone:['A marker in time.','What changed?'],
  dream:['Something waiting in the distance.','Why does this matter to you?'],
  person:['Someone who mattered.','What do you want to remember about them?']
};

window.isDirty = false;
// Per-image presentation metadata: url → { width: '50%', align: 'center' }
window.imageMetadata = new Map();
window.setDirty = function(dirty) {
  window.isDirty = dirty;
  const indicator = document.getElementById('dirty-indicator');
  if (indicator) {
    indicator.textContent = dirty ? '● Unsaved' : 'Saved';
    indicator.style.color = dirty ? 'var(--text)' : 'var(--text-light)';
  }
};
window.markDirty = function() { window.setDirty(true); };

window.addEventListener('beforeunload', (e) => {
  if (window.isDirty) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes.';
  }
});

// Intercept form inputs for dirty
document.addEventListener('input', (e) => {
  if (e.target.closest('#entry-form') || e.target.closest('#page-settings-panel')) {
    window.markDirty();
  }
});

let entries=[];

// The hash is the only navigation source of truth. Keeping this router small
// prevents an old button handler or a partial editor mount from stranding the UI.
async function route() {
  const hash = location.hash.slice(1) || '/';
  const form = document.getElementById('entry-form');
  try {
    if (hash === '/setup/new') {
      if (form.elements.existingId.value !== '' || !activeType) {
        initializeNewEntry('memory');
      }
      show('capture');
      return;
    }
    if (hash === '/editor/new') {
      if (form.elements.existingId.value !== '' || !activeType) {
        initializeNewEntry('memory');
      }
      show('preview-pane');
      updatePreview();
      return;
    }
    const match = hash.match(/^\/(setup|editor)\/([^/]+)$/);
    if (match) {
      const [, mode, id] = match;
      if (form.elements.existingId.value !== id) await editEntry(id, mode);
      else {
        show(mode === 'editor' ? 'preview-pane' : 'capture');
        if (mode === 'editor') updatePreview();
      }
      return;
    }
    if (hash === '/entries') return show('entries');
    if (hash === '/currently') return show('currently');
    if (hash === '/life-list') return show('life-list');
    if (hash === '/rhythm') { loadRhythm(); return show('rhythm'); }
    show('home');
  } catch (error) {
    console.error('Capture route failed:', error);
    const message = document.getElementById('message');
    if (message) message.textContent = `Could not open this page: ${error.message}`;
    show('home');
  }
}
window.onhashchange = route;
 let activeType=''; let storyBlocks = [];
const today=()=>new Date().toISOString().slice(0,10);
function show(id){
  document.querySelectorAll('.panel').forEach(x=>{
    x.hidden=x.id!==id;
    if (x.id === 'capture') x.style.display = (id === 'capture') ? 'block' : 'none';
    if (x.id === 'preview-pane') x.style.display = (id === 'preview-pane') ? 'flex' : 'none';
  });
  const header = document.querySelector('header');
  const navTabs = document.querySelector('nav.tabs');
  const homeSec = document.getElementById('home');
  if (id === 'preview-pane' || id === 'capture') {
    if (header) header.style.display = 'none';
    if (navTabs) navTabs.style.display = 'none';
    if (homeSec) homeSec.style.display = 'none';
    document.body.style.background = 'var(--bg)';
  } else {
    if (header) header.style.display = '';
    if (navTabs) navTabs.style.display = '';
    if (homeSec) homeSec.style.display = '';
    document.body.style.background = '';
  }
  if(id==='entries')renderEntryList();
  if(id==='currently')loadCurrently();
  if(id==='life-list')loadLife();
  
}
document.querySelectorAll('[data-go]').forEach(button => {
  button.onclick = (e) => {
    const go = button.dataset.go;
    if (window.isDirty && (go !== 'capture' && go !== 'preview-pane')) {
      if (!confirm("You have unsaved changes.\n\n[ Stay editing ] or [ Leave without saving ]? Press OK to leave.")) {
        e.preventDefault();
        return;
      }
      window.setDirty(false);
    }
    
    if (go === 'capture') {
       const form = document.getElementById('entry-form');
       if (form && form.elements.existingId.value) {
         initializeNewEntry('memory');
       }
       location.hash = '/setup/new';
    } else if (go === 'entries') {
       location.hash = '/entries';
    } else {
       location.hash = '/' + go;
    }
  };
});
function esc(v=''){return String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function request(url,options={}){const res=await fetch(url,options);let data={};try{data=await res.json();}catch(e){if(!res.ok)throw new Error(`HTTP ${res.status}: Could not parse response.`);}if(!res.ok){console.error(`HTTP ${res.status} Error:`, data);throw new Error(`HTTP ${res.status}: `+(data.error||'Could not save.'));}return data;}
async function loadEntries(){entries=await request('/api/entries');renderTypeButtons();renderEntryList();
const pList = document.getElementById('people-suggestions');
if (pList) {
  pList.innerHTML = entries.filter(e => e.type === 'person').map(e => `<option value="${esc(e.title)}">`).join('');
}
}
function renderTypeButtons(){const box=$('#types');if(box){box.innerHTML=Object.entries(types).map(([id,[name]])=>`<button type="button" data-type="${id}">${name}</button>`).join('');box.querySelectorAll('button').forEach(button=>button.onclick=()=>newEntry(button.dataset.type));}}
function initializeNewEntry(type = 'memory'){
  window.imageMetadata = new Map(); // clear per-image metadata for fresh entry
  activeType=type;const form=$('#entry-form');form.reset();
  form.elements.existingId.value='';
  if(form.elements.title)form.elements.title.value='';
  if(form.elements.description)form.elements.description.value='';
  if(form.elements.story)form.elements.story.value='';
  if(form.elements.location)form.elements.location.value='';
  if(form.elements.people)form.elements.people.value='';
  if(form.elements.newTag)form.elements.newTag.value='';
  if(form.elements.musicSong)form.elements.musicSong.value='';
  if(form.elements.musicArtist)form.elements.musicArtist.value='';
  if(form.elements.musicAlbum)form.elements.musicAlbum.value='';
  if(form.elements.musicYear)form.elements.musicYear.value='';
  if(form.elements.musicMood)form.elements.musicMood.value='';
  if(form.elements.musicWhy)form.elements.musicWhy.value='';
  if(form.elements.musicAudio)form.elements.musicAudio.value='';
  if(form.elements.musicLink)form.elements.musicLink.value='';
  form.elements.date.value=today();
  form.elements.cover.value='';
  if(form.elements.presentation)form.elements.presentation.value='{}';
  if(form.elements.visibility)form.elements.visibility.value='public';
  if(form.elements.allowRequests)form.elements.allowRequests.checked=true;
  const canvasVisInit = document.getElementById('canvas-visibility-select');
  if(canvasVisInit) canvasVisInit.value='public';
  storyBlocks = [];
  if (window.BlockNotePOCModule && typeof window.BlockNotePOCModule.unmountBlockNotePOC === 'function') {
    window.BlockNotePOCModule.unmountBlockNotePOC('blocknote-container');
  }
  if (document.getElementById('type-select')) document.getElementById('type-select').value = type;
  if (document.getElementById('world-select')) document.getElementById('world-select').value = typeWorld[type] || 'life';
  window.USE_BLOCKNOTE_POC = true;
  $('#image-status').textContent='Optional. It will be saved locally with the project.';$('#delete').hidden=true;setupForm(type);form.hidden=false;document.querySelectorAll('.types button').forEach(x=>x.classList.toggle('selected',x.dataset.type===type));
  if (typeof window.setDirty === 'function') window.setDirty(false);
  setTimeout(() => { historyStack = []; historyIndex = -1; captureSnapshot('New entry'); savedStateStr = JSON.stringify(historyStack[0]?.state || {}); updateHistoryUI(); }, 50);
}
function newEntry(type) {
  initializeNewEntry(type);
  location.hash = '/setup/new';
}
function setupForm(type,data={}){ if (typeof previewBtn !== 'undefined' && previewBtn) previewBtn.hidden = false; 
  const [heading,prompt]=types[type] || types['memory'];
  if ($('#type-label')) $('#type-label').textContent=type;
  if ($('#form-title')) $('#form-title').textContent=heading;
  
  const isMusic = type === 'music';
  const musicContainer = $('#music-fields-container');
  const standardContainer = $('#standard-fields-container');
  if (musicContainer) musicContainer.style.display = isMusic ? 'block' : 'none';
  if (standardContainer) standardContainer.style.display = isMusic ? 'none' : 'block';

  const form = $('#entry-form');
  if (isMusic && form) {
    if (form.elements.musicSong) form.elements.musicSong.value = data.title || '';
    if (form.elements.musicArtist) form.elements.musicArtist.value = data.artist || '';
    if (form.elements.musicAlbum) form.elements.musicAlbum.value = data.album || '';
    if (form.elements.musicYear) form.elements.musicYear.value = data.year || '';
    if (form.elements.musicMood) form.elements.musicMood.value = Array.isArray(data.mood) ? data.mood.join(', ') : (data.mood || '');
    if (form.elements.musicWhy) form.elements.musicWhy.value = data.description || data.story || '';
    if (form.elements.musicAudio) form.elements.musicAudio.value = data.audio || '';
    if (form.elements.musicLink) form.elements.musicLink.value = data.link || '';
    if (form.elements.status && !data.id) form.elements.status.value = 'past';
  }

  if (type === 'person') {
    if ($('#title-field span')) $('#title-field span').textContent = 'NAME';
    $('#entry-form').elements.title.placeholder = 'Who is this?';
    if ($('#location-field span')) $('#location-field span').textContent = 'PLACE';
    if ($('#entry-form').elements.location) $('#entry-form').elements.location.placeholder = 'Where are they connected to this memory?';
    if ($('#story-field span')) $('#story-field span').textContent = 'WHAT DO YOU WANT TO REMEMBER ABOUT THEM?';
    if ($('#story-field textarea')) $('#story-field textarea').placeholder = 'A memory, a story, or why they matter to you...';
  } else {
    if ($('#title-field span')) $('#title-field span').textContent = 'Title';
    $('#entry-form').elements.title.placeholder = 'That evening in Puri';
    if ($('#location-field span')) $('#location-field span').textContent = 'Place';
    if ($('#entry-form').elements.location) $('#entry-form').elements.location.placeholder = 'Puri';
    if ($('#story-field span')) $('#story-field span').textContent = 'Story';
    if ($('#story-field textarea')) $('#story-field textarea').placeholder = prompt;
  }
  
  if ($('#location-field')) $('#location-field').hidden=type==='car'||type==='music'||type==='thought'||type==='idea'||type==='experiment';
  
  $('#tag-options').innerHTML=[...new Set(entries.flatMap(e=>e.tags||[]))].sort().map(tag=>`<label><input type="checkbox" name="tags" value="${esc(tag)}" ${(data.tags||[]).includes(tag)?'checked':''}>${esc(tag)}</label>`).join('')||'<small>No tags yet—add one below.</small>';
  $('#related-options').innerHTML=entries.filter(e=>e.id!==data.id).map(e=>`<label><input type="checkbox" name="related" value="${esc(e.id)}" ${(data.related||[]).includes(e.id)?'checked':''}>${esc(e.title)}</label>`).join('')||'<small>No other entries yet.</small>';

  if (form && form.elements.visibility) {
    form.elements.visibility.value = data.visibility || 'public';
    const allowReqRow = document.getElementById('allow-requests-row');
    if (form.elements.visibility.value === 'absolute_private') {
      if (allowReqRow) allowReqRow.style.opacity = '0.5';
    } else {
      if (allowReqRow) allowReqRow.style.opacity = '1';
    }
  }
  if (form && form.elements.allowRequests) {
    form.elements.allowRequests.checked = data.allowRequests !== false;
  }
  const canvasVisEl = document.getElementById('canvas-visibility-select');
  if (canvasVisEl) {
    canvasVisEl.value = data.visibility || 'public';
  }
}

async function upload(){const file=$('#image').files[0];if(!file)return;$('#image-status').textContent='Saving image locally…';const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});const result=await request('/api/image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,dataUrl})});$('#entry-form').elements.cover.value=result.url;$('#image-status').textContent=`Attached: ${file.name}`; if(typeof previewPane!=='undefined' && !previewPane.hidden) updatePreview();
  if (typeof captureSnapshot === 'function') captureSnapshot('Uploaded cover');}
$('#image').onchange=()=>upload().catch(error=>$('#image-status').textContent=error.message);

// ─── Image Metadata Helpers ────────────────────────────────────────────────
// Parse image metadata from markdown title fields back into window.imageMetadata.
// Stored format in markdown: ![alt](url "w=50%,a=center")
function loadImageMetadataFromMarkdown(md) {
  window.imageMetadata = new Map();
  if (!md) return;
  const re = /!\[[^\]]*\]\(([^)\s"']+)(?:\s+["']([^"']*)["'])?\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const url = m[1];
    const title = m[2] || '';
    const wMatch = title.match(/w=([^,]+)/);
    const aMatch = title.match(/a=([^,]+)/);
    if (wMatch || aMatch) {
      window.imageMetadata.set(url, {
        width: wMatch ? wMatch[1] : '100%',
        align: aMatch ? aMatch[1] : 'center'
      });
    }
  }
}

// Inject per-image metadata into BlockNote markdown as image title fields.
// Input:  ![alt](url)
// Output: ![alt](url "w=50%,a=center")
function injectImageMetadata(md) {
  if (!md || window.imageMetadata.size === 0) return md;
  return md.replace(/!\[([^\]]*)\]\(([^)\s"']+)(?:\s+["'][^"']*["'])?\)/g, (match, alt, url) => {
    const meta = window.imageMetadata.get(url);
    if (!meta) return match;
    const parts = [];
    if (meta.width && meta.width !== '100%') parts.push('w=' + meta.width);
    if (meta.align && meta.align !== 'center') parts.push('a=' + meta.align);
    if (parts.length === 0) return match;
    return '![' + alt + '](' + url + ' "' + parts.join(',') + '")';
  });
}

// ==========================================
// PHOTO STACK CANVAS SELECTION STATE
// ==========================================
const selectedCanvasPhotos = new Map(); // key: src, value: { url, caption, name, blockId, wrapper, btn }

function updateAllStackButtons() {
  const count = selectedCanvasPhotos.size;
  document.querySelectorAll('.rc-direct-stack-btn').forEach(btn => {
    if (count >= 2) {
      btn.style.display = 'inline-flex';
      btn.textContent = `⚡ Make Stack (${count})`;
    } else {
      btn.style.display = 'none';
    }
  });
}

function updateCanvasPhotoStackBar() {
  const bar = document.getElementById('canvas-photo-stack-bar');
  const countEl = document.getElementById('canvas-photo-stack-count');
  if (!bar) return;
  const count = selectedCanvasPhotos.size;
  if (count > 0) {
    if (countEl) countEl.textContent = `${count} photo${count > 1 ? 's' : ''} selected`;
    bar.style.display = 'inline-flex';
  } else {
    bar.style.display = 'none';
  }
}

function clearCanvasPhotoSelection() {
  selectedCanvasPhotos.forEach((item) => {
    if (item.wrapper) item.wrapper.classList.remove('rc-photo-selected');
    if (item.btn) {
      item.btn.classList.remove('is-selected');
      item.btn.innerHTML = '🎴 Stack';
    }
  });
  selectedCanvasPhotos.clear();
  updateCanvasPhotoStackBar();
  updateAllStackButtons();
}

window.clearCanvasPhotoSelection = clearCanvasPhotoSelection;

window.isCanvasPhotoSelected = function(src) {
  return selectedCanvasPhotos.has(src);
};

window.toggleCanvasPhotoSelection = function({ img, wrapper, btn, src }) {
  if (selectedCanvasPhotos.has(src)) {
    selectedCanvasPhotos.delete(src);
    if (wrapper) wrapper.classList.remove('rc-photo-selected');
    if (btn) {
      btn.classList.remove('is-selected');
      btn.innerHTML = '🎴 Stack';
    }
  } else {
    const blockOuter = img.closest('[data-id]') || img.closest('.bn-block');
    const blockId = blockOuter ? blockOuter.getAttribute('data-id') : null;
    const caption = img.getAttribute('alt') || img.getAttribute('title') || '';
    const name = src.split('/').pop() || 'Photo';
    selectedCanvasPhotos.set(src, {
      url: src,
      caption,
      name,
      blockId,
      wrapper,
      btn
    });
    if (wrapper) wrapper.classList.add('rc-photo-selected');
    if (btn) {
      btn.classList.add('is-selected');
      btn.innerHTML = '✓ Stack';
    }
  }
  updateCanvasPhotoStackBar();
  updateAllStackButtons();
};

// Wire up floating canvas photo stack bar buttons immediately
function initCanvasPhotoStackBar() {
  const btnClear = document.getElementById('btn-canvas-clear-stack-sel');
  const btnCreate = document.getElementById('btn-canvas-create-stack');
  btnClear?.addEventListener('click', clearCanvasPhotoSelection);
  btnCreate?.addEventListener('click', () => {
    if (typeof window.openPhotoStackModal === 'function') {
      window.openPhotoStackModal(Array.from(selectedCanvasPhotos.values()));
    }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCanvasPhotoStackBar);
} else {
  initCanvasPhotoStackBar();
}

// Inject resize + alignment controls as overlays on images in the BlockNote container.
// Uses MutationObserver so it works even after BlockNote renders asynchronously.
let _imgResizeObserver = null;
function setupImageResizeUI(containerId) {
  if (_imgResizeObserver) { _imgResizeObserver.disconnect(); _imgResizeObserver = null; }
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!document.getElementById('rc-slider-styles')) {
    const st = document.createElement('style');
    st.id = 'rc-slider-styles';
    st.textContent = `
      .rc-img-controls {
        user-select: none;
        -webkit-user-select: none;
      }
      .rc-width-slider {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        background: rgba(255, 255, 255, 0.28);
        border-radius: 3px;
        outline: none;
        touch-action: none;
        vertical-align: middle;
        transition: background 0.15s ease;
      }
      .rc-width-slider:hover {
        background: rgba(255, 255, 255, 0.45);
      }
      .rc-width-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        cursor: grab;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        border: 1px solid rgba(0,0,0,0.15);
        transition: transform 0.08s ease, background 0.08s ease;
      }
      .rc-width-slider:active::-webkit-slider-thumb {
        cursor: grabbing;
        transform: scale(1.25);
        background: #38bdf8;
      }
      .rc-width-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        cursor: grab;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        border: none;
      }
      .rc-width-slider:active::-moz-range-thumb {
        cursor: grabbing;
        transform: scale(1.25);
        background: #38bdf8;
      }
    `;
    document.head.appendChild(st);
  }

  function applyMetaToMedia(el, meta) {
    const w = meta.width || '100%';
    const a = meta.align || 'center';
    el.style.width = w;
    el.style.maxWidth = '100%';
    el.style.height = 'auto';
    el.style.display = 'inline-block';
    el.style.verticalAlign = 'middle';
    if (el._rcWrapper) {
      el._rcWrapper.style.textAlign = a;
    }
    if (el._rcVideo) {
      el._rcVideo.style.width = w;
      el._rcVideo.style.maxWidth = '100%';
      el._rcVideo.style.display = 'inline-block';
      el._rcVideo.style.verticalAlign = 'middle';
    }
    if (el._rcImg) {
      el._rcImg.style.width = w;
    }
  }

  function processMedia(el) {
    if (el.dataset.rcManaged) return;
    if (el.closest('.photo-stack-container') || el.closest('.editor-photo-stack-preview')) return;
    // Only manage uploads/images/videos (not BlockNote UI icons)
    const src = el.getAttribute('src') || el.currentSrc || el.getAttribute('data-url') || '';
    if (!src.startsWith('/uploads/') && !src.startsWith('/images/')) return;
    el.dataset.rcManaged = '1';

    const isVideo = el.tagName === 'VIDEO' || /\.(mp4|mov|webm|ogg)(\?.*)?$/i.test(src);

    const meta = window.imageMetadata.get(src) || { width: '100%', align: 'center' };

    // Wrap media for positioning
    const wrapper = document.createElement('div');
    wrapper.className = 'rc-img-wrapper';
    wrapper.style.cssText = 'position:relative;text-align:' + (meta.align || 'center') + ';margin:8px 0;';
    el._rcWrapper = wrapper;
    if (el.parentNode) {
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);
    }

    applyMetaToMedia(el, meta);

    // Build controls overlay
    const controls = document.createElement('div');
    controls.className = 'rc-img-controls';
    const widthPct = parseInt(meta.width) || 100;
    controls.innerHTML =
      '<span style="opacity:.7">W:</span>' +
      '<input type="range" min="20" max="100" value="' + widthPct + '" class="rc-width-slider" style="width:80px;cursor:pointer;accent-color:#fff;">' +
      '<span class="rc-width-label" style="min-width:32px">' + widthPct + '%</span>' +
      '<span style="opacity:.4;margin:0 2px">|</span>' +
      ['left','center','right'].map(a =>
        '<button type="button" class="rc-align-btn" data-align="' + a + '" title="' + a +
        '" style="background:none;border:none;color:#fff;cursor:pointer;padding:1px 4px;font-size:14px;opacity:' +
        (a === (meta.align || 'center') ? '1' : '0.4') + '">' +
        ({left:'⇐',center:'⇌',right:'⇒'}[a]) + '</button>'
      ).join('') +
      (!isVideo ? (
        '<span style="opacity:.4;margin:0 2px">|</span>' +
        '<button type="button" class="rc-stack-toggle-btn" title="Select for Photo Stack" style="background:none;border:none;color:#fff;cursor:pointer;padding:2px 6px;font-size:11px;border-radius:3px;display:inline-flex;align-items:center;gap:3px;">🎴 Stack</button>' +
        '<button type="button" class="rc-direct-stack-btn" title="Turn selected photos into stack" style="display:' + (selectedCanvasPhotos.size >= 2 ? 'inline-flex' : 'none') + ';background:#2563eb;border:none;color:#fff;cursor:pointer;padding:2px 8px;font-size:11px;font-weight:700;border-radius:3px;margin-left:4px;">⚡ Make Stack (' + selectedCanvasPhotos.size + ')</button>'
      ) : '');

    controls.style.cssText = [
      'display:flex;gap:6px;align-items:center',
      'padding:4px 8px',
      'background:rgba(0,0,0,0.78)',
      'color:#fff',
      'border-radius:4px',
      'font-size:11px;font-family:monospace',
      'position:absolute;top:6px;left:50%;transform:translateX(-50%)',
      'z-index:200;white-space:nowrap',
      'opacity:0;transition:opacity 0.15s',
      'pointer-events:none'
    ].join(';');

    let isDraggingSlider = false;
    let previewDebounceTimer = null;
    let rAFId = null;

    wrapper.appendChild(controls);
    wrapper.addEventListener('mouseenter', () => {
      controls.style.opacity = '1';
      controls.style.pointerEvents = 'auto';
    });
    wrapper.addEventListener('mouseleave', () => {
      if (!isDraggingSlider) {
        controls.style.opacity = '0';
        controls.style.pointerEvents = 'none';
      }
    });

    // Prevent ProseMirror from capturing slider/control interactions
    controls.addEventListener('mousedown', (e) => e.stopPropagation());
    controls.addEventListener('pointerdown', (e) => e.stopPropagation());
    controls.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    // Width slider
    const slider = controls.querySelector('.rc-width-slider');
    const label  = controls.querySelector('.rc-width-label');

    slider.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      isDraggingSlider = true;
      controls.style.opacity = '1';
      controls.style.pointerEvents = 'auto';
    });

    slider.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isDraggingSlider = true;
      controls.style.opacity = '1';
      controls.style.pointerEvents = 'auto';
    });

    const onSliderRelease = () => {
      if (isDraggingSlider) {
        isDraggingSlider = false;
        if (!wrapper.matches(':hover')) {
          controls.style.opacity = '0';
          controls.style.pointerEvents = 'none';
        }
        if (previewDebounceTimer) {
          clearTimeout(previewDebounceTimer);
          previewDebounceTimer = null;
        }
        window.markDirty();
        if (typeof updatePreview === 'function') updatePreview();
      }
    };
    window.addEventListener('pointerup', onSliderRelease);
    window.addEventListener('mouseup', onSliderRelease);
    window.addEventListener('touchend', onSliderRelease);

    slider.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = slider.value;
      const w = val + '%';
      label.textContent = w;

      if (rAFId) cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        el.style.width = w;
        if (el._rcVideo) el._rcVideo.style.width = w;
        if (el._rcImg) el._rcImg.style.width = w;
        const v = wrapper.querySelector('video');
        if (v) v.style.width = w;
        const im = wrapper.querySelector('img:not([style*="display: none"])');
        if (im) im.style.width = w;
      });

      const m2 = window.imageMetadata.get(src) || { align: 'center' };
      m2.width = w;
      window.imageMetadata.set(src, m2);

      // Debounce heavy preview updates so dragging is silky smooth 60fps
      if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
      previewDebounceTimer = setTimeout(() => {
        previewDebounceTimer = null;
        window.markDirty();
        if (typeof updatePreview === 'function') updatePreview();
      }, 120);
    });

    slider.addEventListener('change', (e) => {
      e.stopPropagation();
      if (previewDebounceTimer) {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = null;
      }
      window.markDirty();
      if (typeof updatePreview === 'function') updatePreview();
    });

    // Alignment buttons
    controls.querySelectorAll('.rc-align-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = btn.dataset.align;
        wrapper.style.textAlign = a;
        controls.querySelectorAll('.rc-align-btn').forEach(b => b.style.opacity = b.dataset.align === a ? '1' : '0.4');
        const m2 = window.imageMetadata.get(src) || { width: '100%' };
        m2.align = a;
        window.imageMetadata.set(src, m2);
        window.markDirty();
        if (typeof updatePreview === 'function') updatePreview();
      });
    });

    // Stack toggle button
    const stackBtn = controls.querySelector('.rc-stack-toggle-btn');
    if (stackBtn) {
      if (typeof window.isCanvasPhotoSelected === 'function' && window.isCanvasPhotoSelected(src)) {
        stackBtn.classList.add('is-selected');
        stackBtn.innerHTML = '✓ Stack';
        wrapper.classList.add('rc-photo-selected');
        const currentItem = selectedCanvasPhotos.get(src);
        if (currentItem) {
          currentItem.wrapper = wrapper;
          currentItem.btn = stackBtn;
        }
      }
      stackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.toggleCanvasPhotoSelection === 'function') {
          window.toggleCanvasPhotoSelection({ img: el, wrapper, btn: stackBtn, src });
        }
      });
    }

    const directStackBtn = controls.querySelector('.rc-direct-stack-btn');
    if (directStackBtn) {
      directStackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openPhotoStackModal === 'function') {
          window.openPhotoStackModal(Array.from(selectedCanvasPhotos.values()));
        }
      });
    }
  }

  // Process already-rendered images & videos
  container.querySelectorAll('img, video').forEach(processMedia);
  enhanceEditorVideos(containerId);

  // Watch for images and blocks added by BlockNote async rendering
  _imgResizeObserver = new MutationObserver(mutations => {
    let hasNewMedia = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if ((node.tagName === 'IMG' || node.tagName === 'VIDEO') && !node.dataset.rcManaged) {
          processMedia(node);
          hasNewMedia = true;
        } else if (node.querySelectorAll) {
          node.querySelectorAll('img:not([data-rc-managed]), video:not([data-rc-managed])').forEach(media => {
            processMedia(media);
            hasNewMedia = true;
          });
        }
      }
    }
    if (hasNewMedia) {
      enhanceEditorVideos(containerId);
    }
  });
  _imgResizeObserver.observe(container, { childList: true, subtree: true });
}

function enhanceEditorVideos(containerId = 'blocknote-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (!/\.(mp4|mov|webm|ogg)(\?.*)?$/i.test(src)) return;

    const meta = window.imageMetadata.get(src) || { width: '100%', align: 'center' };
    const width = meta.width || img.style.width || '100%';

    if (img._rcVideoReplaced) {
      if (img._rcVideo) {
        img._rcVideo.style.width = width;
      }
      return;
    }
    img._rcVideoReplaced = true;

    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.style.cssText = `max-width: 100%; width: ${width}; border-radius: 4px; display: inline-block; vertical-align: middle; margin: 8px 0; background: #000; box-shadow: 0 4px 16px rgba(0,0,0,0.15);`;

    img._rcVideo = video;
    video._rcImg = img;
    img.style.display = 'none';

    if (img.parentNode) {
      img.parentNode.insertBefore(video, img);
    }

    if (img._rcWrapper) {
      img._rcWrapper.style.textAlign = meta.align || 'center';
    }
  });

  // Ensure any direct <video> tags have controls, playsinline, and meta width applied
  container.querySelectorAll('video').forEach(video => {
    if (!video.hasAttribute('controls')) video.setAttribute('controls', '');
    if (!video.hasAttribute('preload')) video.setAttribute('preload', 'metadata');
    if (!video.hasAttribute('playsinline')) video.setAttribute('playsinline', '');
    video.style.maxWidth = '100%';
    video.style.borderRadius = '4px';

    const src = video.getAttribute('src') || video.currentSrc || '';
    if (src && !video.dataset.rcManaged) {
      const meta = window.imageMetadata.get(src);
      if (meta && meta.width) {
        video.style.width = meta.width;
      }
    }
  });

  container.querySelectorAll('.bn-file-loading-preview').forEach(el => {
    const blockOuter = el.closest('.bn-block-outer');
    if (blockOuter && (blockOuter.querySelector('video') || blockOuter.querySelector('img[src*="/uploads/"]'))) {
      el.remove();
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────────

async function collectCurrentEntryState() {
  const form = document.getElementById('entry-form');
  if (!form) return {};
  
  let blocknoteMd = '';
  if (window.USE_BLOCKNOTE_POC && window.BlockNotePOCModule) {
    blocknoteMd = await window.BlockNotePOCModule.getBlockNoteMarkdown();
  } else {
    blocknoteMd = form.elements.story ? form.elements.story.value.trim() : '';
  }

  // Inject per-image width/alignment metadata into the markdown title fields
  blocknoteMd = injectImageMetadata(blocknoteMd);


  const tags = [];
  form.querySelectorAll('input[name="tags"]:checked').forEach(x => tags.push(x.value));
  const newTagStr = form.elements.newTag ? form.elements.newTag.value.trim() : '';
  if (newTagStr) {
    tags.push(newTagStr.toLowerCase().replace(/\s+/g, '-'));
  }

  const related = [];
  form.querySelectorAll('input[name="related"]:checked').forEach(x => related.push(x.value));

  const peopleStr = form.elements.people ? form.elements.people.value : '';
  const people = peopleStr.split(',').map(x => x.trim()).filter(Boolean);

  let presentation = {};
  if (form.elements.presentation) {
    try {
      presentation = JSON.parse(form.elements.presentation.value || '{}');
    } catch(e) {}
  }

  const typeSelect = document.getElementById('type-select');
  const selectedType = typeSelect?.value || (typeof activeType !== 'undefined' ? activeType : 'memory');
  const worldSelect = document.getElementById('world-select');
  const selectedWorld = worldSelect?.value || typeWorld[selectedType] || 'life';

  let title = form.elements.title ? form.elements.title.value.trim() : '';
  let artist = '';
  let album = '';
  let year = '';
  let mood = [];
  let audio = '';
  let link = '';
  let description = form.elements.description ? form.elements.description.value.trim() : '';

  if (selectedType === 'music') {
    const song = form.elements.musicSong ? form.elements.musicSong.value.trim() : '';
    artist = form.elements.musicArtist ? form.elements.musicArtist.value.trim() : '';
    album = form.elements.musicAlbum ? form.elements.musicAlbum.value.trim() : '';
    year = form.elements.musicYear ? form.elements.musicYear.value.trim() : '';
    const moodRaw = form.elements.musicMood ? form.elements.musicMood.value.trim() : '';
    mood = moodRaw ? moodRaw.split(',').map(x => x.trim()).filter(Boolean) : [];
    const why = form.elements.musicWhy ? form.elements.musicWhy.value.trim() : '';
    audio = form.elements.musicAudio ? form.elements.musicAudio.value.trim() : '';
    link = form.elements.musicLink ? form.elements.musicLink.value.trim() : '';

    if (song) {
      title = song;
      if (form.elements.title) form.elements.title.value = song;
    }
    if (why) description = why;
    else if (!description && artist) description = `${title} by ${artist}`;

    if (!blocknoteMd && why) {
      blocknoteMd = why;
    }
  }

  return {
    existingId: form.elements.existingId ? form.elements.existingId.value : '',
    type: selectedType,
    world: selectedWorld,
    title,
    artist,
    album,
    year,
    mood,
    audio,
    link,
    date: form.elements.date ? form.elements.date.value : '',
    location: form.elements.location ? form.elements.location.value.trim() : '',
    description,
    cover: form.elements.cover ? form.elements.cover.value : '',
    tags,
    related,
    people,
    presentation,
    story: blocknoteMd,
    status: form.elements.status ? form.elements.status.value : 'past',
    featured: Boolean(form.elements.featured && form.elements.featured.checked),
    visibility: form.elements.visibility ? form.elements.visibility.value : 'public',
    allowRequests: form.elements.allowRequests ? Boolean(form.elements.allowRequests.checked) : true
  };
}

async function saveCurrentEntry() {
  const indicator = document.getElementById('dirty-indicator');
  const message = document.getElementById('message');
  
  if (indicator) indicator.textContent = 'Saving…';
  if (message) message.textContent = 'Saving…';

  try {
    if (window.USE_BLOCKNOTE_POC && location.hash.includes('/editor') && (!window.BlockNotePOCModule || !window.BlockNotePOCModule.isBlockNoteReady())) {
      throw new Error('Editor is still loading. Please wait a moment and save again.');
    }
    const payload = await collectCurrentEntryState();
    if (!payload.title) {
      if (location.hash.includes('/editor')) {
        const titleEl = document.querySelector('.artifact-title-group h1, h1.person-title');
        if (titleEl) titleEl.focus();
      }
      throw new Error(payload.type === 'music' ? 'Add a song name before saving.' : 'Add a title before saving.');
    }
    
    if (typeof typingTimer !== 'undefined') clearTimeout(typingTimer);
    if (typeof captureSnapshot === 'function') captureSnapshot('Saved state (auto-flush)');
    
    const response = await fetch('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Save failed (${response.status}): ${text}`);
    }

    const res = await response.json();
    
    if (typeof window.setDirty === 'function') window.setDirty(false);
    if (indicator) { 
      indicator.textContent = '✓ Saved just now'; 
      indicator.style.color = 'var(--text-light)'; 
    }
    if (message) message.textContent = 'Saved. It is now part of your archive.';
    if (typeof loadEntries === 'function') await loadEntries();
    
    const form = document.getElementById('entry-form');
    if (form && form.elements.existingId) {
      form.elements.existingId.value = res.id;
    }
    
    const deleteBtn = document.getElementById('delete');
    if (deleteBtn) deleteBtn.hidden = false;
    
    if (location.hash === '#/setup/new') history.replaceState(null, '', '#/setup/' + res.id);
    if (location.hash === '#/editor/new') history.replaceState(null, '', '#/editor/' + res.id);
    
  } catch(error) {
    console.error('SAVE ERROR:', error);
    let errorMsg = error.message;
    
    // Distinguish Network Error vs HTTP Error
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMsg = 'Cannot reach Capture server';
    } else {
      try {
        const parsed = JSON.parse(error.message.replace(/^Save failed \(\d+\): /, ''));
        if (parsed.error) errorMsg = parsed.error;
      } catch(e) {}
    }
    
    if (indicator) { 
      if (errorMsg === 'Cannot reach Capture server') {
        indicator.textContent = '⚠ Save failed: Cannot reach Capture server';
      } else if (errorMsg.startsWith('Save failed')) {
        indicator.textContent = '⚠ ' + errorMsg;
      } else {
        // If it was already formatted as an HTTP error, we don't prepend again. 
        // Our manually thrown HTTP errors look like "Save failed (500): ..." 
        // which starts with "Save failed".
        if (error.message.startsWith('Save failed')) {
          indicator.textContent = '⚠ ' + error.message;
        } else {
          indicator.textContent = '⚠ Save failed: ' + errorMsg;
        }
      }
      indicator.style.color = 'var(--text-error)'; 
    }
    if (message) message.textContent = errorMsg;
  }
}

$('#cancel').onclick=()=>{location.hash='/entries';document.querySelectorAll('.types button').forEach(x=>x.classList.remove('selected'));};
document.getElementById('btn-new-entry')?.addEventListener('click', () => {
  if (window.isDirty && !confirm("You have unsaved changes.\n\n[ Stay editing ] or [ Leave without saving ]? Press OK to leave.")) {
    return;
  }
  if (typeof window.setDirty === 'function') window.setDirty(false);
  initializeNewEntry('memory');
  location.hash = '/setup/new';
});
$('#delete').onclick=async()=>{const id=$('#entry-form').elements.existingId.value;if(!id)return;if(!confirm('Move this entry to the local .trash folder? You can restore it manually if needed.'))return;try{await request(`/api/entry/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:true})});$('#entry-form').hidden=true;await loadEntries();show('entries');}catch(error){$('#message').textContent=error.message}};
function renderEntryList(){const box=$('#entry-list');box.innerHTML=entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>`<button data-id="${esc(e.id)}"><span>${esc(e.type)}</span><strong>${esc(e.title)}</strong><small>${esc(e.location||e.date||'undated')}</small><b>↗</b></button>`).join('')||'<p>Nothing saved yet. Capture the first thing.</p>';box.querySelectorAll('button').forEach(button=>button.onclick=()=>editEntry(button.dataset.id));}
async function editEntry(id, mode = 'setup'){const entry=await request(`/api/entry/${encodeURIComponent(id)}`);activeType=entry.data.type;
  const form=$('#entry-form');form.hidden=false;form.elements.existingId.value=id;form.elements.title.value=entry.data.title||'';form.elements.date.value=(entry.data.date||'').slice(0,10);form.elements.location.value=entry.data.location||'';form.elements.story.value=entry.story||'';if(form.elements.description)form.elements.description.value=entry.data.description||'';form.elements.people.value=(entry.data.people||[]).join(', ');form.elements.cover.value=entry.data.cover||'';if(form.elements.presentation) {
  form.elements.presentation.value=JSON.stringify(entry.data.presentation||{});
  layoutSelect.value = (entry.data.presentation && entry.data.presentation.layout && entry.data.presentation.layout.mode) ? entry.data.presentation.layout.mode : 'default';
}form.elements.newTag.value='';$('#image-status').textContent=entry.data.cover?`Attached: ${entry.data.cover}`:'Optional. It will be saved locally with the project.';setupForm(activeType,{...entry.data,id});$('#delete').hidden=false;document.querySelectorAll('.types button').forEach(x=>x.classList.toggle('selected',x.dataset.type===activeType)); window.USE_BLOCKNOTE_POC = true; if (document.getElementById('type-select')) document.getElementById('type-select').value = activeType; if (document.getElementById('world-select')) document.getElementById('world-select').value = entry.data.world || typeWorld[activeType] || 'life';
  // Load per-image metadata from the saved markdown so resize UI initializes correctly
  loadImageMetadataFromMarkdown(entry.story || '');
  if (window.BlockNotePOCModule && typeof window.BlockNotePOCModule.unmountBlockNotePOC === 'function') {
      window.BlockNotePOCModule.unmountBlockNotePOC('blocknote-container');
  }
  location.hash = mode === 'editor' ? '/editor/' + id : '/setup/' + id;
  setTimeout(() => { historyStack = []; historyIndex = -1; captureSnapshot('Loaded entry'); savedStateStr = JSON.stringify(historyStack[0].state); updateHistoryUI(); }, 50); }
async function loadCurrently(){const data=await request('/api/currently');const fields=['listening','learning','reading','watching','building','thinking','wanting','planning','obsessed'];const form=$('#currently-form');form.innerHTML=fields.map(field=>`<label>${field}<input name="${field}" value="${esc(data[field]||'')}" placeholder="Add what is true right now"></label>`).join('')+'<div class="actions"><button class="primary">Save currently <b>→</b></button><p class="form-message" role="status"></p></div>';form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form));await request('/api/currently',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(values)});$('.form-message').textContent='Saved.'};}
async function loadLife(){const data=await request('/api/life-list');const form=$('#life-form');['done','next','someday'].forEach(key=>form.elements[key].value=(data[key]||[]).join('\n'));form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(['done','next','someday'].map(key=>[key,form.elements[key].value.split('\n').map(x=>x.trim()).filter(Boolean)]));await request('/api/life-list',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(values)});form.querySelector('.form-message').textContent='Saved.'};}

// Preview Logic
const previewBtn = $('#preview-btn');
const previewPane = $('#preview-pane');
const closePreviewBtn = $('#close-preview');
const previewContent = $('#preview-content');
const entryForm = $('#entry-form');
const layoutSelect = $('#layout-mode-select');

layoutSelect.onchange = () => {
  const presEl = entryForm.elements.presentation;
  const p = JSON.parse(presEl.value || '{}');
  if (!p.layout) p.layout = {};
  p.layout.mode = layoutSelect.value;
  if (p.layout.mode === 'default') delete p.layout.mode;
  if (Object.keys(p.layout).length === 0) delete p.layout;
  presEl.value = JSON.stringify(p);
  updatePreview();
};

const setupVisibilityEl = document.getElementById('setup-visibility');
const canvasVisibilityEl = document.getElementById('canvas-visibility-select');
const allowRequestsEl = document.getElementById('setup-allow-requests');

if (setupVisibilityEl) {
  setupVisibilityEl.addEventListener('change', () => {
    const val = setupVisibilityEl.value;
    const allowReqRow = document.getElementById('allow-requests-row');
    if (val === 'absolute_private') {
      if (allowReqRow) allowReqRow.style.opacity = '0.5';
    } else {
      if (allowReqRow) allowReqRow.style.opacity = '1';
    }
    if (canvasVisibilityEl) canvasVisibilityEl.value = val;
    if (typeof window.setDirty === 'function') window.setDirty(true);
  });
}

if (canvasVisibilityEl) {
  canvasVisibilityEl.addEventListener('change', () => {
    const val = canvasVisibilityEl.value;
    if (setupVisibilityEl) {
      setupVisibilityEl.value = val;
      const allowReqRow = document.getElementById('allow-requests-row');
      if (val === 'absolute_private') {
        if (allowReqRow) allowReqRow.style.opacity = '0.5';
      } else {
        if (allowReqRow) allowReqRow.style.opacity = '1';
      }
    }
    if (typeof window.setDirty === 'function') window.setDirty(true);
  });
}

if (allowRequestsEl) {
  allowRequestsEl.addEventListener('change', () => {
    if (typeof window.setDirty === 'function') window.setDirty(true);
  });
}

function simpleMarkdown(text) {
  if (!text) return '';
  return typeof marked !== 'undefined' ? marked.parse(text) : text;
}

function updatePreview() {
  window.updatePreview = updatePreview;
  if (entryForm.elements.story && typeof parseMarkdownToBlocks !== 'undefined') {
    // Only re-parse if storyBlocks is fundamentally mismatched or we just loaded a new entry
    // Actually, it's safer to just always sync when updatePreview is called from an external load.
    // We can just parse it directly.
    const currentText = storyBlocks ? storyBlocks.map(b => b.raw).join('\n\n').trim() : '';
    const formText = (entryForm.elements.story.value || '').trim();
    if (currentText !== formText) {
      storyBlocks = parseMarkdownToBlocks(entryForm.elements.story.value || '');
    }
  }

  if (previewPane.hidden) return;
  const typeSelect = document.getElementById('type-select');
  const activeTypeVal = typeSelect?.value || activeType || 'memory';
  const worldSelect = document.getElementById('world-select');
  const worldSlug = worldSelect?.value || typeWorld[activeTypeVal] || 'life';
  const data = {
    title: entryForm.elements.title.value || 'Untitled',
    type: activeTypeVal,
    world: worldSlug,
    date: entryForm.elements.date.value || '',
    location: entryForm.elements.location.value || '',
    story: entryForm.elements.story.value || '',
    cover: entryForm.elements.cover.value || '', presentation: entryForm.elements.presentation ? JSON.parse(entryForm.elements.presentation.value || '{}') : {},
    description: (entryForm.elements.description && entryForm.elements.description.value.trim()) ? entryForm.elements.description.value.trim() : (entryForm.elements.story.value || '').split('\n')[0]
  };
  
  const isPerson = data.type === 'person';
  const niceDateStr = data.date ? new Date(data.date).toLocaleDateString('en', {month:'short', year:'numeric'}) : 'Undated';
  const placeSlugStr = (data.location||'').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  

  const niceDateFn = (d) => d ? new Date(d).toLocaleDateString('en', {month:'short', year:'numeric'}) : 'Undated';
  
  const currentId = entryForm.elements.existingId.value || '';
  const relatedIds = Array.from(document.querySelectorAll('#related-options input:checked')).map(el => el.value);
  const tagVals = Array.from(document.querySelectorAll('#tag-options input:checked')).map(el => el.value);
  if (entryForm.elements.newTag.value) tagVals.push(entryForm.elements.newTag.value.trim());

  // Traces logic
  const personTraces = [];
  if (isPerson) {
    const seenTraces = new Set();
    const addTrace = (e) => { if(!seenTraces.has(e.id)){ seenTraces.add(e.id); personTraces.push(e); } };
    
    for (const e of entries) {
      if (e.id === currentId) continue;
      const t = data.title.toLowerCase();
      // mentions
      if (e.story && ((t !== 'untitled' && e.story.toLowerCase().includes('@'+t)) || (currentId && e.story.toLowerCase().includes('@'+currentId)))) addTrace(e);
      // people
      if (e.people && e.people.some(p => p.toLowerCase()===t || p.toLowerCase()===currentId || p.toLowerCase().replace(/ /g,'-')===currentId)) addTrace(e);
      // related
      if (e.related && e.related.includes(currentId)) addTrace(e);
    }
    personTraces.sort((a, b) => {
      const aDate = a?.data?.date || a?.date;
      const bDate = b?.data?.date || b?.date;
      if (aDate && bDate) return new Date(bDate) - new Date(aDate);
      if (aDate) return -1;
      if (bDate) return 1;
      const aTitle = a?.data?.title || a?.title || '';
      const bTitle = b?.data?.title || b?.title || '';
      return aTitle.localeCompare(bTitle);
    });
  }

  // Threads logic
  const threads = [];
  const seenUrls = new Set();
  const addThread = (url, title, typeLabel) => {
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    threads.push({ url, title, typeLabel });
  };
  
  // 1. Explicit
  for (const id of relatedIds) {
    const e = entries.find(x=>x.id===id);
    if(e) addThread(`/entry/${e.id}/`, e.title, 'Explicitly linked');
  }
  for (const e of entries) {
    if (e.related && e.related.includes(currentId)) addThread(`/entry/${e.id}/`, e.title, 'Referenced by');
  }
  // 3. Place
  if (data.location) {
    addThread(`/places/${placeSlugStr}/`, data.location, 'Location');
  }
  // 4. Same place
  if (data.location) {
    const samePlace = entries.filter(x=>x.location===data.location && x.id!==currentId);
    for (const item of samePlace.slice(0, 2)) addThread(`/entry/${item.id}/`, item.title, 'Same place');
  }
  // 5. Same tag
  if (tagVals.length > 0) {
    const sameTags = entries.filter(x=>x.id!==currentId && (x.tags||[]).some(t=>tagVals.includes(t)));
    for (const item of sameTags.slice(0, 2)) addThread(`/entry/${item.id}/`, item.title, 'Related thread');
  }
  const curatedThreads = threads.slice(0, 5);

  const headerHtml = renderEntryHeader(data, isPerson, niceDateStr, placeSlugStr, worldSlug);
  const coverHtml = renderEntryCover(data, isPerson, niceDateStr);
  let bodyHtml = typeof marked !== "undefined" ? marked.parse(data.story) : simpleMarkdown(data.story);
  bodyHtml = bodyHtml.replace(/<img([^>]*src="([^"]+\.(?:mp4|mov|webm|ogg)[^"]*)"[^>]*)>/gi, (match, attrs, src) => {
    const cleanSrc = src.split('#')[0];
    const titleMatch = attrs.match(/title="([^"]*)"/);
    const title = titleMatch ? titleMatch[1] : '';
    const meta = (typeof window.imageMetadata !== 'undefined' && (window.imageMetadata.get(cleanSrc) || window.imageMetadata.get(src))) || {};
    const wMatch = title.match(/w=([^,\s]+)/);
    const aMatch = title.match(/a=([^,\s]+)/);
    const width = meta.width || (wMatch ? wMatch[1] : '100%');
    const align = meta.align || (aMatch ? aMatch[1] : 'center');

    const wrapperStyle = `text-align:${align};margin:1.5em 0;`;
    const videoStyle = `max-width:100%;width:${width};height:auto;display:inline-block;vertical-align:middle;border-radius:4px;background:#000;box-shadow:0 4px 16px rgba(0,0,0,0.15);`;
    return `<div class="rc-video-wrapper" style="${wrapperStyle}"><video controls preload="metadata" playsinline src="${cleanSrc}" style="${videoStyle}"></video></div>`;
  });
  if (typeof transformPhotoStacks === "function") {
    bodyHtml = transformPhotoStacks(bodyHtml);
  }
  const tagsHtml = renderEntryTags(tagVals);
  const tracesHtml = renderPersonTraces(personTraces, niceDateFn);
  const contHtml = renderContinuation(curatedThreads);
  
  previewContent.innerHTML = `
    <article class="artifact-page ${isPerson ? 'person-artifact' : ''} ${getPresentationClasses(data.presentation)}" style="padding:0; min-height:auto;">
      ${headerHtml}
      ${coverHtml}
      <div class="artifact-body ${isPerson ? 'person-body' : ''}">
        <div class="prose">${bodyHtml}</div>
        ${tagsHtml}
      </div>
      ${tracesHtml}
    </article>
    <div style="margin-top: 60px;">
      ${contHtml}
    </div>
  `;
  
  // Promote markdown image titles to figcaptions in the preview (except images in photo stacks)
  previewContent.querySelectorAll('.prose img').forEach((el) => {
    const img = el; // let JS duck-typing handle it in browser, but we'll use getAttribute for TS
    if (img.closest('figure') || img.closest('.photo-stack-container')) return;
    
    const src = img.getAttribute('src');
    const title = img.getAttribute('title');
    if (!title && !(src && src.includes('#'))) return;
    
    const fig = document.createElement('figure');
    fig.className = 'story-image-figure';
    
    if (src && src.includes('#')) {
      const hash = src.split('#')[1];
      const params = new URLSearchParams(hash);
      if (params.get('s')) fig.classList.add('s-' + params.get('s'));
      if (params.get('a')) fig.classList.add('a-' + params.get('a'));
      if (params.get('t')) fig.classList.add('t-' + params.get('t'));
    }
    
    if (img.parentNode) {
      img.parentNode.insertBefore(fig, img);
      fig.appendChild(img);
      if (title) {
        const cap = document.createElement('figcaption');
        cap.textContent = title;
        fig.appendChild(cap);
      }
    }
  });

  // Initialize interactive gestures on photo stacks
  if (typeof initPhotoStacks === "function") {
    initPhotoStacks(previewContent);
  }
  
  // Update View Page button link in toolbar
  const btnViewPublic = document.getElementById('btn-view-public');
  if (btnViewPublic) {
    const curId = entryForm?.elements?.existingId?.value || '';
    btnViewPublic.href = curId ? `/entry/${curId}/` : '#';
    btnViewPublic.style.display = curId ? 'inline-flex' : 'none';
  }

  // PHASE 8H.5: INIT CANVAS EDITOR
  initCanvasEditor();
}

if (previewBtn) {
  previewBtn.onclick = () => {
    previewPane.hidden = false;
    previewBtn.hidden = true;
    closePreviewBtn.hidden = false;
    updatePreview();
  };
}
if (closePreviewBtn) {
  closePreviewBtn.onclick = () => {
    previewPane.hidden = true;
    previewBtn.hidden = false;
  };
}

entryForm.addEventListener('input', (e) => {
  updatePreview();
  if (e.target && e.target.id !== 'image' && typeof handleTyping === 'function') {
    handleTyping();
  }
});
entryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  window.goToEditor();
});



// Hide preview on cancel/delete
const oldCancel = $('#cancel').onclick;
$('#cancel').onclick = () => {
  oldCancel();
  previewBtn.hidden = true;
  previewPane.hidden = true;
};

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


let mentionTargetElement = storyTextarea;
let mentionTextNode = null;
let mentionNodeStartOffset = -1;

function insertMention(entity) {
  const insert = `@${entity.insertText} `;
  
  if (mentionTargetElement === storyTextarea) {
    const text = storyTextarea.value;
    const before = text.slice(0, mentionStartIndex);
    const after = text.slice(storyTextarea.selectionEnd);
    storyTextarea.value = before + insert + after;
    storyTextarea.selectionStart = storyTextarea.selectionEnd = mentionStartIndex + insert.length;
    storyTextarea.focus();
  } else {
    const sel = window.getSelection();
    if (mentionTextNode && sel.rangeCount > 0) {
      const range = document.createRange();
      range.setStart(mentionTextNode, mentionNodeStartOffset - 1);
      range.setEnd(mentionTextNode, sel.focusOffset);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, insert);
    }
    if (mentionTargetElement) mentionTargetElement.dispatchEvent(new Event('input'));
    mentionTargetElement.focus();
  }
  closeMentionBox();
}

function handleMentionInput(e) {
  mentionTargetElement = e.target;
  if (!mentionEntities.length) buildEntityIndex();
  
  let textBeforeCursor = '';
  
  if (mentionTargetElement === storyTextarea) {
    textBeforeCursor = storyTextarea.value.slice(0, storyTextarea.selectionStart);
  } else {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      mentionTextNode = sel.focusNode;
      if (mentionTextNode.nodeType === Node.TEXT_NODE) {
        textBeforeCursor = mentionTextNode.textContent.slice(0, sel.focusOffset);
      }
    }
  }
  
  const match = textBeforeCursor.match(/(?:\s|^)(@[\w-]*)$/);
  
  if (match) {
    mentionActive = true;
    if (mentionTargetElement === storyTextarea) {
      mentionStartIndex = storyTextarea.selectionStart - match[1].length + 1;
    } else {
      const sel = window.getSelection();
      mentionNodeStartOffset = sel.focusOffset - match[1].length + 1;
    }
    const query = match[1].slice(1);
    mentionSelectedIndex = 0;
    renderMentions(query);
  } else {
    closeMentionBox();
  }
}

function handleMentionKeydown(e) {
  if (!mentionActive) return;
  const totalItems = currentSuggestions.length > 0 ? currentSuggestions.length + 1 : 0;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    mentionSelectedIndex = (mentionSelectedIndex + 1) % totalItems;
    renderMentions(''); // we just re-render to update selected class, query doesn't matter for selection update, wait, it does!
    // actually, let's keep the existing logic that passes the current query
    let query = '';
    if (mentionTargetElement === storyTextarea) query = storyTextarea.value.slice(mentionStartIndex, storyTextarea.selectionStart);
    else if (mentionTextNode) query = mentionTextNode.textContent.slice(mentionNodeStartOffset, window.getSelection().focusOffset);
    renderMentions(query);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    mentionSelectedIndex = (mentionSelectedIndex - 1 + totalItems) % totalItems;
    let query = '';
    if (mentionTargetElement === storyTextarea) query = storyTextarea.value.slice(mentionStartIndex, storyTextarea.selectionStart);
    else if (mentionTextNode) query = mentionTextNode.textContent.slice(mentionNodeStartOffset, window.getSelection().focusOffset);
    renderMentions(query);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (currentSuggestions.length > 0 && mentionSelectedIndex < currentSuggestions.length) {
      insertMention(currentSuggestions[mentionSelectedIndex]);
    } else {
      alert("Create new entity feature will be fully enabled in a future phase.");
      closeMentionBox();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault(); // allow escape to cancel mention without closing inline editor immediately
    closeMentionBox();
    e.stopPropagation();
  }
}

// BlockNote owns the story surface in the active editor. The legacy textarea
// is optional, so its absence must never prevent the router from starting.
if (storyTextarea) {
  storyTextarea.addEventListener('input', handleMentionInput);
  storyTextarea.addEventListener('keydown', handleMentionKeydown);
}
// We will also bind these to inlineRich below!




// ==========================================
// PHASE 8E: BLOCK & SECTION EDITING
// ==========================================



let activeEditField = null;
let activeOriginalValue = '';
let activeOriginalPresentation = '{}';



if (typeof inlineInput !== 'undefined' && inlineInput) {
  inlineInput.addEventListener('input', () => {
    if (activeEditField && activeEditField !== 'cover') {
      entryForm.elements[activeEditField].value = inlineInput.value;
      updatePreview();
    }
    if (typeof handleTyping === 'function') handleTyping();
  });
  inlineInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInlineEditor(true);
  });
}

function renderOptions(key, label, options) {
  const p = getPres();
  const current = (p[activeEditField] && p[activeEditField][key]) || '';
  let html = `<div style="display:flex; align-items:center; justify-content:space-between;">
    <span style="color:var(--text-light); text-transform:uppercase; font-size:10px; font-family:var(--mono);">${label}</span>
    <select data-pres-key="${key}" style="padding:2px 4px; font-size:11px; font-family:var(--mono); background:var(--bg); border:1px solid var(--line); color:var(--text);">
      <option value="">Default</option>`;
  options.forEach(opt => {
    const val = opt.toLowerCase();
    html += `<option value="${val}" ${current === val ? 'selected' : ''}>${opt}</option>`;
  });
  html += `</select></div>`;
  return html;
}


function openInlineEditor(field, title, rect) {
  // Disabled. All editing is now direct on the canvas.
}

// ==========================================
// PHOTO STACK BUILDER MODAL
// ==========================================
let photoStackPhotos = []; // array of { url, caption, name, blockId }

function getAllStoryImages() {
  const list = [];
  const seenUrls = new Set();

  // 1. From BlockNote document if available
  if (window.USE_BLOCKNOTE_POC && window.BlockNotePOCModule && typeof window.BlockNotePOCModule.getStoryImages === 'function') {
    try {
      const bnImgs = window.BlockNotePOCModule.getStoryImages();
      for (const item of bnImgs) {
        if (item.url && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          list.push({
            blockId: item.blockId,
            url: item.url,
            caption: item.caption || item.name || '',
            name: item.name || item.url.split('/').pop() || 'Photo'
          });
        }
      }
    } catch (e) {}
  }

  // 2. From DOM (finds any rendered images in #blocknote-container)
  const container = document.getElementById('blocknote-container');
  if (container) {
    container.querySelectorAll('img').forEach(img => {
      if (img.closest('.photo-stack-container') || img.closest('.editor-photo-stack-preview')) return;
      const src = img.getAttribute('src') || '';
      if (!src.startsWith('/uploads/') && !src.startsWith('/images/')) return;

      const blockOuter = img.closest('[data-id]') || img.closest('.bn-block');
      const blockId = blockOuter ? blockOuter.getAttribute('data-id') : null;

      const existing = list.find(x => x.url === src);
      if (existing) {
        if (!existing.blockId && blockId) existing.blockId = blockId;
      } else if (!seenUrls.has(src)) {
        seenUrls.add(src);
        list.push({
          blockId: blockId || null,
          url: src,
          caption: img.getAttribute('alt') || img.getAttribute('title') || '',
          name: src.split('/').pop() || 'Photo'
        });
      }
    });
  }

  // 3. Fallback: parse markdown from textarea if list is still empty
  if (list.length === 0 && entryForm?.elements?.story?.value) {
    const md = entryForm.elements.story.value;
    const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
    let match;
    while ((match = re.exec(md)) !== null) {
      const alt = match[1] || '';
      const url = match[2];
      const title = match[3] || alt;
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        list.push({
          blockId: null,
          url,
          caption: title,
          name: url.split('/').pop() || 'Photo'
        });
      }
    }
  }

  return list;
}

function initPhotoStackModal() {
  const btnAddPhotoStack = document.getElementById('btn-add-photo-stack');
  const modalBackdrop = document.getElementById('photo-stack-modal-backdrop');
  const btnClose = document.getElementById('btn-close-photo-stack-modal');
  const btnCancel = document.getElementById('btn-cancel-photo-stack');
  const btnInsert = document.getElementById('btn-insert-photo-stack');
  const fileInput = document.getElementById('photo-stack-file-input');
  const statusEl = document.getElementById('photo-stack-status');
  const listEl = document.getElementById('photo-stack-items-list');
  const pagePhotosGrid = document.getElementById('photo-stack-page-photos-grid');
  const countBadge = document.getElementById('photo-stack-count-badge');
  const replaceCheckbox = document.getElementById('photo-stack-replace-checkbox');
  const btnSelectAllStory = document.getElementById('btn-select-all-story-photos');
  const btnClearStory = document.getElementById('btn-clear-story-photos');

  if (!btnAddPhotoStack || !modalBackdrop) return;

  let storyPhotos = [];

  function openModal(preselected = null) {
    storyPhotos = getAllStoryImages();

    // Determine initial stack photos
    if (preselected && Array.isArray(preselected) && preselected.length > 0) {
      photoStackPhotos = preselected.map(p => ({
        url: p.url,
        caption: p.caption || '',
        name: p.name || '',
        blockId: p.blockId || null,
        pos: p.pos || 'center'
      }));
    } else if (selectedCanvasPhotos.size > 0) {
      photoStackPhotos = Array.from(selectedCanvasPhotos.values()).map(p => ({
        url: p.url,
        caption: p.caption || '',
        name: p.name || '',
        blockId: p.blockId || null,
        pos: p.pos || 'center'
      }));
    } else {
      photoStackPhotos = [];
    }

    const defaultFitRadio = document.querySelector('input[name="photo-stack-fit-mode"][value="contain"]');
    if (defaultFitRadio) defaultFitRadio.checked = true;

    if (replaceCheckbox) replaceCheckbox.checked = true;
    if (statusEl) statusEl.textContent = '';

    renderStoryPhotosGrid();
    renderPhotoStackList();
    modalBackdrop.style.display = 'flex';
  }

  window.openPhotoStackModal = openModal;

  function closeModal() {
    modalBackdrop.style.display = 'none';
    photoStackPhotos = [];
    if (fileInput) fileInput.value = '';
    if (statusEl) statusEl.textContent = '';
  }

  function renderStoryPhotosGrid() {
    if (!pagePhotosGrid) return;
    if (storyPhotos.length === 0) {
      pagePhotosGrid.innerHTML = `
        <div style="font-size:11px; color:var(--text-light); font-family:var(--mono); padding:12px; text-align:center; width:100%;">
          No existing photos found on this page. Upload new ones below!
        </div>
      `;
      return;
    }

    pagePhotosGrid.innerHTML = storyPhotos.map((photo, i) => {
      const isSelected = photoStackPhotos.some(p => p.url === photo.url);
      const cap = escapeAttr(photo.caption || photo.name || `Photo ${i+1}`);
      return `
        <div class="photo-stack-thumb-card ${isSelected ? 'is-selected' : ''}" data-url="${escapeAttr(photo.url)}" data-index="${i}" title="${cap}">
          <img src="${photo.url}" alt="${cap}" style="width:100%; height:100%; object-fit:cover; pointer-events:none;">
          <div class="thumb-check-badge">${isSelected ? '✓' : '+'}</div>
        </div>
      `;
    }).join('');

    // Attach click listeners on thumb cards
    pagePhotosGrid.querySelectorAll('.photo-stack-thumb-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        const storyPhoto = storyPhotos.find(p => p.url === url);
        if (!storyPhoto) return;

        const existingIdx = photoStackPhotos.findIndex(p => p.url === url);
        if (existingIdx !== -1) {
          // Deselect
          photoStackPhotos.splice(existingIdx, 1);
        } else {
          // Select
          photoStackPhotos.push({
            url: storyPhoto.url,
            caption: storyPhoto.caption || '',
            name: storyPhoto.name || '',
            blockId: storyPhoto.blockId || null
          });
        }
        syncStoryPhotosGridSelection();
        renderPhotoStackList();
      });
    });
  }

  function syncStoryPhotosGridSelection() {
    if (!pagePhotosGrid) return;
    const selectedUrls = new Set(photoStackPhotos.map(p => p.url));
    pagePhotosGrid.querySelectorAll('.photo-stack-thumb-card').forEach(card => {
      const isSel = selectedUrls.has(card.dataset.url);
      if (isSel) {
        card.classList.add('is-selected');
        const badge = card.querySelector('.thumb-check-badge');
        if (badge) badge.textContent = '✓';
      } else {
        card.classList.remove('is-selected');
        const badge = card.querySelector('.thumb-check-badge');
        if (badge) badge.textContent = '+';
      }
    });
  }

  btnSelectAllStory?.addEventListener('click', () => {
    for (const sp of storyPhotos) {
      if (!photoStackPhotos.some(p => p.url === sp.url)) {
        photoStackPhotos.push({
          url: sp.url,
          caption: sp.caption || '',
          name: sp.name || '',
          blockId: sp.blockId || null
        });
      }
    }
    syncStoryPhotosGridSelection();
    renderPhotoStackList();
  });

  btnClearStory?.addEventListener('click', () => {
    const storyUrls = new Set(storyPhotos.map(sp => sp.url));
    photoStackPhotos = photoStackPhotos.filter(p => !storyUrls.has(p.url));
    syncStoryPhotosGridSelection();
    renderPhotoStackList();
  });

  btnAddPhotoStack.addEventListener('click', () => openModal());
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop.style.display === 'flex') {
      closeModal();
    }
  });

  function renderPhotoStackList() {
    if (countBadge) {
      countBadge.textContent = `${photoStackPhotos.length} card${photoStackPhotos.length !== 1 ? 's' : ''}`;
    }

    if (!listEl) return;
    if (photoStackPhotos.length === 0) {
      listEl.innerHTML = `
        <div id="photo-stack-empty-msg" style="text-align:center; padding:32px 16px; color:var(--text-light); font-size:12px; font-family:var(--mono);">
          No photos selected yet.<br>Click photos above or "+ Upload More Photos" to add to this stack.
        </div>
      `;
      if (btnInsert) btnInsert.disabled = true;
      return;
    }

    if (btnInsert) btnInsert.disabled = false;
    listEl.innerHTML = photoStackPhotos.map((photo, i) => `
      <div class="photo-stack-builder-row" data-index="${i}" style="display:flex; align-items:center; gap:8px; background:var(--paper); border:1px solid var(--line); border-radius:4px; padding:6px 10px;">
        <div style="width:40px; height:40px; border-radius:3px; overflow:hidden; background:#222; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          <img src="${photo.url}" alt="${escapeAttr(photo.caption || '')}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <div style="flex:1; min-width:0; display:flex; gap:6px;">
          <input type="text" class="photo-stack-row-caption" data-index="${i}" placeholder="Card caption (e.g. At the beach)" value="${escapeAttr(photo.caption || '')}" style="flex:1; min-width:0; padding:6px 8px; font-family:var(--mono); font-size:12px; border:1px solid var(--line); border-radius:3px; background:var(--bg); color:var(--text); box-sizing:border-box;">
          <select class="photo-stack-row-pos" data-index="${i}" title="Focal point if frame is filled" style="width:78px; padding:6px 4px; font-family:var(--mono); font-size:11px; border:1px solid var(--line); border-radius:3px; background:var(--bg); color:var(--text); cursor:pointer;">
            <option value="center" ${(photo.pos || 'center') === 'center' ? 'selected' : ''}>Center</option>
            <option value="top" ${photo.pos === 'top' ? 'selected' : ''}>Top</option>
            <option value="bottom" ${photo.pos === 'bottom' ? 'selected' : ''}>Bottom</option>
          </select>
        </div>
        <div style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
          <button type="button" class="btn-photo-up secondary" data-index="${i}" title="Move up" style="padding:4px 8px; font-size:11px; cursor:pointer;" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn-photo-down secondary" data-index="${i}" title="Move down" style="padding:4px 8px; font-size:11px; cursor:pointer;" ${i === photoStackPhotos.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn-photo-del secondary" data-index="${i}" title="Remove photo" style="padding:4px 8px; font-size:11px; color:#d9534f; cursor:pointer;">✕</button>
        </div>
      </div>
    `).join('');

    // Attach caption change listeners
    listEl.querySelectorAll('.photo-stack-row-caption').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.index);
        if (photoStackPhotos[idx]) {
          photoStackPhotos[idx].caption = e.target.value;
        }
      });
    });

    // Attach focal point listeners
    listEl.querySelectorAll('.photo-stack-row-pos').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.index);
        if (photoStackPhotos[idx]) {
          photoStackPhotos[idx].pos = e.target.value;
        }
      });
    });

    // Move up
    listEl.querySelectorAll('.btn-photo-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        if (idx > 0) {
          const temp = photoStackPhotos[idx];
          photoStackPhotos[idx] = photoStackPhotos[idx - 1];
          photoStackPhotos[idx - 1] = temp;
          renderPhotoStackList();
        }
      });
    });

    // Move down
    listEl.querySelectorAll('.btn-photo-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        if (idx < photoStackPhotos.length - 1) {
          const temp = photoStackPhotos[idx];
          photoStackPhotos[idx] = photoStackPhotos[idx + 1];
          photoStackPhotos[idx + 1] = temp;
          renderPhotoStackList();
        }
      });
    });

    // Delete
    listEl.querySelectorAll('.btn-photo-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        photoStackPhotos.splice(idx, 1);
        syncStoryPhotosGridSelection();
        renderPhotoStackList();
      });
    });
  }

  // Handle file uploads
  fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (statusEl) statusEl.textContent = `Uploading ${files.length} photo(s)...`;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: file.name, type: file.type, dataUrl })
        });
        const data = await res.json();
        if (data.url) {
          const nameClean = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
          photoStackPhotos.push({
            url: data.url,
            caption: nameClean,
            name: file.name,
            blockId: null
          });
        }
      } catch (err) {
        console.error('Error uploading photo for stack', err);
      }
    }

    if (statusEl) statusEl.textContent = `Added ${files.length} photo(s).`;
    fileInput.value = '';
    renderPhotoStackList();
  });

  // Handle Insert Stack
  btnInsert?.addEventListener('click', async () => {
    if (photoStackPhotos.length === 0) return;

    const fitRadio = document.querySelector('input[name="photo-stack-fit-mode"]:checked');
    const stackFit = fitRadio ? fitRadio.value : 'contain';

    // Generate markdown block
    const stackLines = [
      `:::stack fit=${stackFit}`,
      ''
    ];
    for (const p of photoStackPhotos) {
      const cap = (p.caption || '').trim();
      const posToken = (p.pos && p.pos !== 'center') ? ` pos=${p.pos}` : '';
      const titleAttr = (cap || posToken) ? ` "${cap}${posToken}"` : '';
      stackLines.push(`![${cap}](${p.url}${titleAttr})`);
      stackLines.push('');
    }
    stackLines.push(':::');
    const stackMd = stackLines.join('\n');

    const doReplace = replaceCheckbox ? replaceCheckbox.checked : true;
    let inserted = false;

    // Ensure we have blockIds for all story photos in BlockNote mode
    if (window.USE_BLOCKNOTE_POC && window.BlockNotePOCModule) {
      try {
        const currentStoryImgs = typeof window.BlockNotePOCModule.getStoryImages === 'function' ? window.BlockNotePOCModule.getStoryImages() : [];
        for (const p of photoStackPhotos) {
          if (!p.blockId) {
            const match = currentStoryImgs.find(img => img.url === p.url);
            if (match) p.blockId = match.blockId;
          }
        }
      } catch (e) {}
    }

    const blockIdsToReplace = doReplace ? photoStackPhotos.map(p => p.blockId).filter(Boolean) : [];

    if (window.USE_BLOCKNOTE_POC && window.BlockNotePOCModule) {
      if (doReplace && blockIdsToReplace.length > 0 && typeof window.BlockNotePOCModule.replaceImagesWithStack === 'function') {
        inserted = await window.BlockNotePOCModule.replaceImagesWithStack(blockIdsToReplace, stackMd);
      } else if (typeof window.BlockNotePOCModule.insertMarkdownAtCursor === 'function') {
        inserted = await window.BlockNotePOCModule.insertMarkdownAtCursor(stackMd);
      }

      if (inserted) {
        try {
          const md = await window.BlockNotePOCModule.getBlockNoteMarkdown();
          if (entryForm.elements.story) entryForm.elements.story.value = md;
        } catch (e) {}
      }
    }

    if (!inserted) {
      // Fallback: textarea mode
      const storyEl = entryForm?.elements?.story;
      if (storyEl) {
        let curVal = storyEl.value || '';
        if (doReplace) {
          // Find first occurrence of any selected photo to place the stack there
          let firstMatchIdx = -1;
          for (const p of photoStackPhotos) {
            const esc = escapeRegex(p.url);
            const re = new RegExp(`!\\[[^\\]]*\\]\\(${esc}[^)]*\\)\\n*`, 'g');
            const match = re.exec(curVal);
            if (match && (firstMatchIdx === -1 || match.index < firstMatchIdx)) {
              firstMatchIdx = match.index;
            }
          }

          for (const p of photoStackPhotos) {
            const esc = escapeRegex(p.url);
            const re = new RegExp(`!\\[[^\\]]*\\]\\(${esc}[^)]*\\)\\n*`, 'g');
            curVal = curVal.replace(re, '');
          }

          if (firstMatchIdx !== -1) {
            curVal = curVal.slice(0, firstMatchIdx) + stackMd + '\n\n' + curVal.slice(firstMatchIdx);
          } else {
            curVal = curVal ? `${curVal}\n\n${stackMd}\n` : `${stackMd}\n`;
          }
          storyEl.value = curVal.trim();
        } else {
          storyEl.value = curVal ? `${curVal}\n\n${stackMd}\n` : `${stackMd}\n`;
        }
        storyEl.dispatchEvent(new Event('input', { bubbles: true }));
        inserted = true;
      }
    }

    clearCanvasPhotoSelection();
    if (typeof window.markDirty === 'function') window.markDirty();
    updatePreview();
    closeModal();
  });
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

initPhotoStackModal();




// ==========================================
// PHASE 8G: IMAGE STUDIO
// ==========================================
let studioMode = null; // 'cover' or 'story'
let studioBlockIndex = null;
let studioOriginalUrl = '';
let studioTargetImg = null;

const studioModal = $('#image-studio-modal');
const isPreviewImg = $('#is-preview-img');
const isCaption = $('#is-caption');
const isAlt = $('#is-alt');
const isSize = $('#is-size');
const isAlign = $('#is-align');
const isTreatment = $('#is-treatment');

window.openImageStudio = openImageStudio;
function openImageStudio(mode, blockIndex, targetEl) {
  studioMode = mode;
  studioBlockIndex = blockIndex;
  studioTargetImg = targetEl;
  
  if (mode === 'cover') {
    studioOriginalUrl = entryForm.elements.cover.value;
    const p = getPres();
    const coverPres = p.cover || {};
    isCaption.value = coverPres.caption || '';
    isAlt.value = coverPres.alt || '';
    isSize.value = coverPres.size || '';
    isAlign.value = coverPres.align || '';
    isTreatment.value = coverPres.treatment || '';
  } else {
    // Story image
    const block = storyBlocks[blockIndex];
    const raw = block.raw;
    // Parse markdown: ![alt](url#hash "title")
    const match = raw.match(/!\[(.*?)\]\((.*?)\)/);
    if (match) {
      isAlt.value = match[1] || '';
      let urlPart = match[2];
      let title = '';
      const titleMatch = urlPart.match(/(.*?)\s+"(.*?)"$/);
      if (titleMatch) {
        urlPart = titleMatch[1];
        title = titleMatch[2];
      }
      isCaption.value = title;
      
      let baseUrl = urlPart;
      let hash = '';
      if (urlPart.includes('#')) {
        [baseUrl, hash] = urlPart.split('#');
      }
      studioOriginalUrl = baseUrl;
      
      const params = new URLSearchParams(hash);
      isSize.value = params.get('s') || '';
      isAlign.value = params.get('a') || '';
      isTreatment.value = params.get('t') || '';
    }
  }
  
  isPreviewImg.src = studioOriginalUrl;
  studioModal.hidden = false;
}

window.closeImageStudio = closeImageStudio;
function closeImageStudio() {
  studioModal.hidden = true;
  stopCrop();
}

window.saveImageStudio = saveImageStudio;
function saveImageStudio() {
  if (studioMode === 'cover') {
    entryForm.elements.cover.value = studioOriginalUrl;
    const p = getPres();
    if (!p.cover) p.cover = {};
    if (isCaption.value) p.cover.caption = isCaption.value; else delete p.cover.caption;
    if (isAlt.value) p.cover.alt = isAlt.value; else delete p.cover.alt;
    if (isSize.value) p.cover.size = isSize.value; else delete p.cover.size;
    if (isAlign.value) p.cover.align = isAlign.value; else delete p.cover.align;
    if (isTreatment.value) p.cover.treatment = isTreatment.value; else delete p.cover.treatment;
    setPres(p);
  } else {
    // Story image
    let hashParams = new URLSearchParams();
    if (isSize.value) hashParams.set('s', isSize.value);
    if (isAlign.value) hashParams.set('a', isAlign.value);
    if (isTreatment.value) hashParams.set('t', isTreatment.value);
    
    let hashStr = hashParams.toString();
    if (hashStr) hashStr = '#' + hashStr;
    
    let urlPart = studioOriginalUrl + hashStr;
    if (isCaption.value) urlPart += ` "${isCaption.value}"`;
    
    storyBlocks[studioBlockIndex].raw = `![${isAlt.value}](${urlPart})`;
    updateStoryFromBlocks();
    renderBlockEditor();
  }
  
  updatePreview();
  closeImageStudio();
  if (isCropping) {
    captureSnapshot('Cropped image');
    isCropping = false;
  } else {
    handleTyping(); // debounced for normal text/dropdown changes in studio
  }
}

// Live Updates inside studio
[isCaption, isAlt, isSize, isAlign, isTreatment].forEach(el => {
  el.addEventListener('input', () => {
    // we can update preview instantly
    if (studioMode === 'cover') {
       saveImageStudio(); 
       studioModal.hidden = false; // keep it open
    } else {
       saveImageStudio();
       studioModal.hidden = false;
    }
  });
});

$('#is-btn-save').onclick = saveImageStudio;
$('#is-btn-remove').onclick = () => {
  if (studioMode === 'cover') {
    entryForm.elements.cover.value = '';
    const p = getPres();
    delete p.cover;
    setPres(p);
  } else {
    deleteBlock(studioBlockIndex);
  }
  updatePreview();
  closeImageStudio();
  captureSnapshot('Removed image');
};

$('#is-btn-replace').onclick = () => {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
    const result = await request('/api/image', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:file.name, dataUrl})});
    studioOriginalUrl = result.url;
    isPreviewImg.src = studioOriginalUrl;
    saveImageStudio();
    studioModal.hidden = false;
    captureSnapshot('Replaced image');
  };
  fileInput.click();
};

// CROP IMPLEMENTATION
const cropOverlay = $('#crop-overlay');
const cropBox = $('#crop-box');
let isCropping = false;
let startX, startY, cropW, cropH;

$('#is-btn-crop').onclick = () => {
  isCropping = true;
  $('#is-btn-crop').style.display = 'none';
  $('#is-crop-actions').style.display = 'flex';
  cropOverlay.style.display = 'block';
  // default box
  cropBox.style.left = '10%'; cropBox.style.top = '10%';
  cropBox.style.width = '80%'; cropBox.style.height = '80%';
  $('#is-crop-ratio').value = 'free';
};

$('#is-crop-ratio').onchange = (e) => {
  const ratio = parseFloat(e.target.value);
  if (!ratio) return;
  const w = cropOverlay.offsetWidth * 0.8;
  let h = w / ratio;
  if (h > cropOverlay.offsetHeight * 0.8) {
    h = cropOverlay.offsetHeight * 0.8;
    w = h * ratio;
  }
  cropBox.style.width = w + 'px';
  cropBox.style.height = h + 'px';
  cropBox.style.left = ((cropOverlay.offsetWidth - w) / 2) + 'px';
  cropBox.style.top = ((cropOverlay.offsetHeight - h) / 2) + 'px';
};

$('#is-btn-crop-cancel').onclick = stopCrop;

function stopCrop() {
  isCropping = false;
  $('#is-btn-crop').style.display = 'block';
  $('#is-crop-actions').style.display = 'none';
  cropOverlay.style.display = 'none';
}

let dragging = false, resizing = false;
cropOverlay.onmousedown = (e) => {
  if (e.target === cropBox) { dragging = true; }
  startX = e.clientX; startY = e.clientY;
};
window.onmousemove = (e) => {
  if (!isCropping) return;
  if (dragging) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    cropBox.style.left = (cropBox.offsetLeft + dx) + 'px';
    cropBox.style.top = (cropBox.offsetTop + dy) + 'px';
    startX = e.clientX; startY = e.clientY;
  }
};
window.onmouseup = () => { dragging = false; resizing = false; };

$('#is-btn-crop-confirm').onclick = async () => {
  // Compute crop
  const imgRect = isPreviewImg.getBoundingClientRect();
  const boxRect = cropBox.getBoundingClientRect();
  
  const scaleX = isPreviewImg.naturalWidth / imgRect.width;
  const scaleY = isPreviewImg.naturalHeight / imgRect.height;
  
  const cx = (boxRect.left - imgRect.left) * scaleX;
  const cy = (boxRect.top - imgRect.top) * scaleY;
  const cw = boxRect.width * scaleX;
  const ch = boxRect.height * scaleY;
  
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(isPreviewImg, cx, cy, cw, ch, 0, 0, cw, ch);
  
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  // deterministic naming for derived image
  const extIndex = studioOriginalUrl.lastIndexOf('.');
  const baseName = studioOriginalUrl.substring(studioOriginalUrl.lastIndexOf('/') + 1, extIndex !== -1 ? extIndex : undefined);
  const newName = baseName + '--crop-' + Date.now() + '.jpg';
  
  const result = await request('/api/image', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:newName, dataUrl})});
  
  studioOriginalUrl = result.url;
  isPreviewImg.src = studioOriginalUrl;
  stopCrop();
  saveImageStudio();
  captureSnapshot('Cropped image');
  studioModal.hidden = false;
};


// ==========================================
// PHASE 8H: HISTORY ENGINE
// ==========================================
const HISTORY_LIMIT = 50;
let historyStack = [];
let historyIndex = -1;
let savedStateStr = '';
let typingTimer;

const btnUndo = $('#btn-undo');
const btnRedo = $('#btn-redo');
const btnHistory = $('#btn-history');
const historyPanel = $('#history-panel');
const dirtyIndicator = $('#dirty-indicator');

function getEditorState() {
  const form = $('#entry-form');
  const typeSelect = document.getElementById('type-select');
  const worldSelect = document.getElementById('world-select');
  const currentType = typeSelect?.value || (typeof activeType !== 'undefined' ? activeType : '');
  const currentWorld = worldSelect?.value || (currentType ? (typeWorld[currentType] || 'life') : '');

  return {
    type: currentType,
    world: currentWorld,
    title: form.elements.title ? form.elements.title.value : '',
    date: form.elements.date ? form.elements.date.value : '',
    location: form.elements.location ? form.elements.location.value : '',
    story: typeof storyBlocks !== 'undefined' ? storyBlocks.map(b => b.raw).join('\n\n') : (form.elements.story ? form.elements.story.value : ''),
    cover: form.elements.cover ? form.elements.cover.value : '',
    presentation: form.elements.presentation ? form.elements.presentation.value : '{}',
    description: form.elements.description ? form.elements.description.value : '',
    tags: [...form.querySelectorAll('input[name="tags"]:checked')].map(x=>x.value),
    newTag: form.elements.newTag ? form.elements.newTag.value : '',
    related: [...form.querySelectorAll('input[name="related"]:checked')].map(x=>x.value),
    people: form.elements.people ? form.elements.people.value : '',
    featured: form.elements.featured ? form.elements.featured.checked : false,
    status: form.elements.status ? form.elements.status.value : '',
    accent: form.elements.accent ? form.elements.accent.value : ''
  };
}

function captureSnapshot(label = 'Entry changed') {
  const form = $('#entry-form');
  if (!activeType && !form.elements.existingId.value) return;
  const state = getEditorState();
  const stateStr = JSON.stringify(state);
  
  if (historyIndex >= 0 && JSON.stringify(historyStack[historyIndex].state) === stateStr) return;
  
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }
  
  historyStack.push({ state, label, timestamp: Date.now() });
  
  if (historyStack.length > HISTORY_LIMIT) {
    historyStack.shift();
    // historyIndex stays at HISTORY_LIMIT - 1 because we just removed the first element
  } else {
    historyIndex++;
  }
  
  updateHistoryUI();
}

function handleTyping() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    captureSnapshot('Edited text');
  }, 1000);
}

function restoreSnapshot(index) {
  if (index < 0 || index >= historyStack.length) return;
  const state = historyStack[index].state;
  const form = $('#entry-form');
  
  if (form.elements.title) form.elements.title.value = state.title;
  if (form.elements.date) form.elements.date.value = state.date;
  if (form.elements.location) form.elements.location.value = state.location;
  if (form.elements.cover) form.elements.cover.value = state.cover;
  if (form.elements.presentation) form.elements.presentation.value = state.presentation;
  if (form.elements.description) form.elements.description.value = state.description;
  if (form.elements.people) form.elements.people.value = state.people;
  if (form.elements.newTag) form.elements.newTag.value = state.newTag || '';
  if (form.elements.featured) form.elements.featured.checked = state.featured || false;
  if (form.elements.status) form.elements.status.value = state.status || '';
  if (form.elements.accent) form.elements.accent.value = state.accent || '';
  if (state.type) {
    if (typeof activeType !== 'undefined') activeType = state.type;
    const typeSelect = document.getElementById('type-select');
    if (typeSelect) typeSelect.value = state.type;
  }
  if (state.world) {
    const worldSelect = document.getElementById('world-select');
    if (worldSelect) worldSelect.value = state.world;
  }
  
  // Restore tags
  form.querySelectorAll('input[name="tags"]').forEach(cb => {
    cb.checked = state.tags.includes(cb.value);
  });
  
  // Restore related
  form.querySelectorAll('input[name="related"]').forEach(cb => {
    cb.checked = state.related.includes(cb.value);
  });
  
  const layoutSelect = $('#layout-mode-select');
  if (layoutSelect) {
    try {
      const p = JSON.parse(state.presentation);
      layoutSelect.value = (p.layout && p.layout.mode) ? p.layout.mode : 'default';
    } catch(e){}
  }
  
  storyBlocks = typeof parseMarkdownToBlocks !== 'undefined' ? parseMarkdownToBlocks(state.story) : [];
  
  if (typeof activeEditField !== 'undefined' && activeEditField && activeEditField !== 'cover') {
     if (activeEditField === 'story') {
       if (typeof renderBlockEditor !== 'undefined') renderBlockEditor();
     } else {
       if (typeof inlineInput !== 'undefined') inlineInput.value = state[activeEditField];
     }
  } else if (typeof activeEditField !== 'undefined' && activeEditField === 'story') {
     if (typeof renderBlockEditor !== 'undefined') renderBlockEditor();
  }
  
  // If we are not inline editing, we might need to just update block editor and preview
  if (typeof renderBlockEditor !== 'undefined') renderBlockEditor();
  
  historyIndex = index;
  updateHistoryUI();
  if (typeof updatePreview !== 'undefined') updatePreview();
}

window.restoreSnapshot = restoreSnapshot;

function undo(e) {
  if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }
  if (window.USE_BLOCKNOTE_POC && window.BlockNotePOCModule && window.BlockNotePOCModule.isBlockNoteReady()) {
    // Delegate to BlockNote's native ProseMirror undo history
    window.BlockNotePOCModule.undoStory();
    window.markDirty();
  } else {
    if (historyIndex > 0) restoreSnapshot(historyIndex - 1);
  }
}
function redo(e) {
  if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); }
  if (window.USE_BLOCKNOTE_POC && window.BlockNotePOCModule && window.BlockNotePOCModule.isBlockNoteReady()) {
    // Delegate to BlockNote's native ProseMirror redo history
    window.BlockNotePOCModule.redoStory();
    window.markDirty();
  } else {
    if (historyIndex < historyStack.length - 1) restoreSnapshot(historyIndex + 1);
  }
}

window.undo = undo;
window.redo = redo;

if (btnUndo) {
  btnUndo.onmousedown = (e) => e.preventDefault();
  btnUndo.onclick = undo;
}
if (btnRedo) {
  btnRedo.onmousedown = (e) => e.preventDefault();
  btnRedo.onclick = redo;
}

function updateHistoryUI() {
  if (!btnUndo) return;

  if (window.USE_BLOCKNOTE_POC) {
    // BlockNote manages its own undo/redo history internally.
    // We cannot cheaply query ProseMirror's can().undo() here, so keep buttons always enabled.
    // The dirty indicator is already managed by markDirty() / setDirty() via the BlockNote onChange callback.
    btnUndo.disabled = false;
    btnRedo.disabled = false;
    if (historyPanel && historyPanel.style.display !== 'none') {
      renderHistoryPanel();
    }
    return;
  }

  // Non-BlockNote mode: use snapshot-based enable/disable
  btnUndo.disabled = historyIndex <= 0;
  btnRedo.disabled = historyIndex >= historyStack.length - 1;
  
  const currentStateStr = historyIndex >= 0 ? JSON.stringify(historyStack[historyIndex].state) : '';
  const isDirty = currentStateStr !== savedStateStr;
  dirtyIndicator.textContent = isDirty ? '● Unsaved' : 'Saved';
  dirtyIndicator.style.color = isDirty ? 'var(--accent, #e59a72)' : 'var(--text-light)';
  
  if (historyPanel && historyPanel.style.display !== 'none') {
    renderHistoryPanel();
  }
}

function renderHistoryPanel() {
  let html = '<div style="margin-bottom:8px; font-weight:bold;">History</div>';
  const reversed = [...historyStack].reverse();
  reversed.forEach((snap, i) => {
    const actualIndex = historyStack.length - 1 - i;
    const isCurrent = actualIndex === historyIndex;
    const timeAgo = Math.round((Date.now() - snap.timestamp) / 1000);
    let timeStr = timeAgo < 60 ? 'Just now' : Math.floor(timeAgo/60) + 'm ago';
    html += `<div style="padding:4px; margin-bottom:4px; border-radius:4px; cursor:pointer; background:${isCurrent ? 'var(--line)' : 'transparent'};" onclick="restoreSnapshot(${actualIndex})">
      <div style="color:var(--text);">${snap.label}</div>
      <div style="color:var(--text-light); font-size:9px;">${timeStr}</div>
    </div>`;
  });
  historyPanel.innerHTML = html;
}

if (btnHistory) {
  btnHistory.onclick = () => {
    historyPanel.style.display = historyPanel.style.display === 'none' ? 'block' : 'none';
    if (historyPanel.style.display === 'block') renderHistoryPanel();
  };
}

document.addEventListener('keydown', (e) => {
  if (typeof previewPane !== 'undefined' && previewPane.hidden) return; // only when editor pane is open

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod) return;

  const key = e.key.toLowerCase();
  const isUndo = key === 'z' && !e.shiftKey;
  const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
  if (!isUndo && !isRedo) return;

  // 1. If focus is inside a native form input, let the browser handle it (textarea/input undo works natively).
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

  // 2. If focus is inside the BlockNote editor container, let ProseMirror handle Cmd+Z natively.
  //    Do NOT call preventDefault — that would prevent BlockNote from receiving the event.
  const blocknoteContainer = document.getElementById('blocknote-container');
  if (blocknoteContainer && blocknoteContainer.contains(active)) return;

  // 3. Focus is on a toolbar button or elsewhere: route to our undo/redo.
  //    When BlockNote is active these delegate to BlockNote's undoStory()/redoStory().
  e.preventDefault();
  if (isRedo) redo();
  else undo();
});



// ==========================================
// PHASE 8H.5: TRUE VISUAL CANVAS EDITOR
// ==========================================


const style = document.createElement('style');
style.textContent = `
  [contenteditable="true"]:empty:before {
    content: attr(data-placeholder);
    color: rgba(30, 37, 30, 0.3);
    pointer-events: none;
    display: block; /* Ensures empty block has height */
  }
  .canvas-block-content {
    min-height: 1.5em;
  }
`;
document.head.appendChild(style);

function initCanvasEditor() {
  const titleEl = previewContent.querySelector('h1.person-title, .artifact-title-group h1');
  const descEl = previewContent.querySelector('.person-description, .entry-description');
  const proseEl = previewContent.querySelector('.prose');
  
  if (titleEl) {
    titleEl.contentEditable = 'true';
    titleEl.style.outline = 'none';
    titleEl.dataset.placeholder = 'Untitled';
    if (!titleEl.innerText.trim() || titleEl.innerText.trim() === 'Untitled') {
      titleEl.innerHTML = '';
    }
    titleEl.oninput = (e) => {
      if (entryForm.elements.title) {
        entryForm.elements.title.value = e.target.innerText.trim();
        handleTyping();
      }
    };
  }
  
  if (descEl) {
    descEl.contentEditable = 'true';
    descEl.style.outline = 'none';
    descEl.dataset.placeholder = 'Add a short description...';
    if (!descEl.innerText.trim()) {
      descEl.innerHTML = '';
    }
    descEl.oninput = (e) => {
      if (entryForm.elements.description) {
        entryForm.elements.description.value = e.target.innerText.trim();
        handleTyping();
      }
    };
  }
  
  if (proseEl) {
    if (window.USE_BLOCKNOTE_POC) {
      proseEl.innerHTML = '<div id="blocknote-container"></div>';
      import('./blocknote-poc.js').then(module => {
        window.BlockNotePOCModule = module;
        const markdown = document.forms['entry-form'].elements.story.value || '';
        module.mountBlockNotePOC('blocknote-container', markdown);
        // Set up image resize/alignment overlay (MutationObserver catches async-rendered images)
        setTimeout(() => setupImageResizeUI('blocknote-container'), 200);
      });
      // Ensure CSS is loaded
      if (!document.getElementById('blocknote-css')) {
        const link = document.createElement('link');
        link.id = 'blocknote-css';
        link.rel = 'stylesheet';
        link.href = '/blocknote-poc.css';
        document.head.appendChild(link);
      }
    } else {
      import('./blocknote-poc.js').then(module => module.unmountBlockNotePOC());
      renderCanvasBlocks(proseEl);
    }
  }
}

function renderCanvasBlocks(container) {
  container.innerHTML = '';
  
  if (!storyBlocks || storyBlocks.length === 0) {
    storyBlocks = [{ id: Math.random().toString(36).slice(2), raw: '' }];
  }
  
  storyBlocks.forEach((block, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'canvas-block';
    wrap.dataset.index = index;
    wrap.draggable = true;
    wrap.style.cssText = 'position:relative; margin-bottom:1em; outline:none; transition:box-shadow 0.2s; border-radius:4px;';
    
    let html = typeof marked !== 'undefined' ? marked.parse(block.raw) : block.raw;
    if (!html.trim()) html = '';
    
    wrap.innerHTML = `
      <div class="block-drag-handle" style="position:absolute; left:-40px; top:4px; display:flex; flex-direction:column; gap:4px; opacity:0; transition:opacity 0.2s;">
        <div style="cursor:grab; color:var(--text-light); padding:4px; line-height:1;" title="Drag to move">≡</div>
        <button type="button" onclick="deleteBlock(${index})" style="background:transparent; border:none; color:red; cursor:pointer; padding:4px; line-height:1; font-size:12px;" title="Delete Block">×</button>
      </div>
      <div class="canvas-block-content" contenteditable="true" data-placeholder="Start writing..." style="outline:none; min-height:1.5em;">${html}</div>
      <div class="canvas-block-add" style="position:absolute; left:50%; bottom:-16px; transform:translateX(-50%); opacity:0; transition:opacity 0.2s; background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:2px 8px; z-index:10; font-family:var(--mono); font-size:10px; display:flex; gap:4px; white-space:nowrap; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
        <span style="color:var(--accent);">+</span>
        <button type="button" class="secondary rt-btn" onclick="addBlock(${index}, 'p')" style="padding:2px 4px; border:none; cursor:pointer;">Text</button>
        <button type="button" class="secondary rt-btn" onclick="addBlock(${index}, 'h2')" style="padding:2px 4px; border:none; cursor:pointer;">H2</button>
        <button type="button" class="secondary rt-btn" onclick="addBlock(${index}, 'img')" style="padding:2px 4px; border:none; cursor:pointer;">Img</button>
        <button type="button" class="secondary rt-btn" onclick="addBlock(${index}, 'quote')" style="padding:2px 4px; border:none; cursor:pointer;">Quote</button>
        <button type="button" class="secondary rt-btn" onclick="addBlock(${index}, 'hr')" style="padding:2px 4px; border:none; cursor:pointer;">---</button>
      </div>
    `;
    
    const dragHandle = wrap.querySelector('.block-drag-handle');
    const addCtrl = wrap.querySelector('.canvas-block-add');
    const content = wrap.querySelector('.canvas-block-content');
    
    wrap.onmouseenter = () => {
      dragHandle.style.opacity = '1';
      addCtrl.style.opacity = '1';
      wrap.style.boxShadow = '0 0 0 1px var(--line)';
    };
    wrap.onmouseleave = () => {
      dragHandle.style.opacity = '0';
      addCtrl.style.opacity = '0';
      wrap.style.boxShadow = 'none';
    };
    
    // Drag & Drop
    wrap.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', index);
      wrap.style.opacity = '0.4';
    };
    wrap.ondragend = () => {
      wrap.style.opacity = '1';
    };
    wrap.ondragover = (e) => {
      e.preventDefault();
      wrap.style.borderTop = '2px solid var(--accent)';
    };
    wrap.ondragleave = () => {
      wrap.style.borderTop = '';
    };
    wrap.ondrop = (e) => {
      e.preventDefault();
      wrap.style.borderTop = '';
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const toIndex = index;
      if (fromIndex !== toIndex && !isNaN(fromIndex)) {
        const moved = storyBlocks.splice(fromIndex, 1)[0];
        storyBlocks.splice(toIndex, 0, moved);
        updateStoryFromBlocks();
        captureSnapshot('Moved block');
        updatePreview(); // Re-render canvas
      }
    };
    
    // Formatting & Input
    content.addEventListener('input', (e) => {
      if (turndownService) {
        storyBlocks[index].raw = turndownService.turndown(content.innerHTML);
        updateStoryFromBlocks();
      }
      handleTyping();
    });
    
    // Image clicking
    content.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG' && typeof openImageStudio !== 'undefined') {
        openImageStudio('story', index, e.target);
      }
    });
    
    container.appendChild(wrap);
  });
}

// Ensure addBlock causes a re-render of preview
const oldAddBlock = window.addBlock;
window.addBlock = function(index, type) {
  if (type === 'img') {
    // Custom logic to trigger upload and avoid relying on oldAddBlock's closure
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const dataUrl = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
      const result = await request('/api/image', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:file.name, dataUrl})});
      storyBlocks.splice(index + 1, 0, { id: Math.random().toString(36).slice(2), raw: `![](${result.url})` });
      updateStoryFromBlocks();
      captureSnapshot('Added image block');
      updatePreview();
    };
    fileInput.click();
    return;
  }
  
  let raw = '';
  if (type === 'h2') raw = '## Heading';
  else if (type === 'h3') raw = '### Heading';
  else if (type === 'quote') raw = '> Quote';
  else if (type === 'ul') raw = '- List item';
  else if (type === 'hr') raw = '---';
  else raw = 'New paragraph';
  
  storyBlocks.splice(index + 1, 0, { id: Math.random().toString(36).slice(2), raw });
  updateStoryFromBlocks();
  captureSnapshot('Added block');
  updatePreview();
};

window.deleteBlock = function(index) {
  storyBlocks.splice(index, 1);
  if (storyBlocks.length === 0) storyBlocks.push({ id: Math.random().toString(36).slice(2), raw: '' });
  updateStoryFromBlocks();
  captureSnapshot('Deleted block');
  updatePreview();
};


// Phase 8H.5 UI bindings
const btnBackEntries = document.getElementById('btn-back-entries');
const btnSaveCanvas = document.getElementById('btn-save-canvas');
const newBtnUndo = document.getElementById('btn-undo');
const newBtnRedo = document.getElementById('btn-redo');

if (btnBackEntries) btnBackEntries.onclick = () => { show('entries'); };
if (btnSaveCanvas) {
  btnSaveCanvas.onclick = async (event) => {
    event.preventDefault();
    await saveCurrentEntry();
  };
}

async function publishLive(btn) {
  if (typeof saveCurrentEntry === 'function' && window.isDirty) {
    await saveCurrentEntry();
  }
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Publishing... ⏳';
  }
  try {
    const res = await fetch('/api/publish', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Publish failed');
    }
    if (btn) btn.innerHTML = '✓ Published!';
    alert(data.message || 'Published to GitHub! Vercel is updating your live website now.');
  } catch (err) {
    console.error('Publish error:', err);
    alert('Could not publish: ' + (err.message || 'Unknown error'));
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }, 3500);
  }
}

const btnPublishCanvas = document.getElementById('btn-publish-canvas');
const btnHeaderPublish = document.getElementById('btn-header-publish');
btnPublishCanvas?.addEventListener('click', () => publishLive(btnPublishCanvas));
btnHeaderPublish?.addEventListener('click', () => publishLive(btnHeaderPublish));

if (newBtnUndo) {
  newBtnUndo.onmousedown = (e) => e.preventDefault();
  newBtnUndo.onclick = window.undo;
}
if (newBtnRedo) {
  newBtnRedo.onmousedown = (e) => e.preventDefault();
  newBtnRedo.onclick = window.redo;
}


previewContent.addEventListener('click', (e) => {
  // If we clicked directly on the background (not text, not image, not a block)
  if (e.target === previewContent || e.target.closest('.artifact-page') === e.target || e.target.classList.contains('artifact-body')) {
    // Open settings (we can just show an alert or a small modal for now, but there's an existing presentation input we can use)
    openPresentationSettings();
  }
});

function openPresentationSettings() {
  let modal = document.getElementById('presentation-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'presentation-modal';
    modal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--paper); padding:24px; border:1px solid var(--line); border-radius:4px; z-index:500; width:300px; box-shadow:0 10px 30px rgba(0,0,0,0.1); font-family:var(--mono); font-size:11px;';
    
    // We already have layout-mode-select and other presentation elements in the hidden form.
    // Let's create a minimal UI linked to the hidden form's presentation object.
    modal.innerHTML = `
      <div style="margin-bottom:16px; font-weight:bold; font-size:12px;">PAGE SETTINGS</div>
      
      <label style="display:block; margin-bottom:8px;">Layout Mode
        <select id="ps-layout" style="display:block; width:100%; margin-top:4px;">
          <option value="default">Default</option>
          <option value="editorial">Editorial</option>
          <option value="centered">Centered</option>
          <option value="split">Split</option>
          <option value="immersive">Immersive</option>
        </select>
      </label>
      
      <label style="display:block; margin-bottom:8px;">Title Size
        <select id="ps-title-size" style="display:block; width:100%; margin-top:4px;">
          <option value="">Default</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="huge">Huge</option>
        </select>
      </label>
      
      <label style="display:block; margin-bottom:16px;">Story Width
        <select id="ps-story-width" style="display:block; width:100%; margin-top:4px;">
          <option value="">Default</option>
          <option value="narrow">Narrow</option>
          <option value="wide">Wide</option>
          <option value="full">Full Width</option>
        </select>
      </label>
      
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="ps-close" type="button" class="secondary" style="padding:4px 8px;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#ps-close').onclick = () => modal.style.display = 'none';
    
    const selects = modal.querySelectorAll('select');
    selects.forEach(s => s.addEventListener('change', () => {
      const p = getPres();
      if (!p.layout) p.layout = {};
      if (!p.title) p.title = {};
      if (!p.story) p.story = {};
      
      p.layout.mode = modal.querySelector('#ps-layout').value;
      p.title.size = modal.querySelector('#ps-title-size').value;
      p.story.width = modal.querySelector('#ps-story-width').value;
      
      entryForm.elements.presentation.value = JSON.stringify(p);
      captureSnapshot('Changed presentation');
      updatePreview();
    }));
  }
  
  const p = getPres();
  modal.querySelector('#ps-layout').value = (p.layout && p.layout.mode) || 'default';
  modal.querySelector('#ps-title-size').value = (p.title && p.title.size) || '';
  modal.querySelector('#ps-story-width').value = (p.story && p.story.width) || '';
  
  modal.style.display = 'block';
}


// Floating Formatting Toolbar
let formatToolbar = document.getElementById('format-toolbar');
if (!formatToolbar) {
  formatToolbar = document.createElement('div');
  formatToolbar.id = 'format-toolbar';
  formatToolbar.style.cssText = 'position:absolute; display:none; background:var(--text); color:var(--bg); border-radius:4px; padding:4px 8px; z-index:1000; font-family:var(--mono); font-size:12px; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15);';
  formatToolbar.innerHTML = `
    <button type="button" onmousedown="event.preventDefault(); document.execCommand('bold',false,null);" style="background:transparent; border:none; color:inherit; cursor:pointer;"><b>B</b></button>
    <button type="button" onmousedown="event.preventDefault(); document.execCommand('italic',false,null);" style="background:transparent; border:none; color:inherit; cursor:pointer;"><i>I</i></button>
    <button type="button" onmousedown="event.preventDefault(); document.execCommand('strikeThrough',false,null);" style="background:transparent; border:none; color:inherit; cursor:pointer;"><strike>S</strike></button>
    <span style="opacity:0.3;">|</span>
    <button type="button" onmousedown="event.preventDefault(); const url=prompt('URL:'); if(url) document.execCommand('createLink',false,url);" style="background:transparent; border:none; color:inherit; cursor:pointer;">🔗</button>
  `;
  document.body.appendChild(formatToolbar);
}

document.addEventListener('selectionchange', () => {
  if (window.USE_BLOCKNOTE_POC) { formatToolbar.style.display = 'none'; return; }
  if (previewPane.hidden) return;
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    // Only show if selection is within previewContent and is editable
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (container.nodeType === 3 ? container.parentElement.isContentEditable : container.isContentEditable) {
      const rect = range.getBoundingClientRect();
      formatToolbar.style.display = 'flex';
      formatToolbar.style.top = (rect.top + window.scrollY - 30) + 'px';
      formatToolbar.style.left = (rect.left + window.scrollX + (rect.width / 2) - (formatToolbar.offsetWidth / 2)) + 'px';
      return;
    }
  }
  formatToolbar.style.display = 'none';
});


// ==========================================
// BLOCK PARSER
// ==========================================
function parseMarkdownToBlocks(markdown) {
  if (!markdown) return [];
  // Split by double newline to form basic paragraphs/blocks
  const chunks = markdown.split(/\n\n+/);
  return chunks.map(chunk => ({
    id: Math.random().toString(36).slice(2),
    raw: chunk.trim()
  })).filter(b => b.raw.length > 0);
}

function updateStoryFromBlocks() {
  if (typeof storyBlocks !== 'undefined' && entryForm.elements.story) {
    entryForm.elements.story.value = storyBlocks.map(b => b.raw).join('\n\n').trim();
    // Fire a subtle input event if needed, but since we have full control over sync, we don't need to.
  }
}

window.parseMarkdownToBlocks = parseMarkdownToBlocks;
window.updateStoryFromBlocks = updateStoryFromBlocks;
window.updatePreview = updatePreview;

window.addEventListener('load', () => {
  if (location.hash) {
    window.onhashchange();
  } else {
    show('home');
  }
});

// Intercept public links inside editor
document.getElementById('preview-content')?.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link && link.href) {
    if (!link.href.includes('#/editor') && !link.href.includes('#/setup') && !link.href.includes('#/entries')) {
      link.target = '_blank';
      link.title = 'Open public page ↗';
    }
  }
});



// ==========================================
// RHYTHM SYSTEM
// ==========================================
let rhythmHabits = [];
let rhythmRecords = {};
let currentRhythmDate = new Date();

async function loadRhythm() {
  const [habitsRes, recordsRes] = await Promise.all([
    request('/api/rhythm-habits'),
    request('/api/rhythm-records')
  ]);
  rhythmHabits = habitsRes.habits || [];
  rhythmRecords = recordsRes.records || {};
  renderRhythmCalendar();
}

function renderRhythmCalendar() {
  const container = document.getElementById('rhythm-calendar-container');
  if (!container) return;
  
  if (rhythmHabits.length === 0) {
    container.innerHTML = '<p style="color:var(--text-light); font-family:var(--mono);">No habits configured. Click "+ Add Habits" to start.</p>';
    return;
  }
  
  const year = currentRhythmDate.getFullYear();
  const month = currentRhythmDate.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentRhythmDate.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
  
  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; font-family:var(--mono); font-size:12px;">
      <button type="button" class="secondary" onclick="changeRhythmMonth(-1)" style="padding:4px 8px; border:none;">← Prev</button>
      <strong>${monthName}</strong>
      <button type="button" class="secondary" onclick="changeRhythmMonth(1)" style="padding:4px 8px; border:none;">Next →</button>
    </div>
    <div style="display:grid; grid-template-columns: minmax(100px, 1fr) repeat(${daysInMonth}, 24px); gap:4px; align-items:center; font-family:var(--mono); font-size:11px;">
  `;
  
  // Header row (Days)
  html += `<div></div>`; // Empty top-left corner
  for (let d = 1; d <= daysInMonth; d++) {
    html += `<div style="text-align:center; color:var(--text-light); opacity:0.6;">${d}</div>`;
  }
  
  // Habit rows
  rhythmHabits.forEach(habit => {
    html += `<div style="display:flex; justify-content:space-between; align-items:center; padding-right:12px; color:var(--text-light); text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap;">
      <div style="display:flex; gap:4px; opacity:0.3; margin-right:8px;">
        <button type="button" onclick="moveHabit('${habit.id}', -1)" style="background:none; border:none; color:inherit; cursor:pointer; padding:0 2px;">↑</button>
        <button type="button" onclick="moveHabit('${habit.id}', 1)" style="background:none; border:none; color:inherit; cursor:pointer; padding:0 2px;">↓</button>
        <button type="button" onclick="openRhythmModal('edit', '${habit.id}')" style="background:none; border:none; color:inherit; cursor:pointer; padding:0 2px;">✎</button>
      </div>
      <span style="cursor:pointer; ${habit.active===false?'text-decoration:line-through; opacity:0.5':''}" onclick="openRhythmModal('edit', '${habit.id}')" title="Edit ${esc(habit.name)}">${esc(habit.name)}</span>
    </div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const record = rhythmRecords[dateStr] && rhythmRecords[dateStr][habit.id];
      const isCompleted = record && (record.done || record.value > 0);
      
      const today = new Date();
      const isToday = (d === today.getDate() && month === today.getMonth() && year === today.getFullYear());
      
      let marker = '·';
      if (isCompleted) {
         marker = habit.mode === 'NUMBER' || habit.mode === 'DURATION' ? '●' : '●';
      }
      
      let style = `text-align:center; cursor:pointer; user-select:none; width:24px; height:24px; display:flex; align-items:center; justify-content:center;`;
      if (isToday) style += ' background:rgba(0,0,0,0.05); border-radius:4px;';
      if (isCompleted) style += ' color:var(--accent, #e59a72);';
      else style += ' color:var(--line); opacity:0.6;';
      
      html += `<div style="${style}" onclick="toggleRhythmRecord('${habit.id}', '${dateStr}', '${habit.mode}')" title="${dateStr}">${marker}</div>`;
    }
  });
  
  html += `</div>`;
  container.innerHTML = html;
}

window.changeRhythmMonth = function(delta) {
  currentRhythmDate.setMonth(currentRhythmDate.getMonth() + delta);
  renderRhythmCalendar();
};

window.toggleRhythmRecord = async function(habitId, dateStr, mode) {
  if (!rhythmRecords[dateStr]) rhythmRecords[dateStr] = {};
  
  const current = rhythmRecords[dateStr][habitId] || {};
  let newValue = null;
  
  if (mode === 'CHECKBOX') {
    newValue = current.done ? null : { done: true };
  } else {
    const val = prompt(`Enter value for ${dateStr}:`, current.value || '');
    if (val === null) return; // Cancelled
    if (val.trim() === '') newValue = null;
    else newValue = { value: parseFloat(val) || val };
  }
  
  if (newValue === null) {
    delete rhythmRecords[dateStr][habitId];
  } else {
    rhythmRecords[dateStr][habitId] = newValue;
  }
  
  renderRhythmCalendar();
  
  // Persist
  try {
    const msg = document.getElementById('rhythm-message');
    msg.textContent = 'Saving...';
    await request('/api/rhythm-records', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ records: rhythmRecords }) });
    msg.textContent = 'Saved.';
    setTimeout(() => msg.textContent = '', 2000);
  } catch (err) {
    console.error(err);
    document.getElementById('rhythm-message').textContent = 'Save failed.';
  }
};

// Add Habits UI
document.getElementById('btn-add-habits')?.addEventListener('click', async () => {
  window.openRhythmModal('add');
  const container = document.getElementById('habits-presets-container');
  if (!container) return;
  
  container.innerHTML = '<p style="font-family:var(--mono); color:var(--ink); opacity:0.6;">Loading presets...</p>';
  
  try {
    const presets = await request('/api/rhythm-presets');
    let html = '';
    
    const currentHabitIds = new Set(window.rhythmHabits?.map(h => h.id) || (typeof rhythmHabits !== 'undefined' ? rhythmHabits.map(h => h.id) : []));
    
    if (Array.isArray(presets) && presets.length > 0) {
      presets.forEach(group => {
        html += '<div style="margin-bottom: 24px;">';
        html += '<h4 style="margin:0 0 16px 0; color:var(--ink); opacity:0.5; font-size:11px; font-family:var(--mono); text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid var(--line); padding-bottom:8px;">' + group.category + '</h4>';
        html += '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:12px;">';
        
        if (Array.isArray(group.habits)) {
          group.habits.forEach(habit => {
            const isChecked = currentHabitIds.has(habit.id);
            const checkedAttr = isChecked ? 'checked' : '';
            const opacity = isChecked ? '1' : '0.5';
            
            html += '<label style="display:flex !important; flex-direction:row !important; align-items:center !important; gap:10px; margin:4px 0 !important; cursor:pointer; font-size:14px; font-family:var(--mono); text-transform:none !important; letter-spacing:normal; color:var(--ink); padding:2px 0; user-select:none;">';
            html += '<input type="checkbox" class="preset-habit-cb" data-id="' + habit.id + '" data-name="' + habit.name + '" data-mode="' + habit.mode + '" data-category="' + group.category + '" ' + checkedAttr + ' style="width:16px; height:16px; margin:0; cursor:pointer;">';
            html += '<span style="line-height:1; color:var(--ink); opacity:' + opacity + ';">' + habit.name + '</span>';
            html += '</label>';
          });
        }
        
        html += '</div></div>';
      });
      container.innerHTML = html;
    } else {
      container.innerHTML = '<p style="font-family:var(--mono); color:var(--ink);">No presets found.</p>';
    }
  } catch (err) {
    console.error('Error loading presets:', err);
    container.innerHTML = '<p style="font-family:var(--mono); color:red;">Failed to load presets.</p>';
  }
});

document.getElementById('btn-save-habits')?.addEventListener('click', async () => {
  const cbs = document.querySelectorAll('.preset-habit-cb');
  let newHabits = [];
  cbs.forEach(cb => {
    if (cb.checked) {
      newHabits.push({
        id: cb.dataset.id,
        name: cb.dataset.name,
        mode: cb.dataset.mode,
        category: cb.dataset.category,
        active: true
      });
    }
  });
  
  // Try to preserve existing order and custom habits later, but for now simple overwrite of presets
  // Actually, let's merge smartly:
  const existingMap = new Map(rhythmHabits.map(h => [h.id, h]));
  const finalHabits = [];
  
  // keep existing custom habits (ones not in checkboxes) - wait, we only know if they are in checkboxes if we check.
  rhythmHabits.forEach(h => {
    const cb = document.querySelector(`.preset-habit-cb[data-id="${h.id}"]`);
    if (!cb) finalHabits.push(h); // Keep it, it's custom
  });
  
  newHabits.forEach(nh => {
    if (existingMap.has(nh.id)) finalHabits.push(existingMap.get(nh.id)); // Preserve config
    else finalHabits.push(nh); // Add new
  });
  
  rhythmHabits = finalHabits;
  renderRhythmCalendar();
  closeRhythmModal();
  
  try {
    await request('/api/rhythm-habits', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ habits: rhythmHabits }) });
  } catch (err) {
    console.error(err);
  }
});







document.getElementById('edit-habit-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-habit-id').value;
  const habit = rhythmHabits.find(h => h.id === id);
  if (habit) {
    habit.name = document.getElementById('edit-habit-name').value;
    habit.mode = document.getElementById('edit-habit-mode').value;
    habit.active = document.getElementById('edit-habit-active').checked;
    
    renderRhythmCalendar();
    closeRhythmModal();
    
    try {
      await request('/api/rhythm-habits', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ habits: rhythmHabits }) });
    } catch (err) { console.error(err); }
  }
});

document.getElementById('btn-delete-habit')?.addEventListener('click', async () => {
  if (!confirm('Delete this habit? Records will remain but the habit will be removed from the list.')) return;
  const id = document.getElementById('edit-habit-id').value;
  rhythmHabits = rhythmHabits.filter(h => h.id !== id);
  
  renderRhythmCalendar();
  closeRhythmModal();
  
  try {
    await request('/api/rhythm-habits', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ habits: rhythmHabits }) });
  } catch (err) { console.error(err); }
});

window.moveHabit = async function(id, direction) {
  const idx = rhythmHabits.findIndex(h => h.id === id);
  if (idx < 0) return;
  if (direction === -1 && idx === 0) return;
  if (direction === 1 && idx === rhythmHabits.length - 1) return;
  
  const temp = rhythmHabits[idx];
  rhythmHabits[idx] = rhythmHabits[idx + direction];
  rhythmHabits[idx + direction] = temp;
  
  renderRhythmCalendar();
  try {
    await request('/api/rhythm-habits', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ habits: rhythmHabits }) });
  } catch (err) { console.error(err); }
};



window.openRhythmModal = function(type, id = null) {
  const backdrop = document.getElementById('rhythm-modal-backdrop');
  const addModal = document.getElementById('rhythm-modal-add');
  const editModal = document.getElementById('rhythm-modal-edit');
  
  // Reset all
  addModal.style.display = 'none';
  editModal.style.display = 'none';
  backdrop.style.display = 'flex';
  
  if (type === 'add') {
    addModal.style.display = 'flex';
  } else if (type === 'edit') {
    const habit = rhythmHabits.find(h => h.id === id);
    if (!habit) return closeRhythmModal();
    document.getElementById('edit-habit-id').value = habit.id;
    document.getElementById('edit-habit-name').value = habit.name;
    document.getElementById('edit-habit-mode').value = habit.mode || 'CHECKBOX';
    document.getElementById('edit-habit-active').checked = habit.active !== false;
    editModal.style.display = 'block';
  }
};

window.closeRhythmModal = function() {
  document.getElementById('rhythm-modal-backdrop').style.display = 'none';
};

document.getElementById('rhythm-modal-backdrop')?.addEventListener('click', (e) => {
  if (e.target.id === 'rhythm-modal-backdrop') closeRhythmModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('rhythm-modal-backdrop')?.style.display === 'flex') {
    closeRhythmModal();
  }
});
