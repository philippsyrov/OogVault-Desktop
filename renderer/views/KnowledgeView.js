/**
 * KnowledgeView — collapsible category sections for knowledge nuggets.
 */

import { exportKnowledgeMarkdown } from '../../lib/search.js';
import { escapeHtml, formatTime, showToast } from '../app.js';

export function renderNuggets(nuggets, isSearch = false) {
  const listEl = document.getElementById('nuggets-list');

  if (nuggets.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="empty-state-title">${isSearch ? 'No results found' : 'No knowledge yet'}</div>
        <div class="empty-state-text">
          ${isSearch
            ? 'Try different keywords or check your spelling.'
            : 'Import conversations from the extension. OogVault will extract Q&A knowledge nuggets automatically.'}
        </div>
      </div>
    `;
    return;
  }

  // Group by category
  const grouped = {};
  for (const n of nuggets) {
    const cat = n.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(n);
  }

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'General') return 1;
    if (b === 'General') return -1;
    return a.localeCompare(b);
  });

  let html = '';

  for (const category of sortedCategories) {
    const items = grouped[category];
    const catId = category.toLowerCase().replace(/\s+/g, '-');
    const isCollapsed = !isSearch;

    html += `
      <div class="knowledge-category" data-category="${escapeHtml(category)}">
        <div class="category-header" data-cat-id="${catId}">
          <div class="category-header-left">
            <span class="category-name">${escapeHtml(category)}</span>
            <span class="category-count">${items.length}</span>
          </div>
          <div class="category-header-right">
            <button class="category-export-btn" data-export-category="${escapeHtml(category)}" title="Export ${escapeHtml(category)}">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <span class="category-toggle${isCollapsed ? ' rotated' : ''}">
              <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </div>
        </div>
        <div class="category-body${isCollapsed ? ' collapsed' : ''}" id="cat-body-${catId}">
    `;

    for (const n of items) {
      html += `
        <div class="nugget-card">
          <div class="nugget-question">
            <span class="nugget-q-label">Q</span>
            ${escapeHtml(n.question)}
          </div>
          <div class="nugget-answer">
            <span class="nugget-a-label">A</span>
            ${escapeHtml(n.answer)}
          </div>
          <div class="nugget-meta">
            <span class="nugget-platform">${n.platform || ''}</span>
            <span>${formatTime(n.created_at)}</span>
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  listEl.innerHTML = html;

  // Collapse/expand toggles
  listEl.querySelectorAll('.category-header').forEach((header) => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.category-export-btn')) return;
      const catId = header.dataset.catId;
      const body = document.getElementById(`cat-body-${catId}`);
      const toggle = header.querySelector('.category-toggle');
      const collapsed = body.classList.toggle('collapsed');
      toggle.classList.toggle('rotated', collapsed);
    });
  });

  // Per-category export
  listEl.querySelectorAll('.category-export-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const category = btn.dataset.exportCategory;
      const markdown = await exportKnowledgeMarkdown(category);
      if (markdown) {
        const slug = category.toLowerCase().replace(/\s+/g, '-');
        await window.electronAPI.exportMarkdown(markdown, `oogvault-knowledge-${slug}.md`);
        showToast(`${category} knowledge exported!`);
      } else {
        showToast('No knowledge to export in this category.');
      }
    });
  });
}

export async function exportAllKnowledge() {
  const markdown = await exportKnowledgeMarkdown();
  if (markdown) {
    const ok = await window.electronAPI.exportMarkdown(markdown, 'oogvault-knowledge.md');
    if (ok) showToast('Knowledge exported as Markdown!');
  } else {
    showToast('No knowledge to export yet.');
  }
}
