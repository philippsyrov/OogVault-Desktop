import { deleteConversation, getConversation } from '../../lib/db.js';
import { exportAsMarkdown } from '../../lib/search.js';
import { escapeHtml, formatTime, groupByDate, showToast } from '../utils.js';

let selectedId: string | null = null;

export function renderConversationList(conversations: VaultConversation[]) {
  const listElement = document.getElementById('conversations-list');
  if (!listElement) {
    return;
  }

  if (conversations.length === 0) {
    listElement.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
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

  for (const [label, items] of Object.entries(grouped)) {
    html += `<div class="date-group"><div class="date-label">${escapeHtml(label)}</div>`;
    for (const conversation of items) {
      html += renderConversationCard(conversation);
    }
    html += `</div>`;
  }

  listElement.innerHTML = html;
  bindListClicks(listElement);
}

export function renderSearchResults(results: SearchConversationResult[]) {
  const listElement = document.getElementById('conversations-list');
  if (!listElement) {
    return;
  }

  if (results.length === 0) {
    listElement.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <div class="empty-state-title">No results found</div>
        <div class="empty-state-text">Try different keywords.</div>
      </div>
    `;
    return;
  }

  listElement.innerHTML = results
    .map((result) => renderConversationCard(result, result.matchedContent))
    .join('');

  bindListClicks(listElement);
}

function renderConversationCard(conversation: VaultConversation, matchedContent?: string) {
  const platformMap: Record<string, string> = {
    claude: 'C',
    chatgpt: 'G',
    gemini: 'Ge',
    perplexity: 'P',
  };
  const platformKey = conversation.platform ?? '';
  const label = platformMap[platformKey] || platformKey.charAt(0).toUpperCase() || '?';
  const cardClass = platformKey || 'chatgpt';
  const time = formatTime(conversation.updated_at || conversation.created_at);
  const isSelected = conversation.id === selectedId ? ' conv-card--selected' : '';

  return `
    <div class="conv-card${isSelected}" data-id="${conversation.id}">
      <div class="conv-platform conv-platform--${cardClass}">${label}</div>
      <div class="conv-info">
        <div class="conv-title">${escapeHtml(conversation.title)}</div>
        <div class="conv-meta">
          <span class="conv-platform-name">${conversation.platform || ''}</span>
          <span>·</span>
          <span>${time}</span>
        </div>
        ${matchedContent ? `<div class="conv-match">${escapeHtml(matchedContent.substring(0, 100))}</div>` : ''}
      </div>
    </div>
  `;
}

function bindListClicks(listElement: HTMLElement) {
  listElement.querySelectorAll<HTMLElement>('.conv-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (id) {
        void showDetail(id);
      }
    });
  });
}

export async function showDetail(id: string) {
  selectedId = id;

  document.querySelectorAll<HTMLElement>('.conv-card').forEach((card) => {
    card.classList.toggle('conv-card--selected', card.dataset.id === id);
  });

  const detailElement = document.getElementById('pane-detail');
  if (!detailElement) {
    return;
  }

  detailElement.innerHTML = `<div class="loading">Loading...</div>`;

  const conversation = await getConversation(id);
  if (!conversation) {
    detailElement.innerHTML = `<div class="loading">Conversation not found.</div>`;
    return;
  }

  const messages = conversation.messages ?? [];

  detailElement.innerHTML = `
    <div class="detail-pane-inner">
      <div class="detail-top">
        <div class="detail-title">${escapeHtml(conversation.title)}</div>
        <div class="detail-meta">${conversation.platform || ''} · ${new Date(conversation.created_at || '').toLocaleString()}</div>
      </div>
      <div class="detail-messages" id="detail-messages">
        ${messages.map((message) => `
          <div class="msg-bubble msg-bubble--${message.role}">
            <span class="msg-role">${message.role === 'user' ? 'You' : 'Assistant'}</span>
            <div class="msg-content">${escapeHtml(message.content.trim())}</div>
          </div>
        `).join('')}
      </div>
      <div class="detail-bottom-bar">
        <button class="action-btn" id="btn-copy">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy
        </button>
        <button class="action-btn" id="btn-export">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Export .md
        </button>
        <button class="action-btn action-btn--danger" id="btn-delete">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
          Delete
        </button>
      </div>
    </div>
  `;

  bindDetailActions(id, conversation, messages);
}

function bindDetailActions(id: string, conversation: VaultConversation, messages: VaultMessage[]) {
  document.getElementById('btn-copy')?.addEventListener('click', () => {
    const text = messages
      .map((message) => `${message.role === 'user' ? 'You' : 'Assistant'}:\n${message.content}`)
      .join('\n\n---\n\n');
    window.electronAPI.copyToClipboard(text);
    showToast('Conversation copied!');
  });

  document.getElementById('btn-export')?.addEventListener('click', () => {
    void (async () => {
      const markdown = await exportAsMarkdown(id);
      if (!markdown) {
        return;
      }

      const slug = conversation.title.substring(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `oogvault-${slug}.md`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast('Exported as Markdown!');
    })();
  });

  document.getElementById('btn-delete')?.addEventListener('click', () => {
    void (async () => {
      if (!window.confirm('Delete this conversation from your vault?')) {
        return;
      }

      await deleteConversation(id);
      showToast('Conversation deleted');
      selectedId = null;

      const detailElement = document.getElementById('pane-detail');
      if (detailElement) {
        detailElement.innerHTML = `
          <div class="detail-placeholder">
            <div class="placeholder-icon">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <div class="placeholder-text">Conversation deleted</div>
          </div>
        `;
      }

      document.dispatchEvent(new CustomEvent('vault:reload'));
    })();
  });
}
