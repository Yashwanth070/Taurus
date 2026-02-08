'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at?: string;
}

interface Conversation {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

interface UploadedFile {
    id: string;
    filename: string;
    mimetype: string;
    size: number;
}

export default function Chat() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
    const [toolActivity, setToolActivity] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/login');
        }
    }, [status, router]);

    // Load conversations on mount
    useEffect(() => {
        loadConversations();
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
        }
    }, [input]);

    const loadConversations = async () => {
        try {
            const res = await fetch('/api/conversations');
            const data = await res.json();
            setConversations(data.conversations || []);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    };

    const loadMessages = async (conversationId: string) => {
        try {
            const res = await fetch(`/api/conversations/${conversationId}`);
            const data = await res.json();
            setMessages(data.messages || []);
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    };

    const createNewConversation = async () => {
        const newId = uuidv4();
        setCurrentConversationId(newId);
        setMessages([]);
        setInput('');
        setUploadedFile(null);
    };

    const selectConversation = async (conversation: Conversation) => {
        setCurrentConversationId(conversation.id);
        await loadMessages(conversation.id);
        setUploadedFile(null);
    };

    const deleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
            setConversations(prev => prev.filter(c => c.id !== id));
            if (currentConversationId === id) {
                setCurrentConversationId(null);
                setMessages([]);
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentConversationId) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversationId', currentConversationId);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (res.ok) {
                setUploadedFile(data);
            } else {
                console.error('Upload failed:', data.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const conversationId = currentConversationId || uuidv4();
        if (!currentConversationId) {
            setCurrentConversationId(conversationId);
        }

        const userMessage: Message = {
            id: uuidv4(),
            role: 'user',
            content: uploadedFile
                ? `[Uploaded file: ${uploadedFile.filename}]\n\n${input}`
                : input,
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setUploadedFile(null);
        setIsLoading(true);
        setIsStreaming(true);

        // Add placeholder for assistant response
        const assistantId = uuidv4();
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    conversationId,
                }),
            });

            if (!res.ok) throw new Error('Chat request failed');

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));

                                if (data.type === 'text') {
                                    setMessages(prev => prev.map(m =>
                                        m.id === assistantId
                                            ? { ...m, content: m.content + data.content }
                                            : m
                                    ));
                                } else if (data.type === 'tool_start' || data.type === 'tool_executing') {
                                    setToolActivity(`Using ${data.name}...`);
                                } else if (data.type === 'tool_result') {
                                    setToolActivity(null);
                                } else if (data.type === 'done') {
                                    setToolActivity(null);
                                } else if (data.type === 'error') {
                                    console.error('Stream error:', data.error);
                                }
                            } catch {
                                // Ignore parse errors
                            }
                        }
                    }
                }
            }

            // Refresh conversations list
            loadConversations();
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: 'Sorry, something went wrong. Please try again.' }
                    : m
            ));
        } finally {
            setIsLoading(false);
            setIsStreaming(false);
            setToolActivity(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Show loading while checking auth
    if (status === 'loading') {
        return (
            <div className="auth-loading">
                <div className="auth-loading-spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }

    // Don't render if not authenticated
    if (!session) {
        return null;
    }

    return (
        <div className="app-container">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo">
                        <div className="logo-icon">♉</div>
                        <span className="logo-text">Taurus</span>
                    </div>
                    <button className="new-chat-btn" onClick={createNewConversation}>
                        <span>+</span> New Chat
                    </button>
                </div>

                <div className="conversations-list">
                    {conversations.map(conv => (
                        <div
                            key={conv.id}
                            className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
                            onClick={() => selectConversation(conv)}
                        >
                            <div className="conversation-icon">💬</div>
                            <div className="conversation-info">
                                <div className="conversation-title">{conv.title}</div>
                                <div className="conversation-date">
                                    {new Date(conv.updated_at).toLocaleDateString()}
                                </div>
                            </div>
                            <button
                                className="conversation-delete"
                                onClick={(e) => deleteConversation(conv.id, e)}
                            >
                                🗑️
                            </button>
                        </div>
                    ))}
                </div>

                {/* User Profile */}
                <div className="sidebar-footer">
                    <div className="user-profile">
                        <div className="user-avatar">
                            {session.user?.name?.charAt(0).toUpperCase() || '👤'}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{session.user?.name || 'User'}</div>
                            <div className="user-email">{session.user?.email}</div>
                        </div>
                        <button
                            className="logout-btn"
                            onClick={() => signOut()}
                            title="Sign out"
                        >
                            🚪
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Chat */}
            <main className="chat-container">
                <header className="chat-header">
                    <span className="chat-title">
                        {currentConversationId
                            ? conversations.find(c => c.id === currentConversationId)?.title || 'New Conversation'
                            : 'Taurus'}
                    </span>
                    <div className="chat-status">
                        <span className="status-dot"></span>
                        Online
                    </div>
                </header>

                {messages.length === 0 ? (
                    <div className="welcome-container">
                        <div className="welcome-icon">♉</div>
                        <h1 className="welcome-title">Welcome to Taurus</h1>
                        <p className="welcome-subtitle">
                            I&apos;m your intelligent assistant with superpowers. I can browse the web,
                            process files, remember things, and much more!
                        </p>
                        <div className="capabilities-grid">
                            <div className="capability-card">
                                <div className="capability-icon">🌐</div>
                                <div className="capability-title">Web Browsing</div>
                                <div className="capability-desc">Fetch and analyze web content</div>
                            </div>
                            <div className="capability-card">
                                <div className="capability-icon">📄</div>
                                <div className="capability-title">File Processing</div>
                                <div className="capability-desc">Read PDFs, docs, and code</div>
                            </div>
                            <div className="capability-card">
                                <div className="capability-icon">💾</div>
                                <div className="capability-title">Data Storage</div>
                                <div className="capability-desc">Save and retrieve information</div>
                            </div>
                            <div className="capability-card">
                                <div className="capability-icon">🧠</div>
                                <div className="capability-title">Memory</div>
                                <div className="capability-desc">Remember context across chats</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="messages-container">
                        <div className="messages-wrapper">
                            {messages.map(message => (
                                <div key={message.id} className={`message ${message.role}`}>
                                    <div className="message-avatar">
                                        {message.role === 'user' ? '👤' : '🤖'}
                                    </div>
                                    <div className="message-content">
                                        <div className="message-role">
                                            {message.role === 'user' ? 'You' : 'Taurus'}
                                        </div>
                                        <div className="message-text">
                                            {message.content || (
                                                <div className="typing-indicator">
                                                    <div className="typing-dot"></div>
                                                    <div className="typing-dot"></div>
                                                    <div className="typing-dot"></div>
                                                </div>
                                            )}
                                        </div>
                                        {toolActivity && message.role === 'assistant' && !message.content && (
                                            <div className="tool-indicator executing">
                                                ⚡ {toolActivity}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>
                )}

                <div className="input-container">
                    <div className="input-wrapper">
                        {uploadedFile && (
                            <div className="file-preview">
                                <div className="file-preview-icon">📎</div>
                                <span className="file-preview-name">{uploadedFile.filename}</span>
                                <button
                                    className="file-preview-remove"
                                    onClick={() => setUploadedFile(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                        <div className="input-box">
                            <textarea
                                ref={inputRef}
                                className="chat-input"
                                placeholder="Ask me anything..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                                disabled={isLoading}
                            />
                            <div className="input-actions">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    style={{ display: 'none' }}
                                    accept=".txt,.pdf,.doc,.docx,.md,.js,.ts,.py,.json"
                                />
                                <button
                                    className="action-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isLoading || !currentConversationId}
                                    title="Upload file"
                                >
                                    📎
                                </button>
                                <button
                                    className="action-btn send"
                                    onClick={sendMessage}
                                    disabled={!input.trim() || isLoading}
                                >
                                    {isLoading ? '⏳' : '➤'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
