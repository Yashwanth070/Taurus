import Anthropic from '@anthropic-ai/sdk';
import { allTools, executeTool } from './tools';
import {
    getConversationHistory,
    addMessage,
    formatMessagesForClaude,
    buildSystemPromptWithMemories
} from './memory';
import { getDb, saveDb } from './db';
import { v4 as uuidv4 } from 'uuid';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are Taurus, a helpful, friendly, and capable AI assistant. You have access to various tools that allow you to:

1. **Browse the web** - Fetch and read content from websites
2. **Process files** - Read uploaded documents (PDFs, Word docs, text files, code)
3. **Store and retrieve data** - Save information to a database for later use
4. **Make API calls** - Interact with external APIs
5. **Remember things** - Store important information about the user for future conversations

Be conversational and helpful. When you use tools, briefly explain what you're doing. If a tool fails, try to help the user anyway or suggest alternatives.

Remember to use the 'remember' tool when the user shares important personal information, preferences, or facts they want you to recall later.`;

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export async function ensureConversation(conversationId: string): Promise<void> {
    const db = await getDb();

    const existing = db.exec(
        `SELECT id FROM conversations WHERE id = ?`,
        [conversationId]
    );

    if (!existing[0]?.values.length) {
        db.run(
            `INSERT INTO conversations (id, title) VALUES (?, ?)`,
            [conversationId, 'New Conversation']
        );
        saveDb();
    }
}

export async function chat(
    conversationId: string,
    userMessage: string,
    onStream?: (text: string) => void
): Promise<string> {
    await ensureConversation(conversationId);

    // Add user message to history
    await addMessage(conversationId, 'user', userMessage);

    // Get conversation history and memories
    const history = await getConversationHistory(conversationId);

    // Build system prompt with memories
    const systemPrompt = buildSystemPromptWithMemories(SYSTEM_PROMPT, history.memories);

    // Format messages for Claude
    const messages = formatMessagesForClaude(history);

    let fullResponse = '';
    let toolUseBlocks: any[] = [];

    // Initial API call
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: allTools as any,
        messages: messages as any,
    });

    // Process response
    for (const block of response.content) {
        if (block.type === 'text') {
            fullResponse += block.text;
            onStream?.(block.text);
        } else if (block.type === 'tool_use') {
            toolUseBlocks.push(block);
        }
    }

    // Handle tool calls
    if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        // Execute tools and get results
        const toolResults = await Promise.all(
            toolUseBlocks.map(async (toolUse) => {
                const result = await executeTool(toolUse.name, toolUse.input, conversationId);
                return {
                    type: 'tool_result' as const,
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result),
                };
            })
        );

        // Continue conversation with tool results
        const continuedMessages = [
            ...messages,
            { role: 'assistant' as const, content: response.content },
            { role: 'user' as const, content: toolResults },
        ];

        const continuedResponse = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            tools: allTools as any,
            messages: continuedMessages as any,
        });

        // Extract text from continued response
        for (const block of continuedResponse.content) {
            if (block.type === 'text') {
                fullResponse += block.text;
                onStream?.(block.text);
            }
        }
    }

    // Save assistant response
    await addMessage(conversationId, 'assistant', fullResponse);

    return fullResponse;
}

export async function streamChat(
    conversationId: string,
    userMessage: string
): Promise<ReadableStream> {
    await ensureConversation(conversationId);

    // Add user message to history
    await addMessage(conversationId, 'user', userMessage);

    // Get conversation history and memories
    const history = await getConversationHistory(conversationId);

    // Build system prompt with memories
    const systemPrompt = buildSystemPromptWithMemories(SYSTEM_PROMPT, history.memories);

    // Format messages for Claude
    const messages = formatMessagesForClaude(history);

    const encoder = new TextEncoder();

    return new ReadableStream({
        async start(controller) {
            let fullResponse = '';
            let toolUseBlocks: any[] = [];
            let currentToolUse: any = null;

            try {
                const stream = await anthropic.messages.stream({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 4096,
                    system: systemPrompt,
                    tools: allTools as any,
                    messages: messages as any,
                });

                for await (const event of stream) {
                    if (event.type === 'content_block_delta') {
                        if (event.delta.type === 'text_delta') {
                            fullResponse += event.delta.text;
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`));
                        } else if (event.delta.type === 'input_json_delta') {
                            // Tool input is being streamed
                        }
                    } else if (event.type === 'content_block_start') {
                        if (event.content_block.type === 'tool_use') {
                            currentToolUse = {
                                id: event.content_block.id,
                                name: event.content_block.name,
                                input: '',
                            };
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', name: event.content_block.name })}\n\n`));
                        }
                    } else if (event.type === 'content_block_stop') {
                        if (currentToolUse) {
                            toolUseBlocks.push(currentToolUse);
                            currentToolUse = null;
                        }
                    } else if (event.type === 'message_stop') {
                        // Message complete
                    }
                }

                // Get the final message to check for tool use
                const finalMessage = await stream.finalMessage();

                // Handle tool calls
                if (finalMessage.stop_reason === 'tool_use') {
                    // Extract tool use blocks from final message
                    const toolBlocks = finalMessage.content.filter(b => b.type === 'tool_use');

                    for (const toolUse of toolBlocks) {
                        if (toolUse.type === 'tool_use') {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                type: 'tool_executing',
                                name: toolUse.name,
                                input: toolUse.input
                            })}\n\n`));

                            const result = await executeTool(toolUse.name, toolUse.input, conversationId);

                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                type: 'tool_result',
                                name: toolUse.name,
                                result: result
                            })}\n\n`));
                        }
                    }

                    // Build tool results
                    const toolResults = toolBlocks
                        .filter(b => b.type === 'tool_use')
                        .map(async (toolUse) => {
                            if (toolUse.type === 'tool_use') {
                                const result = await executeTool(toolUse.name, toolUse.input, conversationId);
                                return {
                                    type: 'tool_result' as const,
                                    tool_use_id: toolUse.id,
                                    content: JSON.stringify(result),
                                };
                            }
                        });

                    const resolvedResults = await Promise.all(toolResults);

                    // Continue conversation with tool results
                    const continuedMessages = [
                        ...messages,
                        { role: 'assistant' as const, content: finalMessage.content },
                        { role: 'user' as const, content: resolvedResults },
                    ];

                    const continuedStream = await anthropic.messages.stream({
                        model: 'claude-sonnet-4-20250514',
                        max_tokens: 4096,
                        system: systemPrompt,
                        tools: allTools as any,
                        messages: continuedMessages as any,
                    });

                    for await (const event of continuedStream) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            fullResponse += event.delta.text;
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`));
                        }
                    }
                }

                // Save the full response
                await addMessage(conversationId, 'assistant', fullResponse);

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                controller.close();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`));
                controller.close();
            }
        },
    });
}
