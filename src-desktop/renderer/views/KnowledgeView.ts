import { exportKnowledgeMarkdown } from '../../lib/search.js';
import { escapeHtml, formatTime, showToast } from '../utils.js';

export function renderNuggets(nuggets: VaultNugget[], isSearch = false) {
  const listElement = document.getElementById('nuggets-list');
  if (!listElement) {
    return;
  }

  if (nuggets.length === 0) {
    listElement.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
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

  const grouped: Record<string, VaultNugget[]> = {};
  for (const nugget of nuggets) {
    const category = nugget.category || 'General';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(nugget);
  }

  const sortedCategories = Object.keys(grouped).sort((left, right) => {
    if (left === 'General') return 1;
    if (right === 'General') return -1;
    return left.localeCompare(right);
  });

  let html = '';

  for (const category of sortedCategories) {
    const items = grouped[category];
    const categoryId = category.toLowerCase().replace(/\s+/g, '-');
    const isCollapsed = !isSearch;

    html += `
      <div class="knowledge-category" data-category="${escapeHtml(category)}">
        <div class="category-header" data-cat-id="${categoryId}">
          <div class="category-header-left">
            <span class="category-name">${escapeHtml(category)}</span>
            <span class="category-count">${items.length}</span>
          </div>
          <div class="category-header-right">
            <button class="category-export-btn" data-export-category="${escapeHtml(category)}" title="Export ${escapeHtml(category)}">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>
            <span class="category-toggle${isCollapsed ? ' rotated' : ''}">
              <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
          </div>
        </div>
        <div class="category-body${isCollapsed ? ' collapsed' : ''}" id="cat-body-${categoryId}">
    `;

    for (const nugget of items) {
      html += `
        <div class="nugget-card">
          <div class="nugget-question">
            <span class="nugget-q-label">Q</span>
            ${escapeHtml(nugget.question)}
          </div>
          <div class="nugget-answer">
            <span class="nugget-a-label">A</span>
            ${escapeHtml(nugget.answer)}
          </div>
          <div class="nugget-meta">
            <span class="nugget-platform">${nugget.platform || ''}</span>
            <span>${formatTime(nugget.created_at)}</span>
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  listElement.innerHTML = html;

  listElement.querySelectorAll<HTMLElement>('.category-header').forEach((header) => {
    header.addEventListener('click', (event) => {
      const target = event.target as Element | null;
      if (target?.closest('.category-export-btn')) {
        return;
      }

      const categoryId = header.dataset.catId;
      if (!categoryId) {
        return;
      }

      const body = document.getElementById(`cat-body-${categoryId}`);
      const toggle = header.querySelector<HTMLElement>('.category-toggle');
      if (!body || !toggle) {
        return;
      }

      const collapsed = body.classList.toggle('collapsed');
      toggle.classList.toggle('rotated', collapsed);
    });
  });

  listElement.querySelectorAll<HTMLButtonElement>('.category-export-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const category = button.dataset.exportCategory;
      if (!category) {
        return;
      }

      void (async () => {
        const markdown = await exportKnowledgeMarkdown(category);
        if (!markdown) {
          showToast('No knowledge to export in this category.');
          return;
        }

        const slug = category.toLowerCase().replace(/\s+/g, '-');
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `oogvault-knowledge-${slug}.md`;
        anchor.click();
        URL.revokeObjectURL(url);
        showToast(`${category} knowledge exported!`);
      })();
    });
  });
}

export async function exportAllKnowledge() {
  const markdown = await exportKnowledgeMarkdown();
  if (!markdown) {
    showToast('No knowledge to export yet.');
    return;
  }

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'oogvault-knowledge.md';
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Knowledge exported as Markdown!');
}
