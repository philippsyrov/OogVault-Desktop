#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
function getSnapshotPath() {
    if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Application Support', 'oogvault-desktop', 'vault-snapshot.json');
    }
    if (process.platform === 'win32') {
        return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'oogvault-desktop', 'vault-snapshot.json');
    }
    return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'oogvault-desktop', 'vault-snapshot.json');
}
function loadVault() {
    const snapshotPath = getSnapshotPath();
    if (!existsSync(snapshotPath)) {
        return { conversations: [], messages: [], nuggets: [] };
    }
    try {
        const raw = readFileSync(snapshotPath, 'utf-8');
        const data = JSON.parse(raw);
        return {
            conversations: data.conversations || [],
            messages: data.messages || [],
            nuggets: data.nuggets || [],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[OogVault MCP] Failed to read snapshot:', message);
        return { conversations: [], messages: [], nuggets: [] };
    }
}
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
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 1);
}
function extractKeywords(text) {
    return tokenize(text).filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}
function levenshtein(left, right) {
    const matrix = Array.from({ length: left.length + 1 }, (_, row) => Array.from({ length: right.length + 1 }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)));
    for (let row = 1; row <= left.length; row++) {
        for (let column = 1; column <= right.length; column++) {
            const cost = left[row - 1] === right[column - 1] ? 0 : 1;
            matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + cost);
        }
    }
    return matrix[left.length][right.length];
}
function fuzzyScore(query, text) {
    const normalizedQuery = query.toLowerCase();
    const normalizedText = text.toLowerCase();
    if (normalizedText.includes(normalizedQuery)) {
        return 1;
    }
    const queryKeywords = extractKeywords(normalizedQuery);
    const textTokens = tokenize(normalizedText);
    const queryTokens = queryKeywords.length > 0 ? queryKeywords : tokenize(normalizedQuery);
    if (queryTokens.length === 0) {
        return 0;
    }
    let totalScore = 0;
    let strongHits = 0;
    for (const queryToken of queryTokens) {
        let bestMatch = 0;
        for (const textToken of textTokens) {
            if (textToken === queryToken) {
                bestMatch = 1;
                break;
            }
            if (textToken.includes(queryToken) || queryToken.includes(textToken)) {
                const shorter = Math.min(queryToken.length, textToken.length);
                const longer = Math.max(queryToken.length, textToken.length);
                if (shorter >= 4 && shorter / longer >= 0.7) {
                    bestMatch = Math.max(bestMatch, 0.9);
                }
                continue;
            }
            if (queryToken.length >= 4 && Math.abs(queryToken.length - textToken.length) <= 2) {
                const similarity = 1 - levenshtein(queryToken, textToken) / Math.max(queryToken.length, textToken.length);
                if (similarity >= 0.7 && similarity > bestMatch) {
                    bestMatch = similarity;
                }
            }
        }
        totalScore += bestMatch;
        if (bestMatch >= 0.8) {
            strongHits++;
        }
    }
    const minHitsRequired = queryTokens.length === 1 ? 1 : 2;
    if (strongHits < minHitsRequired) {
        return 0;
    }
    const averageScore = totalScore / queryTokens.length;
    if (strongHits >= 3)
        return Math.max(averageScore, 0.6 + strongHits * 0.08);
    if (strongHits >= 2)
        return Math.max(averageScore, 0.5 + strongHits * 0.1);
    return Math.max(averageScore, 0.4);
}
function searchConversations(vault, query, limit = 5) {
    const results = [];
    const messagesByConversation = new Map();
    for (const message of vault.messages) {
        if (!messagesByConversation.has(message.conversation_id)) {
            messagesByConversation.set(message.conversation_id, []);
        }
        messagesByConversation.get(message.conversation_id)?.push(message);
    }
    for (const conversation of vault.conversations) {
        const messages = messagesByConversation.get(conversation.id) || [];
        let bestScore = 0;
        let matchedContent = '';
        const titleScore = fuzzyScore(query, conversation.title || '');
        if (titleScore > bestScore) {
            bestScore = titleScore;
            matchedContent = conversation.title;
        }
        for (const message of messages) {
            const messageScore = fuzzyScore(query, message.content || '');
            if (messageScore > bestScore) {
                bestScore = messageScore;
                matchedContent = (message.content || '').substring(0, 200);
            }
        }
        if (bestScore > 0.25) {
            results.push({
                ...conversation,
                messages,
                score: bestScore,
                matchedContent,
            });
        }
    }
    return results.sort((left, right) => right.score - left.score).slice(0, limit);
}
function searchNuggets(vault, topic, category) {
    const normalizedTopic = topic.toLowerCase();
    let nuggets = vault.nuggets;
    if (category) {
        nuggets = nuggets.filter((nugget) => (nugget.category || '').toLowerCase() === category.toLowerCase());
    }
    return nuggets
        .filter((nugget) => (nugget.question || '').toLowerCase().includes(normalizedTopic) ||
        (nugget.answer || '').toLowerCase().includes(normalizedTopic))
        .slice(0, 10);
}
function findSimilarQuestions(vault, question, limit = 3) {
    const messagesByConversation = new Map();
    for (const message of vault.messages) {
        if (!messagesByConversation.has(message.conversation_id)) {
            messagesByConversation.set(message.conversation_id, []);
        }
        messagesByConversation.get(message.conversation_id)?.push(message);
    }
    const results = [];
    for (const conversation of vault.conversations) {
        const messages = messagesByConversation.get(conversation.id) || [];
        for (const message of messages) {
            if (message.role !== 'user') {
                continue;
            }
            const score = fuzzyScore(question, message.content || '');
            if (score > 0.4) {
                const assistantReply = messages.find((candidate) => candidate.role === 'assistant' && candidate.timestamp > message.timestamp);
                results.push({
                    question: (message.content || '').substring(0, 200),
                    answer: assistantReply ? (assistantReply.content || '').substring(0, 400) : '(no reply found)',
                    platform: conversation.platform || 'unknown',
                    date: conversation.created_at,
                    score,
                });
            }
        }
    }
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
    return results.sort((left, right) => right.score - left.score).slice(0, limit);
}
const server = new McpServer({
    name: 'oogvault',
    version: '0.2.0',
});
server.tool('search_conversations', 'Search through saved AI conversations by keyword. Returns matching conversations with previews.', {
    query: z.string().describe('Search query or keywords'),
    limit: z.number().optional().default(5).describe('Max results to return (default: 5)'),
}, async ({ query, limit }) => {
    const vault = loadVault();
    const results = searchConversations(vault, query, limit);
    if (results.length === 0) {
        return { content: [{ type: 'text', text: `No conversations found matching "${query}".` }] };
    }
    const formatted = results
        .map((result) => `**${result.title}**\n` +
        `Platform: ${result.platform || 'unknown'} | Date: ${result.created_at ? new Date(result.created_at).toLocaleDateString() : 'unknown'}\n` +
        `Preview: ${result.matchedContent}\n` +
        `ID: ${result.id}`)
        .join('\n\n---\n\n');
    return {
        content: [{ type: 'text', text: `Found ${results.length} conversation(s):\n\n${formatted}` }],
    };
});
server.tool('check_if_asked_before', 'Check if the user has asked a similar question before. ONLY use this when: (1) user explicitly says "did I ask this before?", (2) question is complex/research-heavy and checking history would save significant work, (3) user references past conversations. Do NOT use for simple questions.', {
    question: z.string().describe('The question to check against past conversations'),
}, async ({ question }) => {
    const vault = loadVault();
    const similar = findSimilarQuestions(vault, question, 3);
    if (similar.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: 'No similar questions found in the vault. This appears to be a new topic.',
                }],
        };
    }
    const formatted = similar
        .map((item) => `**Q:** ${item.question}\n` +
        `**A:** ${item.answer}\n` +
        `From: ${item.platform} • ${item.date ? new Date(item.date).toLocaleDateString() : 'unknown'}\n` +
        `Similarity: ${Math.round(item.score * 100)}%`)
        .join('\n\n---\n\n');
    return {
        content: [{
                type: 'text',
                text: `Similar questions found:\n\n${formatted}\n\nWould you like me to elaborate or explore a new angle?`,
            }],
    };
});
server.tool('get_conversation', 'Retrieve a specific conversation by ID. Use after search_conversations to get the full message history.', {
    id: z.string().describe('Conversation ID from search results'),
}, async ({ id }) => {
    const vault = loadVault();
    const conversation = vault.conversations.find((item) => item.id === id);
    if (!conversation) {
        return {
            content: [{ type: 'text', text: `Conversation "${id}" not found.` }],
            isError: true,
        };
    }
    const messages = vault.messages
        .filter((message) => message.conversation_id === id)
        .sort((left, right) => (left.timestamp || '').localeCompare(right.timestamp || ''));
    const formatted = messages
        .map((message) => `**${message.role === 'user' ? 'You' : 'Assistant'}:** ${message.content}`)
        .join('\n\n');
    return {
        content: [{
                type: 'text',
                text: `**${conversation.title}**\n` +
                    `Platform: ${conversation.platform || 'unknown'}\n` +
                    `Date: ${conversation.created_at ? new Date(conversation.created_at).toLocaleDateString() : 'unknown'}\n\n` +
                    `${formatted}`,
            }],
    };
});
server.tool('search_knowledge_nuggets', 'Search through extracted Q&A knowledge nuggets by topic. These are distilled insights from past conversations.', {
    topic: z.string().describe('Topic or keyword to search for'),
    category: z.string().optional().describe('Optional category filter (e.g. "Tech", "Finance", "AI")'),
}, async ({ topic, category }) => {
    const vault = loadVault();
    const nuggets = searchNuggets(vault, topic, category);
    if (nuggets.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: `No knowledge nuggets found for "${topic}"${category ? ` in category "${category}"` : ''}.`,
                }],
        };
    }
    const formatted = nuggets
        .map((nugget) => `**Q:** ${nugget.question}\n**A:** ${nugget.answer}\nCategory: ${nugget.category || 'General'}`)
        .join('\n\n---\n\n');
    return {
        content: [{ type: 'text', text: `Found ${nuggets.length} nugget(s):\n\n${formatted}` }],
    };
});
server.tool('list_recent_conversations', 'List the most recent conversations. Useful for "what did we discuss recently?" type queries.', {
    limit: z.number().optional().default(10).describe('Number of conversations to return (default: 10)'),
}, async ({ limit }) => {
    const vault = loadVault();
    const sorted = [...vault.conversations]
        .sort((left, right) => (right.updated_at || right.created_at || '').localeCompare(left.updated_at || left.created_at || ''))
        .slice(0, limit);
    if (sorted.length === 0) {
        return { content: [{ type: 'text', text: 'No conversations found in the vault.' }] };
    }
    const formatted = sorted
        .map((conversation) => `**${conversation.title}**\n` +
        `Platform: ${conversation.platform || 'unknown'} | Date: ${conversation.created_at ? new Date(conversation.created_at).toLocaleDateString() : 'unknown'}\n` +
        `ID: ${conversation.id}`)
        .join('\n\n');
    return {
        content: [{
                type: 'text',
                text: `Your ${sorted.length} most recent conversation(s):\n\n${formatted}`,
            }],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[OogVault MCP] Server running on stdio');
    console.error('[OogVault MCP] Snapshot path:', getSnapshotPath());
}
main().catch((error) => {
    console.error('[OogVault MCP] Fatal error:', error);
    process.exit(1);
});
