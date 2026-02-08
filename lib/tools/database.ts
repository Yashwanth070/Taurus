import { getDb, saveDb } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface DatabaseQueryResult {
    success: boolean;
    data?: any[];
    rowsAffected?: number;
    error?: string;
}

export async function queryDatabase(
    conversationId: string,
    query: string,
    params?: any[]
): Promise<DatabaseQueryResult> {
    try {
        const db = await getDb();

        // Only allow safe queries on user data table
        const safeTables = ['user_data'];
        const queryLower = query.toLowerCase().trim();

        // Check if this is a CREATE TABLE for user_data
        if (queryLower.startsWith('create table')) {
            // Allow creating user_data table with conversation scope
            const tableMatch = query.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/i);
            if (tableMatch) {
                const tableName = tableMatch[1];
                if (tableName === 'user_data') {
                    db.run(query);
                    saveDb();
                    return { success: true, rowsAffected: 0 };
                }
            }
            return { success: false, error: 'Only user_data table can be created' };
        }

        // For SELECT queries
        if (queryLower.startsWith('select')) {
            const result = db.exec(query, params);
            const data = result[0]?.values.map((row: any[]) => {
                const columns = result[0].columns;
                const obj: Record<string, any> = {};
                columns.forEach((col: string, i: number) => {
                    obj[col] = row[i];
                });
                return obj;
            }) || [];
            return { success: true, data };
        }

        // For INSERT/UPDATE/DELETE
        if (
            queryLower.startsWith('insert') ||
            queryLower.startsWith('update') ||
            queryLower.startsWith('delete')
        ) {
            // Ensure operation is on allowed tables
            const hasAllowedTable = safeTables.some(t => queryLower.includes(t));
            if (!hasAllowedTable) {
                return { success: false, error: 'Operation only allowed on user_data table' };
            }

            db.run(query, params);
            saveDb();
            return { success: true, rowsAffected: db.getRowsModified() };
        }

        return { success: false, error: 'Query type not supported' };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

export async function storeUserData(
    conversationId: string,
    key: string,
    value: any
): Promise<DatabaseQueryResult> {
    try {
        const db = await getDb();
        const id = uuidv4();

        // Ensure user_data table exists
        db.run(`
      CREATE TABLE IF NOT EXISTS user_data (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        key TEXT,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Check if key exists
        const existing = db.exec(
            `SELECT id FROM user_data WHERE conversation_id = ? AND key = ?`,
            [conversationId, key]
        );

        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

        if (existing[0]?.values.length > 0) {
            db.run(
                `UPDATE user_data SET value = ? WHERE conversation_id = ? AND key = ?`,
                [valueStr, conversationId, key]
            );
        } else {
            db.run(
                `INSERT INTO user_data (id, conversation_id, key, value) VALUES (?, ?, ?, ?)`,
                [id, conversationId, key, valueStr]
            );
        }

        saveDb();
        return { success: true, rowsAffected: 1 };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

export async function getUserData(
    conversationId: string,
    key?: string
): Promise<DatabaseQueryResult> {
    try {
        const db = await getDb();

        // Ensure user_data table exists
        db.run(`
      CREATE TABLE IF NOT EXISTS user_data (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        key TEXT,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        let result;
        if (key) {
            result = db.exec(
                `SELECT key, value FROM user_data WHERE conversation_id = ? AND key = ?`,
                [conversationId, key]
            );
        } else {
            result = db.exec(
                `SELECT key, value FROM user_data WHERE conversation_id = ?`,
                [conversationId]
            );
        }

        const data = result[0]?.values.map((row: any[]) => ({
            key: row[0],
            value: row[1],
        })) || [];

        return { success: true, data };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

export const databaseTools = [
    {
        name: 'store_data',
        description: 'Store a key-value pair in the database for later retrieval. Use this to remember information across conversations.',
        input_schema: {
            type: 'object' as const,
            properties: {
                key: {
                    type: 'string',
                    description: 'The key to store the data under',
                },
                value: {
                    type: 'string',
                    description: 'The value to store (can be JSON for complex data)',
                },
            },
            required: ['key', 'value'],
        },
    },
    {
        name: 'retrieve_data',
        description: 'Retrieve stored data from the database by key. If no key provided, returns all stored data.',
        input_schema: {
            type: 'object' as const,
            properties: {
                key: {
                    type: 'string',
                    description: 'The key to retrieve data for (optional, omit to get all data)',
                },
            },
            required: [],
        },
    },
];
