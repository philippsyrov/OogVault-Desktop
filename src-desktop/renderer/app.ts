import { getAllConversations, getAllNuggets, getStats } from '../lib/db.js';
import { searchConversations, searchNuggetsText } from '../lib/search.js';
import {
  renderConversationList,
  renderSearchResults,
  showDetail,
} from './views/ConversationsView.js';
import { exportAllKnowledge, renderNuggets } from './views/KnowledgeView.js';
import { renderSettings } from './views/SettingsView.js';
import { mustElement } from './utils.js';

type ViewName = 'conversations' | 'knowledge' | 'settings';

let activeView: ViewName = 'conversations';
let allConversations: VaultConversation[] = [];
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const navItems = document.querySelectorAll<HTMLButtonElement>('.nav-item');
const views: Record<ViewName, HTMLElement> = {
  conversations: mustElement('view-conversations'),
  knowledge: mustElement('view-knowledge'),
  settings: mustElement('view-settings'),
};
const searchInput = mustElement<HTMLInputElement>('search-input');
const searchClear = mustElement<HTMLElement>('search-clear');
const knowledgeSearchInput = mustElement<HTMLInputElement>('knowledge-search-input');
const sidebarStats = mustElement<HTMLElement>('sidebar-stats');
const btnExportKnowledge = mustElement<HTMLButtonElement>('btn-export-knowledge');

async function init() {
  bindNav();
  bindSearch();
  bindGlobalEvents();
  await loadConversations();
  await updateStats();
}

function bindNav() {
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const nextView = item.dataset.view as ViewName | undefined;
      if (nextView) {
        void switchView(nextView);
      }
    });
  });
}

async function switchView(view: ViewName) {
  activeView = view;

  navItems.forEach((item) => {
    item.classList.toggle('nav-item--active', item.dataset.view === view);
  });

  Object.entries(views).forEach(([key, element]) => {
    const isActive = key === view;
    element.classList.toggle('hidden', !isActive);
    element.classList.toggle('view--active', isActive);
  });

  if (view === 'knowledge') {
    await loadNuggets();
  } else if (view === 'settings') {
    await renderSettings();
  }
}

async function loadConversations() {
  try {
    allConversations = await getAllConversations();
    renderConversationList(allConversations);
  } catch (error) {
    console.error('[OogVault] loadConversations failed:', error);
    const listElement = document.getElementById('conversations-list');
    if (listElement) {
      listElement.innerHTML =
        `<div class="loading loading--error">Error loading conversations:` +
        `<br><code>${getErrorMessage(error)}</code><br><br>Try restarting the app.</div>`;
    }
  }
}

async function loadNuggets(query?: string) {
  const hasQuery = Boolean(query && query.trim().length > 0);
  const nuggets = hasQuery ? await searchNuggetsText(query ?? '', 100) : await getAllNuggets();
  renderNuggets(nuggets, hasQuery);
}

async function updateStats() {
  const stats = await getStats();
  sidebarStats.innerHTML = `
    ${stats.conversations} conversations<br>
    ${stats.messages} messages<br>
    ${stats.nuggets} nuggets
  `;
}

function bindSearch() {
  searchInput.addEventListener('input', onConversationSearch);

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    renderConversationList(allConversations);
    searchInput.focus();
  });

  knowledgeSearchInput.addEventListener('input', () => {
    const query = knowledgeSearchInput.value.trim();
    if (searchTimer) {
      clearTimeout(searchTimer);
    }
    searchTimer = setTimeout(() => {
      void loadNuggets(query);
    }, 250);
  });

  btnExportKnowledge.addEventListener('click', () => {
    void exportAllKnowledge();
  });
}

function onConversationSearch() {
  const query = searchInput.value.trim();
  searchClear.classList.toggle('hidden', query.length === 0);

  if (searchTimer) {
    clearTimeout(searchTimer);
  }

  if (query.length === 0) {
    renderConversationList(allConversations);
    return;
  }

  searchTimer = setTimeout(() => {
    void runConversationSearch(query);
  }, 250);
}

async function runConversationSearch(query: string) {
  const results = await searchConversations(query, 30);
  renderSearchResults(results);
}

function bindGlobalEvents() {
  document.addEventListener('vault:reload', () => {
    void (async () => {
      await loadConversations();
      await updateStats();
      if (activeView === 'knowledge') {
        await loadNuggets();
      }
      window.electronAPI.notifyDataChanged();
    })();
  });

  window.electronAPI.onNavigateToConversation((id) => {
    void (async () => {
      await switchView('conversations');
      setTimeout(() => {
        void showDetail(id);
      }, 50);
    })();
  });
}

void init();
