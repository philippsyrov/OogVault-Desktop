import {
  deleteConversation,
  getAllConversations,
  getAllNuggets,
  getStats,
  saveConversation,
  saveNuggets,
} from '../../lib/db.js';
import { extractNuggets } from '../../lib/search.js';
import { mustElement, showToast } from '../utils.js';

type ImportPayload = {
  conversations?: VaultConversation[];
  nuggets?: VaultNugget[];
};

export async function renderSettings() {
  const settingsElement = mustElement<HTMLElement>('settings-content');
  const stats = await getStats();

  settingsElement.innerHTML = `
    <h1 class="settings-title">Settings</h1>
    <p class="settings-subtitle">Manage your OogVault data and preferences.</p>

    <div class="glass-card">
      <h2 class="section-label">Import</h2>
      <div class="info-row">
        <span>Import conversations from the OogVault browser extension</span>
      </div>
      <div class="btn-row">
        <button id="btn-import" class="glass-btn glass-btn--accent">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Import from Extension
        </button>
        <input type="file" id="file-input-import" accept=".json" class="hidden">
      </div>
      <div id="import-log"></div>
    </div>

    <div class="glass-card">
      <h2 class="section-label">Data</h2>
      <div class="info-row">
        <span>Saved conversations</span>
        <strong id="stat-conversations">${stats.conversations}</strong>
      </div>
      <div class="info-row">
        <span>Total messages</span>
        <strong id="stat-messages">${stats.messages}</strong>
      </div>
      <div class="info-row">
        <span>Knowledge nuggets</span>
        <strong id="stat-nuggets">${stats.nuggets}</strong>
      </div>
      <div class="btn-row">
        <button id="btn-export-json" class="glass-btn">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Export as JSON
        </button>
        <button id="btn-clear-all" class="glass-btn glass-btn--danger">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
          Clear All Data
        </button>
      </div>
    </div>

    <div class="glass-card">
      <h2 class="section-label">About</h2>
      <p class="about-text">
        "Yesterday is history, tomorrow's still a mystery, chats rest within the vault in secrecy."
      </p>
      <div class="about-badges">
        <span class="badge">100% local</span>
        <span class="badge">100% private</span>
        <span class="badge">100% free</span>
      </div>
      <a href="https://github.com/philippsyrov/OogVault" class="github-link" id="github-link">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"></path></svg>
        View on GitHub
      </a>
    </div>
  `;

  bindSettingsEvents();
}

function bindSettingsEvents() {
  const fileInput = mustElement<HTMLInputElement>('file-input-import');

  mustElement<HTMLButtonElement>('btn-import').addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      void importFromFile(file);
    }
  });

  mustElement<HTMLButtonElement>('btn-export-json').addEventListener('click', () => {
    void exportAllJson();
  });

  mustElement<HTMLButtonElement>('btn-clear-all').addEventListener('click', () => {
    void clearAllData();
  });

  document.getElementById('github-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    void window.electronAPI.openExternal('https://github.com/philippsyrov/OogVault');
  });
}

async function importFromFile(file: File) {
  const logElement = mustElement<HTMLElement>('import-log');
  logElement.textContent = 'Reading file…';

  let data: ImportPayload | VaultConversation[];
  try {
    const text = await file.text();
    data = JSON.parse(text) as ImportPayload | VaultConversation[];
  } catch {
    logElement.textContent = 'Error: could not read or parse file.';
    return;
  }

  const conversations = Array.isArray(data) ? data : data.conversations ?? [];
  const nuggets = Array.isArray(data) ? [] : data.nuggets ?? [];

  if (conversations.length === 0 && nuggets.length === 0) {
    logElement.textContent = 'No data found in file.';
    return;
  }

  logElement.textContent = `Importing ${conversations.length} conversations…`;

  let imported = 0;
  let skipped = 0;

  for (const conversation of conversations) {
    try {
      const conversationNuggets = nuggets.filter((nugget) => nugget.conversation_id === conversation.id);
      const extractedNuggets =
        conversationNuggets.length > 0
          ? conversationNuggets
          : extractNuggets(conversation.messages || [], conversation.platform);

      await saveConversation(conversation);
      if (extractedNuggets.length > 0) {
        await saveNuggets(
          conversation.id,
          extractedNuggets.map((nugget) => ({
            ...nugget,
            conversation_id: conversation.id,
          })),
        );
      }
      imported++;
    } catch (error) {
      console.warn('[OogVault] Skipped conversation:', conversation.id, error);
      skipped++;
    }
  }

  const statsAfter = await getStats();
  mustElement<HTMLElement>('stat-conversations').textContent = String(statsAfter.conversations);
  mustElement<HTMLElement>('stat-messages').textContent = String(statsAfter.messages);
  mustElement<HTMLElement>('stat-nuggets').textContent = String(statsAfter.nuggets);

  const summary =
    skipped > 0
      ? `Imported ${imported} conversations (${skipped} skipped). Vault now has ${statsAfter.conversations} conversations.`
      : `Imported ${imported} conversations. Vault now has ${statsAfter.conversations} conversations.`;

  logElement.textContent = summary;
  showToast(`Imported ${imported} conversations!`);
  document.dispatchEvent(new CustomEvent('vault:reload'));
}

async function exportAllJson() {
  const conversations = await getAllConversations();
  const nuggets = await getAllNuggets();

  if (conversations.length === 0) {
    showToast('Nothing to export.');
    return;
  }

  const payload = JSON.stringify({ conversations, nuggets }, null, 2);
  const filename = `oogvault-export-${new Date().toISOString().split('T')[0]}.json`;
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('Exported!');
}

async function clearAllData() {
  if (!window.confirm('Delete ALL conversations, messages, and knowledge from your vault? This cannot be undone.')) {
    return;
  }

  const conversations = await getAllConversations();
  for (const conversation of conversations) {
    await deleteConversation(conversation.id);
  }

  showToast('All data cleared.');
  document.dispatchEvent(new CustomEvent('vault:reload'));
  await renderSettings();
}
