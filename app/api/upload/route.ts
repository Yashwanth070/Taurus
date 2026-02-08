import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { processFile } from '@/lib/tools/file-process';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const conversationId = formData.get('conversationId') as string;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        if (!conversationId) {
            return NextResponse.json(
                { error: 'Conversation ID is required' },
                { status: 400 }
            );
        }

        // Read file as buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        // Process the file
        const result = await processFile(buffer, file.name, file.type);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: 400 }
            );
        }

        // Store file in database
        const db = await getDb();
        const fileId = uuidv4();

        db.run(
            `INSERT INTO files (id, conversation_id, filename, mimetype, content) 
       VALUES (?, ?, ?, ?, ?)`,
            [fileId, conversationId, file.name, file.type, result.content]
        );

        saveDb();

        return NextResponse.json({
            id: fileId,
            filename: file.name,
            mimetype: file.type,
            size: buffer.length,
            metadata: result.metadata,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Upload failed' },
            { status: 500 }
        );
    }
}
