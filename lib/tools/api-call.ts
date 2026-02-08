export interface ApiCallResult {
    success: boolean;
    status?: number;
    headers?: Record<string, string>;
    data?: any;
    error?: string;
}

export async function makeApiCall(
    url: string,
    method: string = 'GET',
    headers?: Record<string, string>,
    body?: any
): Promise<ApiCallResult> {
    try {
        const parsedUrl = new URL(url);

        // Prevent calls to localhost/internal networks in production
        const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
        if (blockedHosts.includes(parsedUrl.hostname)) {
            return {
                success: false,
                error: 'Calls to localhost are not allowed for security reasons',
            };
        }

        const fetchOptions: RequestInit = {
            method: method.toUpperCase(),
            headers: {
                'User-Agent': 'AIAgent/1.0',
                'Accept': 'application/json, text/plain, */*',
                ...headers,
            },
        };

        if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            if (!headers?.['Content-Type']) {
                (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
            }
        }

        const response = await fetch(url, fetchOptions);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        const contentType = response.headers.get('content-type') || '';
        let data: any;

        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
            // Limit text response size
            if (typeof data === 'string' && data.length > 10000) {
                data = data.slice(0, 10000) + '\n... (truncated)';
            }
        }

        return {
            success: response.ok,
            status: response.status,
            headers: responseHeaders,
            data,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

export const apiCallTool = {
    name: 'api_call',
    description: 'Make an HTTP request to an external API. Supports GET, POST, PUT, PATCH, DELETE methods.',
    input_schema: {
        type: 'object' as const,
        properties: {
            url: {
                type: 'string',
                description: 'The full URL to make the request to',
            },
            method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                description: 'The HTTP method to use (default: GET)',
            },
            headers: {
                type: 'object',
                description: 'Optional headers to include in the request',
            },
            body: {
                type: 'object',
                description: 'Optional request body for POST/PUT/PATCH requests',
            },
        },
        required: ['url'],
    },
};
