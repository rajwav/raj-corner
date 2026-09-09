export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderEntryHeader(data, isPerson, niceDateStr, placeSlugStr, worldSlug) {
  if (isPerson) {
    return `
      <div class="person-header">
        <div class="person-meta-top">
          ${escapeHtml(data.type)} ${data.location ? `<span class="meta-separator">·</span> ${escapeHtml(data.location)}` : ''}
        </div>
        <h1 class="person-title">${escapeHtml(data.title||'').replace(/ /g, '\n')}</h1>
        ${data.description ? `<p class="person-description">${escapeHtml(data.description)}</p>` : ''}
      </div>
    `;
  } else {
    return `
      <div class="artifact-header">
        <div class="artifact-metadata">
          <div class="meta-item">
            <span class="meta-label">Type</span>
            <span class="meta-value">${escapeHtml(data.type)}</span>
          </div>
          ${data.date ? `
            <div class="meta-item">
              <span class="meta-label">Date</span>
              <span class="meta-value">${escapeHtml(niceDateStr)}</span>
            </div>
          ` : ''}
          ${data.location ? `
            <div class="meta-item">
              <span class="meta-label">Coordinates</span>
              <a href="/places/${placeSlugStr}/" class="meta-value link">${escapeHtml(data.location)}</a>
            </div>
          ` : ''}
          <div class="meta-item">
            <span class="meta-label">World</span>
            <a href="/world/${worldSlug}/" class="meta-value link">${escapeHtml(worldSlug)}</a>
          </div>
        </div>
        <div class="artifact-title-group">
          <h1>${escapeHtml(data.title)}</h1>
          <p class="entry-description">${escapeHtml(data.description || '')}</p>
        </div>
      </div>
    `;
  }
}

export function renderEntryCover(data, isPerson, niceDateStr) {
  if (!data.cover) return '';
  const pres = data.presentation && data.presentation.cover ? data.presentation.cover : {};
  const alt = pres.alt ? escapeHtml(pres.alt) : escapeHtml(data.title);
  
  let classes = `artifact-cover ${isPerson ? 'person-cover' : ''}`;
  if (pres.align) classes += ` cover-align-${pres.align}`;
  if (pres.treatment) classes += ` cover-treatment-${pres.treatment}`;
  
  let figcaption = '';
  if (!isPerson) {
     if (pres.caption) figcaption = `<figcaption>${escapeHtml(pres.caption)}</figcaption>`;
     else figcaption = `<figcaption>Artifact record: ${escapeHtml(data.title)} / ${escapeHtml(data.location || 'Unknown')} / ${escapeHtml(niceDateStr)}</figcaption>`;
  }

  return `
    <figure class="${classes}">
      <img src="${escapeHtml(data.cover)}" alt="${alt}" />
      ${figcaption}
    </figure>
  `;
}

export function renderEntryTags(tags) {
  if (!tags || tags.length === 0) return '';
  return `
    <div class="artifact-tags">
      <span class="meta-label">Index Tags:</span>
      ${tags.map(tag => `<a href="/archive/?tag=${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`).join('')}
    </div>
  `;
}

export function renderPersonTraces(traces, niceDateFn) {
  if (!traces || traces.length === 0) return '';
  return `
    <div class="person-traces">
      <h3>TRACES OF THIS PERSON</h3>
      <ul class="person-trace-list">
        ${traces.map(trace => `
          <li>
            <span class="trace-date">${trace.data.date ? niceDateFn(trace.data.date) : 'Undated'}</span>
            <div class="trace-info">
              <a href="/entry/${trace.id}/" class="trace-link">${escapeHtml(trace.data.title)}</a>
              <span class="trace-meta">${escapeHtml(trace.data.type)} ${trace.data.location ? `<span class="meta-separator">·</span> ${escapeHtml(trace.data.location)}` : ''}</span>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

export function renderContinuation(threads) {
  if (!threads || threads.length === 0) return `
    <aside class="universe-continuation">
      <div class="continuation-actions">
        <a href="/random/" class="cont-action">Surprise Me →</a>
        <a href="/archive/" class="cont-action">Wander the Archive →</a>
      </div>
    </aside>
  `;
  
  return `
    <aside class="universe-continuation">
      <div class="continuation-block">
        <h3>FOLLOW THE THREAD</h3>
        <ul class="continuation-list">
          ${threads.map(t => `
            <li>
              <span class="cont-meta">${escapeHtml(t.typeLabel)}</span>
              <a href="${t.url}" class="cont-link">${escapeHtml(t.title)}</a>
            </li>
          `).join('')}
        </ul>
      </div>
      <div class="continuation-actions">
        <a href="/random/" class="cont-action">Surprise Me →</a>
        <a href="/archive/" class="cont-action">Wander the Archive →</a>
      </div>
    </aside>
  `;
}

export function getPresentationClasses(pres) {
  if (!pres) return 'layout-mode-default';
  const classes = [];
  if (pres.layout && pres.layout.mode) {
    classes.push(`layout-mode-${pres.layout.mode}`);
  } else {
    classes.push('layout-mode-default');
  }
  if (pres.title) {
    if (pres.title.size) classes.push(`pres-title-size-${pres.title.size}`);
    if (pres.title.align) classes.push(`pres-title-align-${pres.title.align}`);
    if (pres.title.font) classes.push(`pres-title-font-${pres.title.font}`);
  }
  if (pres.description) {
    if (pres.description.size) classes.push(`pres-desc-size-${pres.description.size}`);
    if (pres.description.align) classes.push(`pres-desc-align-${pres.description.align}`);
    if (pres.description.font) classes.push(`pres-desc-font-${pres.description.font}`);
  }
  if (pres.story) {
    if (pres.story.size) classes.push(`pres-story-size-${pres.story.size}`);
    if (pres.story.width) classes.push(`pres-story-width-${pres.story.width}`);
  }
  if (pres.cover) {
    if (pres.cover.size) classes.push(`pres-cover-size-${pres.cover.size}`);
  }
  return classes.join(' ');
}
