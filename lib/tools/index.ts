import { browseWeb, webBrowseTool } from './web-browse';
import { fileProcessTool } from './file-process';
import { databaseTools, storeUserData, getUserData } from './database';
import { apiCallTool, makeApiCall } from './api-call';
import { storeMemory, getMemory } from '../memory';
import { getDb, saveDb } from '../db';

// Memory tools
const memoryTools = [
    {
        name: 'remember',
        description: 'Store an important piece of information about the user or conversation to remember for later. Use this when the user shares personal details, preferences, or important facts.',
        input_schema: {
            type: 'object' as const,
            properties: {
                key: {
                    type: 'string',
                    description: 'A short identifier for what you are remembering (e.g., "user_name", "favorite_color", "work_project")',
                },
                value: {
                    type: 'string',
                    description: 'The information to remember',
                },
            },
            required: ['key', 'value'],
        },
    },
    {
        name: 'recall',
        description: 'Retrieve a previously remembered piece of information.',
        input_schema: {
            type: 'object' as const,
            properties: {
                key: {
                    type: 'string',
                    description: 'The identifier of the information to recall',
                },
            },
            required: ['key'],
        },
    },
];

// All available tools
export const allTools = [
    webBrowseTool,
    fileProcessTool,
    ...databaseTools,
    apiCallTool,
    ...memoryTools,
];

// Tool execution handler
export async function executeTool(
    toolName: string,
    toolInput: any,
    conversationId: string
): Promise<any> {
    switch (toolName) {
        case 'browse_web':
            return await browseWeb(toolInput.url);

        case 'read_uploaded_file':
            const db = await getDb();
            const fileResult = db.exec(
                `SELECT content, filename, mimetype FROM files WHERE id = ? AND conversation_id = ?`,
                [toolInput.file_id, conversationId]
            );
            if (fileResult[0]?.values.length > 0) {
                const [content, filename, mimetype] = fileResult[0].values[0] as [string, string, string];
                return {
                    success: true,
                    filename,
                    mimetype,
                    content,
                };
            }
            return { success: false, error: 'File not found' };

        case 'store_data':
            return await storeUserData(conversationId, toolInput.key, toolInput.value);

        case 'retrieve_data':
            return await getUserData(conversationId, toolInput.key);

        case 'api_call':
            return await makeApiCall(
                toolInput.url,
                toolInput.method || 'GET',
                toolInput.headers,
                toolInput.body
            );

        case 'remember':
            await storeMemory(conversationId, toolInput.key, toolInput.value);
            return { success: true, message: `Remembered: ${toolInput.key}` };

        case 'recall':
            const memory = await getMemory(conversationId, toolInput.key);
            if (memory) {
                return { success: true, key: toolInput.key, value: memory };
            }
            return { success: false, message: `No memory found for key: ${toolInput.key}` };

        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}
