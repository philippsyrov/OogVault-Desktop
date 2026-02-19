/**
 * OogVault Quick Search overlay.
 */

import { searchConversations } from '../lib/search.js';

/* ── State ── */

let results = [];
let selectedIndex = 0;
let searchTimer = null;

/* ── DOM refs ── */

const input = document.getElementById('qs-input');
const resultsEl = document.getElementById('qs-results');
const btnCopy = document.getElementById('qs-btn-copy');
const btnOpen = document.getElementById('qs-btn-open');
const btnClose = document.getElementById('qs-btn-close');

/* ── Event listeners ── */

input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(handleSearch, 180);
});

// Primary: input-level keydown (reliable when input is focused)
input.addEventListener('keydown', handleKeyDown);

// Fallback: document-level in case input loses focus
document.addEventListener('keydown', (e) => {
  if (document.activeElement !== input && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
    handleKeyDown(e);
  }
});

// Footer buttons — use mousedown (fires before blur can hide the window)
btnCopy.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const result = results[selectedIndex];
  if (result) copyAndClose(result);
});

btnOpen.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const result = results[selectedIndex];
  if (result) openInMain(result);
});

btnClose.addEventListener('mousedown', (e) => {
  e.preventDefault();
  hide();
});

// Receive focus signal from main process
window.electronAPI.onQuickSearchFocus(() => {
  input.value = '';
  results = [];
  selectedIndex = 0;
  renderEmpty('');        // also calls resizeToContent()
  updateFooterButtons();
  setTimeout(() => { input.focus(); }, 30);
});

renderEmpty('');
updateFooterButtons();

/* ── Resize window to fit content ── */

function resizeToContent() {
  requestAnimationFrame(() => {
    const h = document.querySelector('.qs-container')?.offsetHeight;
    if (h > 0) window.electronAPI.resizeQuickSearch(Math.round(h));
  });
}

/* ── Search ── */

async function handleSearch() {
  const query = input.value.trim();

  if (!query) {
    results = [];
    selectedIndex = 0;
    renderEmpty('');
    updateFooterButtons();
    return;
  }

  try {
    results = await searchConversations(query, 12);
    selectedIndex = 0;
    render();
    updateFooterButtons();
  } catch (err) {
    console.error('[QuickSearch] Search error:', err);
    renderError();
  }
}

/* ── Keyboard navigation ── */

function handleKeyDown(e) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (results.length === 0) return;
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
      renderSelection();
      scrollSelectedIntoView();
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (results.length === 0) return;
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderSelection();
      scrollSelectedIntoView();
      break;

    case 'Enter': {
      e.preventDefault();
      const result = results[selectedIndex];
      if (!result) return;
      if (e.metaKey || e.ctrlKey) {
        openInMain(result);
      } else {
        copyAndClose(result);
      }
      break;
    }

    case 'Escape':
      e.preventDefault();
      hide();
      break;
  }
}

/* ── Actions ── */

function copyAndClose(result) {
  // clipboard.writeText exposed synchronously through preload — no IPC invoke needed
  const text = formatForClipboard(result);
  window.electronAPI.copyToClipboard(text);
  showCopiedFeedback(() => hide());
}

function openInMain(result) {
  window.electronAPI.openConversation(result.id);
  hide();
}

function hide() {
  window.electronAPI.hideQuickSearch();
}

/* ── Render ── */

function render() {
  if (results.length === 0) {
    renderEmpty('no-results');
    return;
  }

  resultsEl.innerHTML = results.map((r, idx) => `
    <div
      class="qs-result-item ${idx === selectedIndex ? 'selected' : ''}"
      data-index="${idx}"
    >
      <div class="qs-result-title">${escHtml(r.title || 'Untitled')}</div>
      <div class="qs-result-preview">${escHtml(r.matchedContent || '')}</div>
      <div class="qs-result-meta">
        <span class="qs-platform-badge">${escHtml(r.platform || '')}</span>
        <span class="qs-date">${relativeDate(r.created_at || r.updated_at)}</span>
      </div>
    </div>
  `).join('');

  resultsEl.querySelectorAll('.qs-result-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const idx = parseInt(el.dataset.index, 10);
      const result = results[idx];
      if (!result) return;
      selectedIndex = idx;
      renderSelection();
      // click = open in main window
      openInMain(result);
    });
  });

  resizeToContent();
}

function renderSelection() {
  resultsEl.querySelectorAll('.qs-result-item').forEach((el, idx) => {
    el.classList.toggle('selected', idx === selectedIndex);
  });
  updateFooterButtons();
}

function renderEmpty(mode) {
  if (mode === 'no-results') {
    resultsEl.innerHTML = `
      <div class="qs-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        No results found
      </div>`;
  } else {
    resultsEl.innerHTML = `
      <div class="qs-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Start typing to search your vault
      </div>`;
  }
  resizeToContent();
}

function renderError() {
  resultsEl.innerHTML = `<div class="qs-empty">Something went wrong — try again</div>`;
  resizeToContent();
}

function updateFooterButtons() {
  const hasResult = results.length > 0;
  btnCopy.disabled = !hasResult;
  btnOpen.disabled = !hasResult;
}

function showCopiedFeedback(onDone) {
  const el = resultsEl.querySelector('.qs-result-item.selected');
  if (!el) { onDone?.(); return; }

  const toast = document.createElement('div');
  toast.className = 'qs-copied-toast';
  toast.textContent = '✓ Copied';
  el.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(onDone, 500);
}

function scrollSelectedIntoView() {
  const el = resultsEl.querySelector('.qs-result-item.selected');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

/* ── Helpers ── */

function formatForClipboard(result) {
  const lines = [`# ${result.title || 'Conversation'}`];
  if (result.platform) lines.push(`Platform: ${result.platform}`);
  if (result.created_at) lines.push(`Date: ${new Date(result.created_at).toLocaleString()}`);
  lines.push('');

  const messages = result.messages ?? [];
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'You' : 'Assistant';
    lines.push(`**${role}:** ${msg.content ?? ''}`);
    lines.push('');
  }

  return lines.join('\n');
}

function relativeDate(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function escHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}
