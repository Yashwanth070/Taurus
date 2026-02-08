declare module 'sql.js' {
    interface Database {
        run(sql: string, params?: any[]): void;
        exec(sql: string, params?: any[]): QueryExecResult[];
        export(): Uint8Array;
        getRowsModified(): number;
        close(): void;
    }

    interface QueryExecResult {
        columns: string[];
        values: any[][];
    }

    interface SqlJsStatic {
        Database: new (data?: ArrayLike<number>) => Database;
    }

    export interface SqlJsConfig {
        locateFile?: (filename: string) => string;
    }

    export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
    export { Database };
}

declare module 'pdf-parse' {
    interface PDFData {
        numpages: number;
        numrender: number;
        info: any;
        metadata: any;
        text: string;
        version: string;
    }

    function pdfParse(buffer: Buffer | ArrayBuffer): Promise<PDFData>;
    export default pdfParse;
}

declare module 'mammoth' {
    interface ExtractResult {
        value: string;
        messages: any[];
    }

    interface Options {
        buffer?: Buffer;
        path?: string;
    }

    export function extractRawText(options: Options): Promise<ExtractResult>;
    export function convertToHtml(options: Options): Promise<ExtractResult>;
}
