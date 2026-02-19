/**
 * OogVault Desktop — renderer entry point.
 * Manages view routing, search, and shared utilities.
 */

import { getAllConversations, getStats, getAllNuggets } from '../lib/db.js';
import { searchConversations, searchNuggetsText } from '../lib/search.js';
import { renderConversationList, renderSearchResults } from './views/ConversationsView.js';
import { renderNuggets, exportAllKnowledge } from './views/KnowledgeView.js';
import { renderSettings } from './views/SettingsView.js';

/* ── State ── */

let activeView = 'conversations';
let allConversations = [];
let searchTimer = null;

/* ── DOM refs ── */

const navItems = document.querySelectorAll('.nav-item');
const views = {
  conversations: document.getElementById('view-conversations'),
  knowledge: document.getElementById('view-knowledge'),
  settings: document.getElementById('view-settings'),
};
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const knowledgeSearchInput = document.getElementById('knowledge-search-input');
const sidebarStats = document.getElementById('sidebar-stats');
const btnExportKnowledge = document.getElementById('btn-export-knowledge');

/* ── Init ── */

async function init() {
  bindNav();
  bindSearch();
  bindGlobalEvents();
  await loadConversations();
  await updateStats();
}

/* ── Navigation ── */

function bindNav() {
  navItems.forEach((item) => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });
}

async function switchView(view) {
  activeView = view;

  navItems.forEach((item) => {
    item.classList.toggle('nav-item--active', item.dataset.view === view);
  });

  Object.entries(views).forEach(([key, el]) => {
    el.style.display = key === view ? 'flex' : 'none';
    if (key === view) el.classList.add('view--active');
    else el.classList.remove('view--active');
  });

  if (view === 'knowledge') {
    await loadNuggets();
  } else if (view === 'settings') {
    await renderSettings();
  }
}

/* ── Data Loading ── */

async function loadConversations() {
  allConversations = await getAllConversations();
  renderConversationList(allConversations);
}

async function loadNuggets(query) {
  const hasQuery = query && query.trim().length > 0;
  const nuggets = hasQuery
    ? await searchNuggetsText(query, 100)
    : await getAllNuggets();
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

/* ── Search ── */

function bindSearch() {
  searchInput.addEventListener('input', onConvSearch);

  searchClear?.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    renderConversationList(allConversations);
    searchInput.focus();
  });

  knowledgeSearchInput?.addEventListener('input', () => {
    const q = knowledgeSearchInput.value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadNuggets(q), 250);
  });

  btnExportKnowledge?.addEventListener('click', exportAllKnowledge);
}

function onConvSearch() {
  const query = searchInput.value.trim();
  searchClear.style.display = query.length > 0 ? 'flex' : 'none';

  if (searchTimer) clearTimeout(searchTimer);

  if (query.length === 0) {
    renderConversationList(allConversations);
    return;
  }

  searchTimer = setTimeout(async () => {
    const results = await searchConversations(query, 30);
    renderSearchResults(results);
  }, 250);
}

/* ── Global Events ── */

function bindGlobalEvents() {
  // Fired by ConversationsView after delete, SettingsView after import/clear
  document.addEventListener('vault:reload', async () => {
    await loadConversations();
    await updateStats();
    if (activeView === 'knowledge') await loadNuggets();
  });
}

/* ── Shared Utilities (exported for views) ── */

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

export function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMins = Math.floor((now - date) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
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

  for (const conv of conversations) {
    const date = new Date(conv.updated_at || conv.created_at);
    let label;

    if (date >= today) label = 'Today';
    else if (date >= yesterday) label = 'Yesterday';
    else if (date >= weekAgo) label = 'This Week';
    else label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }

  return groups;
}

export function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

/* ── Start ── */

init();
