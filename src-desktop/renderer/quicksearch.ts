import { searchConversations } from '../lib/search.js';

let results: SearchConversationResult[] = [];
let selectedIndex = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}

const input = mustElement<HTMLInputElement>('qs-input');
const resultsElement = mustElement<HTMLElement>('qs-results');
const btnCopy = mustElement<HTMLButtonElement>('qs-btn-copy');
const btnOpen = mustElement<HTMLButtonElement>('qs-btn-open');
const btnClose = mustElement<HTMLButtonElement>('qs-btn-close');

input.addEventListener('input', () => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void handleSearch();
  }, 180);
});

input.addEventListener('keydown', handleKeyDown);

document.addEventListener('keydown', (event) => {
  if (
    document.activeElement !== input &&
    ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)
  ) {
    handleKeyDown(event);
  }
});

btnCopy.addEventListener('mousedown', (event) => {
  event.preventDefault();
  const result = results[selectedIndex];
  if (result) {
    copyAndClose(result);
  }
});

btnOpen.addEventListener('mousedown', (event) => {
  event.preventDefault();
  const result = results[selectedIndex];
  if (result) {
    openInMain(result);
  }
});

btnClose.addEventListener('mousedown', (event) => {
  event.preventDefault();
  hide();
});

window.electronAPI.onQuickSearchFocus(() => {
  input.value = '';
  results = [];
  selectedIndex = 0;
  renderEmpty('');
  updateFooterButtons();
  setTimeout(() => {
    input.focus();
  }, 30);
});

renderEmpty('');
updateFooterButtons();

function resizeToContent() {
  requestAnimationFrame(() => {
    const height = document.querySelector<HTMLElement>('.qs-container')?.offsetHeight ?? 0;
    if (height > 0) {
      window.electronAPI.resizeQuickSearch(Math.round(height));
    }
  });
}

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
  } catch (error) {
    console.error('[QuickSearch] Search error:', error);
    renderError();
  }
}

function handleKeyDown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (results.length === 0) return;
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
      renderSelection();
      scrollSelectedIntoView();
      break;

    case 'ArrowUp':
      event.preventDefault();
      if (results.length === 0) return;
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderSelection();
      scrollSelectedIntoView();
      break;

    case 'Enter': {
      event.preventDefault();
      const result = results[selectedIndex];
      if (!result) return;
      if (event.metaKey || event.ctrlKey) {
        openInMain(result);
      } else {
        copyAndClose(result);
      }
      break;
    }

    case 'Escape':
      event.preventDefault();
      hide();
      break;
  }
}

function copyAndClose(result: SearchConversationResult) {
  const text = formatForClipboard(result);
  window.electronAPI.copyToClipboard(text);
  showCopiedFeedback(() => {
    hide();
  });
}

function openInMain(result: SearchConversationResult) {
  window.electronAPI.openConversation(result.id);
  hide();
}

function hide() {
  window.electronAPI.hideQuickSearch();
}

function render() {
  if (results.length === 0) {
    renderEmpty('no-results');
    return;
  }

  resultsElement.innerHTML = results
    .map((result, index) => `
      <div
        class="qs-result-item ${index === selectedIndex ? 'selected' : ''}"
        data-index="${index}"
      >
        <div class="qs-result-title">${escapeHtml(result.title || 'Untitled')}</div>
        <div class="qs-result-preview">${escapeHtml(result.matchedContent || '')}</div>
        <div class="qs-result-meta">
          <span class="qs-platform-badge">${escapeHtml(result.platform || '')}</span>
          <span class="qs-date">${relativeDate(result.created_at || result.updated_at)}</span>
        </div>
      </div>
    `)
    .join('');

  resultsElement.querySelectorAll<HTMLElement>('.qs-result-item').forEach((element) => {
    element.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const index = Number.parseInt(element.dataset.index ?? '-1', 10);
      const result = results[index];
      if (!result) return;
      selectedIndex = index;
      renderSelection();
      openInMain(result);
    });
  });

  resizeToContent();
}

function renderSelection() {
  resultsElement.querySelectorAll<HTMLElement>('.qs-result-item').forEach((element, index) => {
    element.classList.toggle('selected', index === selectedIndex);
  });
  updateFooterButtons();
}

function renderEmpty(mode: '' | 'no-results') {
  if (mode === 'no-results') {
    resultsElement.innerHTML = `
      <div class="qs-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        No results found
      </div>`;
  } else {
    resultsElement.innerHTML = `
      <div class="qs-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        Start typing to search your vault
      </div>`;
  }
  resizeToContent();
}

function renderError() {
  resultsElement.innerHTML = `<div class="qs-empty">Something went wrong — try again</div>`;
  resizeToContent();
}

function updateFooterButtons() {
  const hasResult = results.length > 0;
  btnCopy.disabled = !hasResult;
  btnOpen.disabled = !hasResult;
}

function showCopiedFeedback(onDone?: () => void) {
  const element = resultsElement.querySelector<HTMLElement>('.qs-result-item.selected');
  if (!element) {
    onDone?.();
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'qs-copied-toast';
  toast.textContent = '✓ Copied';
  element.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  setTimeout(() => {
    onDone?.();
  }, 500);
}

function scrollSelectedIntoView() {
  const element = resultsElement.querySelector<HTMLElement>('.qs-result-item.selected');
  element?.scrollIntoView({ block: 'nearest' });
}

function formatForClipboard(result: SearchConversationResult) {
  const lines = [`# ${result.title || 'Conversation'}`];
  if (result.platform) lines.push(`Platform: ${result.platform}`);
  if (result.created_at) lines.push(`Date: ${new Date(result.created_at).toLocaleString()}`);
  lines.push('');

  const messages = result.messages ?? [];
  for (const message of messages) {
    const role = message.role === 'user' ? 'You' : 'Assistant';
    lines.push(`**${role}:** ${message.content ?? ''}`);
    lines.push('');
  }

  return lines.join('\n');
}

function relativeDate(timestamp: string | undefined) {
  if (!timestamp) {
    return '';
  }

  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(value: string) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}
