#!/usr/bin/env node

/**
 * OogVault MCP Server
 *
 * Exposes the vault as tools for Claude Desktop and other MCP clients.
 * Reads vault data from a JSON snapshot written by the Electron app.
 *
 * Snapshot location (macOS):
 *   ~/Library/Application Support/oogvault-desktop/vault-snapshot.json
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/* ── Snapshot path (matches what the Electron app writes) ── */

function getSnapshotPath() {
  const platform = process.platform;
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'oogvault-desktop', 'vault-snapshot.json');
  }
  if (platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'oogvault-desktop', 'vault-snapshot.json');
  }
  // Linux
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'oogvault-desktop', 'vault-snapshot.json');
}

/* ── Load vault data ── */

function loadVault() {
  const path = getSnapshotPath();
  if (!existsSync(path)) {
    return { conversations: [], messages: [], nuggets: [] };
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw);
    return {
      conversations: data.conversations || [],
      messages: data.messages || [],
      nuggets: data.nuggets || [],
    };
  } catch (err) {
    console.error('[OogVault MCP] Failed to read snapshot:', err.message);
    return { conversations: [], messages: [], nuggets: [] };
  }
}

/* ── Search helpers (pure in-memory, mirrors lib/search.js logic) ── */

const STOP_WORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing', 'done',
  'have', 'has', 'had', 'having',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'about',
  'and', 'or', 'but', 'not', 'no', 'if', 'so', 'then', 'than',
  'what', 'how', 'when', 'where', 'which', 'who', 'why',
  'up', 'out', 'just', 'also', 'very', 'really', 'please',
  'want', 'need', 'like', 'know', 'think', 'get', 'got',
  'tell', 'ask', 'help', 'make', 'let', 'give', 'show', 'use',
  'some', 'any', 'all', 'more', 'much', 'many', 'most', 'other',
  'explain', 'describe', 'compare', 'define', 'write', 'create', 'list',
  'generate', 'summarize', 'translate', 'analyze', 'discuss', 'elaborate',
]);

function tokenize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function extractKeywords(text) {
  return tokenize(text).filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

function levenshtein(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

function fuzzyScore(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 1.0;

  const qKeywords = extractKeywords(q);
  const tTokens = tokenize(t);
  const queryTokens = qKeywords.length > 0 ? qKeywords : tokenize(q);
  if (queryTokens.length === 0) return 0;

  let totalScore = 0;
  let strongHits = 0;

  for (const qt of queryTokens) {
    let bestMatch = 0;
    for (const tt of tTokens) {
      if (tt === qt) { bestMatch = 1.0; break; }
      if (tt.includes(qt) || qt.includes(tt)) {
        const shorter = Math.min(qt.length, tt.length);
        const longer = Math.max(qt.length, tt.length);
        if (shorter >= 4 && shorter / longer >= 0.7) {
          bestMatch = Math.max(bestMatch, 0.9);
        }
        continue;
      }
      if (qt.length >= 4 && Math.abs(qt.length - tt.length) <= 2) {
        const sim = 1 - levenshtein(qt, tt) / Math.max(qt.length, tt.length);
        if (sim >= 0.7 && sim > bestMatch) bestMatch = sim;
      }
    }
    totalScore += bestMatch;
    if (bestMatch >= 0.8) strongHits++;
  }

  const minHitsRequired = queryTokens.length === 1 ? 1 : 2;
  if (strongHits < minHitsRequired) return 0;

  const avgScore = totalScore / queryTokens.length;
  if (strongHits >= 3) return Math.max(avgScore, 0.6 + strongHits * 0.08);
  if (strongHits >= 2) return Math.max(avgScore, 0.5 + strongHits * 0.1);
  return Math.max(avgScore, 0.4);
}

function searchConversations(vault, query, limit = 5) {
  const results = [];
  const msgsById = new Map();
  for (const msg of vault.messages) {
    if (!msgsById.has(msg.conversation_id)) msgsById.set(msg.conversation_id, []);
    msgsById.get(msg.conversation_id).push(msg);
  }

  for (const conv of vault.conversations) {
    const messages = msgsById.get(conv.id) || [];
    let bestScore = 0;
    let matchedContent = '';

    const titleScore = fuzzyScore(query, conv.title || '');
    if (titleScore > bestScore) { bestScore = titleScore; matchedContent = conv.title; }

    for (const msg of messages) {
      const msgScore = fuzzyScore(query, msg.content || '');
      if (msgScore > bestScore) { bestScore = msgScore; matchedContent = (msg.content || '').substring(0, 200); }
    }

    if (bestScore > 0.25) {
      results.push({ ...conv, messages, score: bestScore, matchedContent });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function searchNuggets(vault, topic, category) {
  const lower = topic.toLowerCase();
  let nuggets = vault.nuggets;

  if (category) {
    nuggets = nuggets.filter(n => (n.category || '').toLowerCase() === category.toLowerCase());
  }

  return nuggets.filter(n =>
    (n.question || '').toLowerCase().includes(lower) ||
    (n.answer || '').toLowerCase().includes(lower)
  ).slice(0, 10);
}

function findSimilarQuestions(vault, question, limit = 3) {
  const msgsById = new Map();
  for (const msg of vault.messages) {
    if (!msgsById.has(msg.conversation_id)) msgsById.set(msg.conversation_id, []);
    msgsById.get(msg.conversation_id).push(msg);
  }

  const results = [];

  // Check user messages
  for (const conv of vault.conversations) {
    const messages = msgsById.get(conv.id) || [];
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      const score = fuzzyScore(question, msg.content || '');
      if (score > 0.4) {
        const assistantReply = messages.find(m =>
          m.role === 'assistant' && m.timestamp > msg.timestamp
        );
        results.push({
          question: (msg.content || '').substring(0, 200),
          answer: assistantReply ? (assistantReply.content || '').substring(0, 400) : '(no reply found)',
          platform: conv.platform,
          date: conv.created_at,
          score,
        });
      }
    }
  }

  // Check nuggets
  for (const nugget of vault.nuggets) {
    const score = fuzzyScore(question, nugget.question || '');
    if (score > 0.4) {
      results.push({
        question: nugget.question,
        answer: nugget.answer,
        platform: 'knowledge',
        date: nugget.created_at,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ── MCP Server ── */

const server = new McpServer({
  name: 'oogvault',
  version: '0.2.0',
});

server.tool(
  'search_conversations',
  'Search through saved AI conversations by keyword. Returns matching conversations with previews.',
  {
    query: z.string().describe('Search query or keywords'),
    limit: z.number().optional().default(5).describe('Max results to return (default: 5)'),
  },
  async ({ query, limit }) => {
    const vault = loadVault();
    const results = searchConversations(vault, query, limit);

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No conversations found matching "${query}".` }] };
    }

    const formatted = results.map(r =>
      `**${r.title}**\n` +
      `Platform: ${r.platform || 'unknown'} | Date: ${r.created_at ? new Date(r.created_at).toLocaleDateString() : 'unknown'}\n` +
      `Preview: ${r.matchedContent}\n` +
      `ID: ${r.id}`
    ).join('\n\n---\n\n');

    return { content: [{ type: 'text', text: `Found ${results.length} conversation(s):\n\n${formatted}` }] };
  }
);

server.tool(
  'check_if_asked_before',
  'Check if the user has asked a similar question before. ONLY use this when: (1) user explicitly says "did I ask this before?", (2) question is complex/research-heavy and checking history would save significant work, (3) user references past conversations. Do NOT use for simple questions.',
  {
    question: z.string().describe('The question to check against past conversations'),
  },
  async ({ question }) => {
    const vault = loadVault();
    const similar = findSimilarQuestions(vault, question, 3);

    if (similar.length === 0) {
      return { content: [{ type: 'text', text: 'No similar questions found in the vault. This appears to be a new topic.' }] };
    }

    const formatted = similar.map(s =>
      `**Q:** ${s.question}\n` +
      `**A:** ${s.answer}\n` +
      `From: ${s.platform} • ${s.date ? new Date(s.date).toLocaleDateString() : 'unknown'}\n` +
      `Similarity: ${Math.round(s.score * 100)}%`
    ).join('\n\n---\n\n');

    return {
      content: [{ type: 'text', text: `Similar questions found:\n\n${formatted}\n\nWould you like me to elaborate or explore a new angle?` }],
    };
  }
);

server.tool(
  'get_conversation',
  'Retrieve a specific conversation by ID. Use after search_conversations to get the full message history.',
  {
    id: z.string().describe('Conversation ID from search results'),
  },
  async ({ id }) => {
    const vault = loadVault();
    const conv = vault.conversations.find(c => c.id === id);

    if (!conv) {
      return { content: [{ type: 'text', text: `Conversation "${id}" not found.` }], isError: true };
    }

    const messages = vault.messages
      .filter(m => m.conversation_id === id)
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

    const formatted = messages.map(m =>
      `**${m.role === 'user' ? 'You' : 'Assistant'}:** ${m.content}`
    ).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `**${conv.title}**\nPlatform: ${conv.platform || 'unknown'}\nDate: ${conv.created_at ? new Date(conv.created_at).toLocaleDateString() : 'unknown'}\n\n${formatted}`,
      }],
    };
  }
);

server.tool(
  'search_knowledge_nuggets',
  'Search through extracted Q&A knowledge nuggets by topic. These are distilled insights from past conversations.',
  {
    topic: z.string().describe('Topic or keyword to search for'),
    category: z.string().optional().describe('Optional category filter (e.g. "Tech", "Finance", "AI")'),
  },
  async ({ topic, category }) => {
    const vault = loadVault();
    const nuggets = searchNuggets(vault, topic, category);

    if (nuggets.length === 0) {
      return {
        content: [{ type: 'text', text: `No knowledge nuggets found for "${topic}"${category ? ` in category "${category}"` : ''}.` }],
      };
    }

    const formatted = nuggets.map(n =>
      `**Q:** ${n.question}\n**A:** ${n.answer}\nCategory: ${n.category || 'General'}`
    ).join('\n\n---\n\n');

    return { content: [{ type: 'text', text: `Found ${nuggets.length} nugget(s):\n\n${formatted}` }] };
  }
);

server.tool(
  'list_recent_conversations',
  'List the most recent conversations. Useful for "what did we discuss recently?" type queries.',
  {
    limit: z.number().optional().default(10).describe('Number of conversations to return (default: 10)'),
  },
  async ({ limit }) => {
    const vault = loadVault();
    const sorted = [...vault.conversations]
      .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
      .slice(0, limit);

    if (sorted.length === 0) {
      return { content: [{ type: 'text', text: 'No conversations found in the vault.' }] };
    }

    const formatted = sorted.map(c =>
      `**${c.title}**\nPlatform: ${c.platform || 'unknown'} | Date: ${c.created_at ? new Date(c.created_at).toLocaleDateString() : 'unknown'}\nID: ${c.id}`
    ).join('\n\n');

    return { content: [{ type: 'text', text: `Your ${sorted.length} most recent conversation(s):\n\n${formatted}` }] };
  }
);

/* ── Start ── */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[OogVault MCP] Server running on stdio');
  console.error('[OogVault MCP] Snapshot path:', getSnapshotPath());
}

main().catch((err) => {
  console.error('[OogVault MCP] Fatal error:', err);
  process.exit(1);
});
