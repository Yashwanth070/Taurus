import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, Conversation } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
    try {
        const db = await getDb();

        const result = db.exec(`
      SELECT id, title, created_at, updated_at 
      FROM conversations 
      ORDER BY updated_at DESC
    `);

        const conversations: Conversation[] = result[0]?.values.map((row: any[]) => ({
            id: row[0],
            title: row[1],
            created_at: row[2],
            updated_at: row[3],
        })) || [];

        return NextResponse.json({ conversations });
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return NextResponse.json(
            { error: 'Failed to fetch conversations' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const { title } = await req.json();

        const db = await getDb();
        const id = uuidv4();

        db.run(
            `INSERT INTO conversations (id, title) VALUES (?, ?)`,
            [id, title || 'New Conversation']
        );

        saveDb();

        return NextResponse.json({
            id,
            title: title || 'New Conversation',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error creating conversation:', error);
        return NextResponse.json(
            { error: 'Failed to create conversation' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Conversation ID is required' },
                { status: 400 }
            );
        }

        const db = await getDb();

        // Delete messages first (foreign key)
        db.run(`DELETE FROM messages WHERE conversation_id = ?`, [id]);
        db.run(`DELETE FROM memories WHERE conversation_id = ?`, [id]);
        db.run(`DELETE FROM files WHERE conversation_id = ?`, [id]);
        db.run(`DELETE FROM conversations WHERE id = ?`, [id]);

        saveDb();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting conversation:', error);
        return NextResponse.json(
            { error: 'Failed to delete conversation' },
            { status: 500 }
        );
    }
}
