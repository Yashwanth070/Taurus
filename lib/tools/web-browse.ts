import * as cheerio from 'cheerio';

export interface WebBrowseResult {
    success: boolean;
    url: string;
    title?: string;
    content?: string;
    error?: string;
}

export async function browseWeb(url: string): Promise<WebBrowseResult> {
    try {
        // Validate URL
        const parsedUrl = new URL(url);

        const response = await fetch(parsedUrl.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AIAgent/1.0; +https://example.com)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });

        if (!response.ok) {
            return {
                success: false,
                url,
                error: `HTTP ${response.status}: ${response.statusText}`,
            };
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const json = await response.json();
            return {
                success: true,
                url,
                title: 'JSON Response',
                content: JSON.stringify(json, null, 2),
            };
        }

        if (!contentType.includes('text/html')) {
            return {
                success: true,
                url,
                title: 'Non-HTML Content',
                content: `Content-Type: ${contentType}\n\nContent cannot be parsed as HTML.`,
            };
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove script and style elements
        $('script, style, nav, footer, header, aside, .nav, .footer, .header, .sidebar').remove();

        // Get page title
        const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

        // Extract main content
        let content = '';

        // Try to find main content area
        const mainSelectors = ['main', 'article', '.content', '.main', '#content', '#main', '.post', '.article'];
        let mainContent = null;

        for (const selector of mainSelectors) {
            const element = $(selector).first();
            if (element.length > 0) {
                mainContent = element;
                break;
            }
        }

        if (mainContent) {
            content = mainContent.text();
        } else {
            content = $('body').text();
        }

        // Clean up whitespace
        content = content
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim()
            .slice(0, 8000); // Limit content length

        return {
            success: true,
            url,
            title,
            content,
        };
    } catch (error) {
        return {
            success: false,
            url,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

export const webBrowseTool = {
    name: 'browse_web',
    description: 'Fetch and read the content of a web page. Use this to gather information from websites.',
    input_schema: {
        type: 'object' as const,
        properties: {
            url: {
                type: 'string',
                description: 'The URL of the web page to fetch',
            },
        },
        required: ['url'],
    },
};
