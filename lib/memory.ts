import { getDb, saveDb, Message, Memory } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationHistory {
    messages: Message[];
    memories: Memory[];
}

export async function getConversationHistory(conversationId: string): Promise<ConversationHistory> {
    const db = await getDb();

    const messagesResult = db.exec(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
        [conversationId]
    );

    const memoriesResult = db.exec(
        `SELECT * FROM memories WHERE conversation_id = ? ORDER BY created_at ASC`,
        [conversationId]
    );

    const messages: Message[] = messagesResult[0]?.values.map((row: any[]) => ({
        id: row[0],
        conversation_id: row[1],
        role: row[2] as 'user' | 'assistant',
        content: row[3],
        tool_calls: row[4],
        tool_results: row[5],
        created_at: row[6],
    })) || [];

    const memories: Memory[] = memoriesResult[0]?.values.map((row: any[]) => ({
        id: row[0],
        conversation_id: row[1],
        key: row[2],
        value: row[3],
        created_at: row[4],
    })) || [];

    return { messages, memories };
}

export async function addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    toolCalls?: string,
    toolResults?: string
): Promise<Message> {
    const db = await getDb();
    const id = uuidv4();

    db.run(
        `INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_results) 
     VALUES (?, ?, ?, ?, ?, ?)`,
        [id, conversationId, role, content, toolCalls || null, toolResults || null]
    );

    // Update conversation timestamp
    db.run(
        `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [conversationId]
    );

    saveDb();

    return {
        id,
        conversation_id: conversationId,
        role,
        content,
        tool_calls: toolCalls,
        tool_results: toolResults,
        created_at: new Date().toISOString(),
    };
}

export async function storeMemory(
    conversationId: string,
    key: string,
    value: string
): Promise<Memory> {
    const db = await getDb();
    const id = uuidv4();

    // Check if memory with same key exists
    const existing = db.exec(
        `SELECT id FROM memories WHERE conversation_id = ? AND key = ?`,
        [conversationId, key]
    );

    if (existing[0]?.values.length > 0) {
        // Update existing memory
        db.run(
            `UPDATE memories SET value = ? WHERE conversation_id = ? AND key = ?`,
            [value, conversationId, key]
        );
    } else {
        // Insert new memory
        db.run(
            `INSERT INTO memories (id, conversation_id, key, value) VALUES (?, ?, ?, ?)`,
            [id, conversationId, key, value]
        );
    }

    saveDb();

    return {
        id,
        conversation_id: conversationId,
        key,
        value,
        created_at: new Date().toISOString(),
    };
}

export async function getMemory(conversationId: string, key: string): Promise<string | null> {
    const db = await getDb();

    const result = db.exec(
        `SELECT value FROM memories WHERE conversation_id = ? AND key = ?`,
        [conversationId, key]
    );

    return result[0]?.values[0]?.[0] as string || null;
}

export async function getAllMemories(conversationId: string): Promise<Memory[]> {
    const db = await getDb();

    const result = db.exec(
        `SELECT * FROM memories WHERE conversation_id = ?`,
        [conversationId]
    );

    return result[0]?.values.map((row: any[]) => ({
        id: row[0],
        conversation_id: row[1],
        key: row[2],
        value: row[3],
        created_at: row[4],
    })) || [];
}

export function formatMessagesForClaude(history: ConversationHistory): { role: string; content: string }[] {
    return history.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
    }));
}

export function buildSystemPromptWithMemories(basePrompt: string, memories: Memory[]): string {
    if (memories.length === 0) return basePrompt;

    const memorySection = memories
        .map(m => `- ${m.key}: ${m.value}`)
        .join('\n');

    return `${basePrompt}

## User Memories
The following are things you've learned about the user or important facts to remember:
${memorySection}`;
}
