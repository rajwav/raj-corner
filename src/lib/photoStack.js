/**
 * Photo Stack renderer & interaction logic for Raj's Corner.
 * Transforms :::stack blocks into interactive, loose polaroid card decks with swipe animations.
 */

export function transformPhotoStacks(html) {
  if (!html || !html.includes(':::stack')) return html;

  // Regex matches from :::stack to ::: across paragraphs or raw lines
  const stackRegex = /(?:<p>)?:::stack(?:\s+([^\n<]*))?(?:<\/p>)?([\s\S]*?)(?:<p>)?:::(?:<\/p>)?/gi;

  let stackIndex = 0;
  return html.replace(stackRegex, (_match, optionsStr = '', inner = '') => {
    const opts = (optionsStr || '').toLowerCase();
    const stackFit = opts.includes('cover') ? 'cover' : 'contain';

    // Extract all img tags or markdown image links from inner content
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const images = [];
    let m;

    while ((m = imgRegex.exec(inner)) !== null) {
      const fullTag = m[0];
      const src = m[1];
      const altMatch = fullTag.match(/alt=["']([^"']*)["']/i);
      const titleMatch = fullTag.match(/title=["']([^"']*)["']/i);
      
      const alt = altMatch ? altMatch[1] : '';
      let rawTitle = titleMatch ? titleMatch[1] : '';

      const fitMatch = rawTitle.match(/fit=([a-z]+)/i);
      const posMatch = rawTitle.match(/pos=([a-z]+)/i);
      const fit = fitMatch ? fitMatch[1].toLowerCase() : null;
      const pos = posMatch ? posMatch[1].toLowerCase() : null;

      let caption = rawTitle
        .replace(/w=[^,\s]+,?\s*/g, '')
        .replace(/a=[^,\s]+,?\s*/g, '')
        .replace(/fit=[^,\s]+,?\s*/g, '')
        .replace(/pos=[^,\s]+,?\s*/g, '')
        .trim();

      if (!caption && alt && !alt.endsWith('.jpg') && !alt.endsWith('.png') && !alt.endsWith('.jpeg')) {
        caption = alt;
      }
      images.push({ src, alt, caption, fit, pos });
    }

    // Fallback if images were raw markdown that didn't get converted by parser
    if (images.length === 0) {
      const mdImgRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*)["'])?\)/g;
      while ((m = mdImgRegex.exec(inner)) !== null) {
        const rawTitle = m[3] || '';
        const fitMatch = rawTitle.match(/fit=([a-z]+)/i);
        const posMatch = rawTitle.match(/pos=([a-z]+)/i);
        const fit = fitMatch ? fitMatch[1].toLowerCase() : null;
        const pos = posMatch ? posMatch[1].toLowerCase() : null;

        let caption = rawTitle
          .replace(/w=[^,\s]+,?\s*/g, '')
          .replace(/a=[^,\s]+,?\s*/g, '')
          .replace(/fit=[^,\s]+,?\s*/g, '')
          .replace(/pos=[^,\s]+,?\s*/g, '')
          .trim();

        images.push({
          alt: m[1] || '',
          src: m[2],
          caption: caption || m[1] || '',
          fit,
          pos
        });
      }
    }

    if (images.length === 0) return '';

    stackIndex++;
    return renderPhotoStackHtml(images, stackIndex, stackFit);
  });
}

// Preset natural, subtle rotations for cards in the loose polaroid stack
const ROTATIONS = [-2.5, 2, -1.2, 3, -2, 1.5, -3, 2.2];

export function renderPhotoStackHtml(images, stackId = 1, defaultFit = 'contain') {
  const total = images.length;
  const cardsHtml = images.map((img, i) => {
    const rot = ROTATIONS[i % ROTATIONS.length];
    const offX = ((i * 3) % 7) - 3;
    const offY = i * 4;
    const isTop = i === 0;
    const cardFitAttr = img.fit ? ` data-fit="${img.fit}"` : '';
    const cardPosAttr = img.pos ? ` data-pos="${img.pos}"` : '';

    return `
      <div class="photo-stack-card ${isTop ? 'is-top' : ''}" 
           data-index="${i}" 
           style="--base-rot: ${rot}deg; --off-x: ${offX}px; --off-y: ${offY}px; z-index: ${total - i};">
        <div class="photo-stack-photo-frame">
          <img src="${img.src}" alt="${img.alt || 'Photograph'}" draggable="false" loading="lazy"${cardFitAttr}${cardPosAttr} />
        </div>
        ${img.caption ? `<div class="photo-stack-caption">${escapeHtml(img.caption)}</div>` : '<div class="photo-stack-caption empty"></div>'}
      </div>
    `;
  }).join('');

  const isContain = defaultFit === 'contain';
  const toggleBtnText = isContain ? '⤢ Fill' : '⤢ Full';
  const toggleBtnTitle = isContain ? 'Switch to Fill Frame (polaroid crop)' : 'Switch to Full Photo (no crop)';

  return `
    <div class="photo-stack-container fit-${defaultFit}" data-photo-stack id="photo-stack-${stackId}">
      <div class="photo-stack-deck">
        ${cardsHtml}
      </div>
      <div class="photo-stack-controls">
        <button type="button" class="photo-stack-btn prev" aria-label="Previous photo" disabled>←</button>
        <span class="photo-stack-indicator">
          <span class="photo-stack-cur">1</span> / <span class="photo-stack-total">${total}</span>
          <span class="photo-stack-tip">· Click or swipe</span>
        </span>
        <button type="button" class="photo-stack-btn next" aria-label="Next photo">→</button>
        <button type="button" class="photo-stack-btn fit-toggle" aria-label="Toggle photo fit" title="${toggleBtnTitle}">${toggleBtnText}</button>
        <button type="button" class="photo-stack-btn reset" aria-label="Start over" title="Start over from beginning" style="display:none;">↺</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Initializes interactive swipe, drag, and click gestures on all photo stacks in a container.
 */
export function initPhotoStacks(root = document) {
  const stacks = root.querySelectorAll('[data-photo-stack]');
  stacks.forEach(stack => {
    if (stack.hasAttribute('data-stack-initialized')) return;
    stack.setAttribute('data-stack-initialized', 'true');

    const cards = Array.from(stack.querySelectorAll('.photo-stack-card'));
    const total = cards.length;
    if (total <= 1) {
      const controls = stack.querySelector('.photo-stack-controls');
      if (controls) controls.style.display = 'none';
      return;
    }

    let currentIndex = 0;
    let isAnimating = false;
    const curEl = stack.querySelector('.photo-stack-cur');
    const tipEl = stack.querySelector('.photo-stack-tip');
    const nextBtn = stack.querySelector('.photo-stack-btn.next');
    const prevBtn = stack.querySelector('.photo-stack-btn.prev');
    const resetBtn = stack.querySelector('.photo-stack-btn.reset');

    function updateDeckPositions() {
      cards.forEach((card, idx) => {
        card.classList.remove('is-top', 'swiping-out', 'swiping-in');
        
        if (idx === currentIndex) {
          card.classList.add('is-top');
          card.style.zIndex = `${total + 2}`;
          card.style.transform = `translate3d(0, 0, 0) rotate(0deg)`;
          card.style.opacity = '1';
          card.style.pointerEvents = 'auto';
        } else if (idx > currentIndex) {
          // Cards remaining underneath in stack
          const pos = idx - currentIndex;
          const rot = ROTATIONS[idx % ROTATIONS.length];
          const offX = ((pos * 4) % 9) - 4;
          const offY = Math.min(pos * 5, 20);
          card.style.zIndex = `${total - pos}`;
          card.style.transform = `translate3d(${offX}px, ${offY}px, 0) rotate(${rot}deg)`;
          card.style.opacity = pos < 4 ? `${1 - pos * 0.12}` : '0';
          card.style.pointerEvents = 'none';
        } else {
          // Already swiped out cards stay discarded
          card.style.zIndex = '0';
          card.style.transform = `translate3d(120%, -20px, 0) rotate(18deg)`;
          card.style.opacity = '0';
          card.style.pointerEvents = 'none';
        }
      });

      if (curEl) curEl.textContent = String(currentIndex + 1);

      const isStart = currentIndex === 0;
      const isEnd = currentIndex >= total - 1;

      if (prevBtn) {
        prevBtn.disabled = isStart;
        prevBtn.setAttribute('aria-disabled', String(isStart));
      }
      if (nextBtn) {
        nextBtn.disabled = isEnd;
        nextBtn.setAttribute('aria-disabled', String(isEnd));
      }
      if (resetBtn) {
        resetBtn.style.display = isEnd ? 'inline-flex' : 'none';
      }
      if (tipEl) {
        tipEl.textContent = isEnd ? '· End of stack' : '· Click or swipe';
      }
    }

    function swipeNext(direction = 1) {
      if (isAnimating) return;
      // Stop at the end of the stack — do not cycle infinitely/recursively
      if (currentIndex >= total - 1) {
        const topCard = cards[currentIndex];
        if (topCard) {
          const shakeX = direction > 0 ? 18 : -18;
          topCard.style.transition = 'transform 0.15s ease-out';
          topCard.style.transform = `translate3d(${shakeX}px, -4px, 0) rotate(${shakeX > 0 ? 2 : -2}deg)`;
          setTimeout(() => {
            topCard.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
            topCard.style.transform = `translate3d(0, 0, 0) rotate(0deg)`;
          }, 150);
        }
        return;
      }

      isAnimating = true;
      const topCard = cards[currentIndex];
      const throwX = direction > 0 ? 120 : -120;
      const throwRot = direction > 0 ? 18 : -18;

      topCard.classList.add('swiping-out');
      topCard.style.transform = `translate3d(${throwX}%, -20px, 0) rotate(${throwRot}deg)`;
      topCard.style.opacity = '0';

      setTimeout(() => {
        currentIndex++;
        updateDeckPositions();
        setTimeout(() => {
          isAnimating = false;
        }, 120);
      }, 240);
    }

    function swipePrev() {
      if (isAnimating) return;
      if (currentIndex <= 0) return;

      isAnimating = true;
      const prevIndex = currentIndex - 1;
      const targetCard = cards[prevIndex];

      // Prepare target card outside the deck (flying in from discarded position)
      targetCard.style.zIndex = `${total + 3}`;
      targetCard.style.transform = `translate3d(100%, -20px, 0) rotate(15deg)`;
      targetCard.style.opacity = '0';

      // Force layout reflow
      void targetCard.offsetWidth;

      // Animate into top position
      targetCard.classList.add('swiping-in');
      targetCard.style.transform = `translate3d(0, 0, 0) rotate(0deg)`;
      targetCard.style.opacity = '1';

      setTimeout(() => {
        currentIndex = prevIndex;
        updateDeckPositions();
        setTimeout(() => {
          isAnimating = false;
        }, 120);
      }, 260);
    }

    function resetStack() {
      if (isAnimating) return;
      isAnimating = true;
      currentIndex = 0;
      cards.forEach(c => {
        c.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease';
      });
      updateDeckPositions();
      setTimeout(() => {
        isAnimating = false;
      }, 360);
    }

    // Touch and Drag gestures for tactile swipe
    let startX = 0;
    let startY = 0;
    let currentDragX = 0;
    let isDragging = false;

    const deck = stack.querySelector('.photo-stack-deck');

    function onPointerDown(e) {
      if (isAnimating) return;
      isDragging = true;
      startX = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
      startY = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
      currentDragX = 0;

      const topCard = cards[currentIndex];
      if (topCard) {
        topCard.style.transition = 'none';
      }
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      const x = e.clientX ?? (e.touches && e.touches[0].clientX) ?? 0;
      const y = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
      currentDragX = x - startX;
      const currentDragY = y - startY;

      // If predominantly vertical scroll, let page scroll
      if (Math.abs(currentDragY) > Math.abs(currentDragX) && Math.abs(currentDragX) < 15) {
        return;
      }

      const topCard = cards[currentIndex];
      if (topCard) {
        // If at the last card and dragging forward, provide rubber-band resistance
        let effectiveDragX = currentDragX;
        if (currentIndex >= total - 1 && currentDragX < 0) {
          effectiveDragX = currentDragX * 0.3;
        }
        const rot = effectiveDragX * 0.08;
        topCard.style.transform = `translate3d(${effectiveDragX}px, ${currentDragY * 0.2}px, 0) rotate(${rot}deg)`;
      }
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;

      const topCard = cards[currentIndex];
      if (!topCard) return;

      topCard.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease';

      if (Math.abs(currentDragX) > 60) {
        if (currentDragX < 0) {
          // Swiped left/away -> next
          swipeNext(1);
        } else {
          // Swiped right -> go back if past first card
          if (currentIndex > 0) {
            swipePrev();
          } else {
            topCard.style.transform = `translate3d(0, 0, 0) rotate(0deg)`;
          }
        }
      } else if (Math.abs(currentDragX) < 6) {
        // Tap / Click without dragging -> advance if not at end
        swipeNext(1);
      } else {
        // Snap back to resting position
        topCard.style.transform = `translate3d(0, 0, 0) rotate(0deg)`;
      }
    }

    deck?.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    deck?.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    // Navigation buttons
    nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      swipeNext(1);
    });

    prevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      swipePrev();
    });

    resetBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      resetStack();
    });

    // Fit mode toggle (Full / Fill)
    const fitToggleBtn = stack.querySelector('.photo-stack-btn.fit-toggle');
    function toggleFitMode() {
      const isContain = stack.classList.contains('fit-contain');
      if (isContain) {
        stack.classList.remove('fit-contain');
        stack.classList.add('fit-cover');
        if (fitToggleBtn) {
          fitToggleBtn.textContent = '⤢ Full';
          fitToggleBtn.title = 'Switch to Full Photo (no crop)';
        }
      } else {
        stack.classList.remove('fit-cover');
        stack.classList.add('fit-contain');
        if (fitToggleBtn) {
          fitToggleBtn.textContent = '⤢ Fill';
          fitToggleBtn.title = 'Switch to Fill Frame (polaroid crop)';
        }
      }
    }

    fitToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFitMode();
    });

    deck?.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleFitMode();
    });

    updateDeckPositions();
  });
}
