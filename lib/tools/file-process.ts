export interface FileProcessResult {
    success: boolean;
    filename: string;
    content?: string;
    metadata?: {
        type: string;
        size: number;
        pages?: number;
    };
    error?: string;
}

export async function processFile(
    buffer: Buffer,
    filename: string,
    mimetype: string
): Promise<FileProcessResult> {
    try {
        const size = buffer.length;

        // Handle text files
        if (mimetype.startsWith('text/') || mimetype === 'application/json') {
            const content = buffer.toString('utf-8');
            return {
                success: true,
                filename,
                content: content.slice(0, 50000), // Limit content
                metadata: {
                    type: mimetype,
                    size,
                },
            };
        }

        // Handle PDF files
        if (mimetype === 'application/pdf') {
            try {
                const pdfParse = (await import('pdf-parse')).default;
                const data = await pdfParse(buffer);
                return {
                    success: true,
                    filename,
                    content: data.text.slice(0, 50000),
                    metadata: {
                        type: 'application/pdf',
                        size,
                        pages: data.numpages,
                    },
                };
            } catch (pdfError) {
                return {
                    success: false,
                    filename,
                    error: `Failed to parse PDF: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`,
                };
            }
        }

        // Handle Word documents
        if (
            mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimetype === 'application/msword'
        ) {
            try {
                const mammoth = await import('mammoth');
                const result = await mammoth.extractRawText({ buffer });
                return {
                    success: true,
                    filename,
                    content: result.value.slice(0, 50000),
                    metadata: {
                        type: mimetype,
                        size,
                    },
                };
            } catch (docError) {
                return {
                    success: false,
                    filename,
                    error: `Failed to parse document: ${docError instanceof Error ? docError.message : 'Unknown error'}`,
                };
            }
        }

        // Handle Markdown files
        if (filename.endsWith('.md') || mimetype === 'text/markdown') {
            const content = buffer.toString('utf-8');
            return {
                success: true,
                filename,
                content: content.slice(0, 50000),
                metadata: {
                    type: 'text/markdown',
                    size,
                },
            };
        }

        // Handle code files by extension
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.rb', '.php'];
        if (codeExtensions.some(ext => filename.endsWith(ext))) {
            const content = buffer.toString('utf-8');
            return {
                success: true,
                filename,
                content: content.slice(0, 50000),
                metadata: {
                    type: 'text/code',
                    size,
                },
            };
        }

        // Unknown file type
        return {
            success: false,
            filename,
            error: `Unsupported file type: ${mimetype}`,
        };
    } catch (error) {
        return {
            success: false,
            filename,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

export const fileProcessTool = {
    name: 'read_uploaded_file',
    description: 'Read the content of a previously uploaded file. The file must have been uploaded in this conversation.',
    input_schema: {
        type: 'object' as const,
        properties: {
            file_id: {
                type: 'string',
                description: 'The ID of the uploaded file to read',
            },
        },
        required: ['file_id'],
    },
};
