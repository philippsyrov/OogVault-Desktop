import { getAllConversations, getAllNuggets, getStats } from '../lib/db.js';
import { searchConversations, searchNuggetsText } from '../lib/search.js';
import { renderConversationList, renderSearchResults, showDetail, } from './views/ConversationsView.js';
import { exportAllKnowledge, renderNuggets } from './views/KnowledgeView.js';
import { renderSettings } from './views/SettingsView.js';
let activeView = 'conversations';
let allConversations = [];
let searchTimer = null;
function mustElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing required element: ${id}`);
    }
    return element;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
const navItems = document.querySelectorAll('.nav-item');
const views = {
    conversations: mustElement('view-conversations'),
    knowledge: mustElement('view-knowledge'),
    settings: mustElement('view-settings'),
};
const searchInput = mustElement('search-input');
const searchClear = mustElement('search-clear');
const knowledgeSearchInput = mustElement('knowledge-search-input');
const sidebarStats = mustElement('sidebar-stats');
const btnExportKnowledge = mustElement('btn-export-knowledge');
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
            const nextView = item.dataset.view;
            if (nextView) {
                void switchView(nextView);
            }
        });
    });
}
async function switchView(view) {
    activeView = view;
    navItems.forEach((item) => {
        item.classList.toggle('nav-item--active', item.dataset.view === view);
    });
    Object.entries(views).forEach(([key, element]) => {
        const isActive = key === view;
        element.style.display = isActive ? 'flex' : 'none';
        element.classList.toggle('view--active', isActive);
    });
    if (view === 'knowledge') {
        await loadNuggets();
    }
    else if (view === 'settings') {
        await renderSettings();
    }
}
async function loadConversations() {
    try {
        allConversations = await getAllConversations();
        renderConversationList(allConversations);
    }
    catch (error) {
        console.error('[OogVault] loadConversations failed:', error);
        const listElement = document.getElementById('conversations-list');
        if (listElement) {
            listElement.innerHTML =
                `<div class="loading" style="color:#f87171;">Error loading conversations:` +
                    `<br><code>${getErrorMessage(error)}</code><br><br>Try restarting the app.</div>`;
        }
    }
}
async function loadNuggets(query) {
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
        searchClear.style.display = 'none';
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
    searchClear.style.display = query.length > 0 ? 'flex' : 'none';
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
async function runConversationSearch(query) {
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
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
export function formatTime(isoString) {
    if (!isoString) {
        return '';
    }
    const date = new Date(isoString);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1)
        return 'just now';
    if (diffMins < 60)
        return `${diffMins}m ago`;
    if (diffHours < 24)
        return `${diffHours}h ago`;
    if (diffDays < 7)
        return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
export function groupByDate(conversations) {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    for (const conversation of conversations) {
        const updatedAt = conversation.updated_at || conversation.created_at;
        const date = updatedAt ? new Date(updatedAt) : new Date(0);
        let label;
        if (date >= today)
            label = 'Today';
        else if (date >= yesterday)
            label = 'Yesterday';
        else if (date >= weekAgo)
            label = 'This Week';
        else
            label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(conversation);
    }
    return groups;
}
export function showToast(message) {
    const existing = document.querySelector('.toast');
    existing?.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 2600);
}
void init();
