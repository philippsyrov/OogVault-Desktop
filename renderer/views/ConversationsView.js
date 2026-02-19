/**
 * ConversationsView — two-panel layout: list on left, detail on right.
 */

import { getConversation, deleteConversation } from '../../lib/db.js';
import { exportAsMarkdown } from '../../lib/search.js';
import { escapeHtml, formatTime, groupByDate, showToast } from '../app.js';

let selectedId = null;

/* ── Render conversation list panel ── */

export function renderConversationList(conversations) {
  const listEl = document.getElementById('conversations-list');

  if (conversations.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="empty-state-title">Your vault is empty</div>
        <div class="empty-state-text">
          Use the extension on claude.ai or ChatGPT, then import the export file here.
        </div>
      </div>
    `;
    return;
  }

  const grouped = groupByDate(conversations);
  let html = '';

  for (const [label, convs] of Object.entries(grouped)) {
    html += `<div class="date-group"><div class="date-label">${escapeHtml(label)}</div>`;
    for (const conv of convs) {
      html += renderConvCard(conv);
    }
    html += `</div>`;
  }

  listEl.innerHTML = html;
  bindListClicks(listEl);
}

export function renderSearchResults(results) {
  const listEl = document.getElementById('conversations-list');

  if (results.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div class="empty-state-title">No results found</div>
        <div class="empty-state-text">Try different keywords.</div>
      </div>
    `;
    return;
  }

  let html = '';
  for (const r of results) {
    html += renderConvCard(r, r.matchedContent);
  }

  listEl.innerHTML = html;
  bindListClicks(listEl);
}

function renderConvCard(conv, matchedContent) {
  const platformMap = { claude: 'C', chatgpt: 'G', gemini: 'Ge', perplexity: 'P' };
  const label = platformMap[conv.platform] || conv.platform?.charAt(0).toUpperCase() || '?';
  const cls = conv.platform || 'chatgpt';
  const time = formatTime(conv.updated_at || conv.created_at);
  const isSelected = conv.id === selectedId ? ' conv-card--selected' : '';

  return `
    <div class="conv-card${isSelected}" data-id="${conv.id}">
      <div class="conv-platform conv-platform--${cls}">${label}</div>
      <div class="conv-info">
        <div class="conv-title">${escapeHtml(conv.title)}</div>
        <div class="conv-meta">
          <span class="conv-platform-name">${conv.platform || ''}</span>
          <span>·</span>
          <span>${time}</span>
        </div>
        ${matchedContent ? `<div class="conv-match">${escapeHtml(matchedContent.substring(0, 100))}</div>` : ''}
      </div>
    </div>
  `;
}

function bindListClicks(listEl) {
  listEl.querySelectorAll('.conv-card').forEach((card) => {
    card.addEventListener('click', () => showDetail(card.dataset.id));
  });
}

/* ── Detail panel ── */

export async function showDetail(id) {
  selectedId = id;

  // Highlight selected card
  document.querySelectorAll('.conv-card').forEach((c) => {
    c.classList.toggle('conv-card--selected', c.dataset.id === id);
  });

  const detailEl = document.getElementById('pane-detail');
  detailEl.innerHTML = `<div class="loading">Loading...</div>`;

  const conv = await getConversation(id);
  if (!conv) {
    detailEl.innerHTML = `<div class="loading">Conversation not found.</div>`;
    return;
  }

  const messages = conv.messages || [];

  detailEl.innerHTML = `
    <div class="detail-pane-inner">
      <div class="detail-top">
        <div class="detail-title">${escapeHtml(conv.title)}</div>
        <div class="detail-meta">${conv.platform || ''} · ${new Date(conv.created_at).toLocaleString()}</div>
      </div>
      <div class="detail-messages" id="detail-messages">
        ${messages.map((m) => `
          <div class="msg-bubble msg-bubble--${m.role}">
            <span class="msg-role">${m.role === 'user' ? 'You' : 'Assistant'}</span>
            <div class="msg-content">${escapeHtml(m.content.trim())}</div>
          </div>
        `).join('')}
      </div>
      <div class="detail-bottom-bar">
        <button class="action-btn" id="btn-copy">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
        <button class="action-btn" id="btn-export">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export .md
        </button>
        <button class="action-btn action-btn--danger" id="btn-delete">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          Delete
        </button>
      </div>
    </div>
  `;

  bindDetailActions(id, conv, messages);
}


function bindDetailActions(id, conv, messages) {
  document.getElementById('btn-copy')?.addEventListener('click', async () => {
    const text = messages
      .map((m) => `${m.role === 'user' ? 'You' : 'Assistant'}:\n${m.content}`)
      .join('\n\n---\n\n');
    await window.electronAPI.copyToClipboard(text);
    showToast('Conversation copied!');
  });

  document.getElementById('btn-export')?.addEventListener('click', async () => {
    const markdown = await exportAsMarkdown(id);
    if (markdown) {
      const slug = conv.title.substring(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oogvault-${slug}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported as Markdown!');
    }
  });

  document.getElementById('btn-delete')?.addEventListener('click', async () => {
    if (!confirm('Delete this conversation from your vault?')) return;
    await deleteConversation(id);
    showToast('Conversation deleted');
    selectedId = null;
    document.getElementById('pane-detail').innerHTML = `
      <div class="detail-placeholder">
        <div class="placeholder-icon">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="placeholder-text">Conversation deleted</div>
      </div>
    `;
    // Trigger reload in parent
    document.dispatchEvent(new CustomEvent('vault:reload'));
  });
}
