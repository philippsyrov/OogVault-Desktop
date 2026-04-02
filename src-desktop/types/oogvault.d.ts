interface VaultMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  timestamp: string;
}

interface VaultConversation {
  id: string;
  platform?: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  is_auto_saved?: number;
  url?: string;
  messages?: VaultMessage[];
}

interface VaultNugget {
  id?: string;
  conversation_id?: string;
  question: string;
  answer: string;
  category?: string;
  created_at?: string;
  platform?: string;
}

interface VaultStats {
  conversations: number;
  messages: number;
  nuggets: number;
}

interface SearchConversationResult extends VaultConversation {
  messages: VaultMessage[];
  score: number;
  matchedContent: string;
}

interface ElectronAPI {
  importJson: () => Promise<unknown>;
  exportJson: (jsonString: string, defaultName?: string) => Promise<boolean>;
  exportMarkdown: (markdown: string, defaultName?: string) => Promise<boolean>;
  copyToClipboard: (text: string) => void;
  openExternal: (url: string) => Promise<boolean>;
  openConversation: (id: string) => void;
  onNavigateToConversation: (callback: (id: string) => void) => void;
  onQuickSearchFocus: (callback: () => void) => void;
  hideQuickSearch: () => void;
  resizeQuickSearch: (height: number) => void;
  notifyDataChanged: () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}

declare module '*lib/db.js' {
  export function saveConversation(conversation: VaultConversation): Promise<VaultConversation>;
  export function getConversation(id: string): Promise<VaultConversation | null>;
  export function getAllConversations(): Promise<VaultConversation[]>;
  export function deleteConversation(id: string): Promise<void>;
  export function getMessagesForConversation(conversationId: string): Promise<VaultMessage[]>;
  export function getAllMessages(): Promise<VaultMessage[]>;
  export function saveNuggets(conversationId: string, nuggets: VaultNugget[]): Promise<void>;
  export function getAllNuggets(): Promise<VaultNugget[]>;
  export function getStats(): Promise<VaultStats>;
}

declare module '*lib/search.js' {
  export function searchConversations(query: string, limit?: number): Promise<SearchConversationResult[]>;
  export function searchNuggetsText(query: string, limit?: number): Promise<VaultNugget[]>;
  export function exportAsMarkdown(conversationId: string): Promise<string | null>;
  export function exportKnowledgeMarkdown(category?: string | null, nuggetsList?: VaultNugget[] | null): Promise<string | null>;
  export function extractNuggets(messages: VaultMessage[], platform?: string): VaultNugget[];
}
