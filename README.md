# Taurus ♉

A powerful, full-featured AI chatbot powered by **Anthropic Claude** with advanced capabilities including web browsing, file processing, database storage, and persistent memory.

![Taurus](https://img.shields.io/badge/Powered%20by-Claude-blueviolet)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## ✨ Features

- **🔐 User Authentication** - Secure signup/login with session management
- **🌐 Web Browsing** - Fetch and analyze content from any website
- **📄 File Processing** - Upload and analyze PDFs, Word docs, text files, and code
- **💾 Data Storage** - Persistent SQLite database for storing information
- **🔗 API Integrations** - Make HTTP requests to external APIs
- **🧠 Memory System** - Remember facts and preferences across conversations
- **💬 Real-time Streaming** - See responses as they're generated
- **🎨 Modern UI** - Beautiful dark theme with glassmorphism effects

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Then add your keys:

```
ANTHROPIC_API_KEY=your_api_key_here
NEXTAUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000
```

> Get your Anthropic API key from [Anthropic Console](https://console.anthropic.com/)
> Generate a secret with: `openssl rand -base64 32`

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🚀 Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Add environment variables in Vercel dashboard:
   - `ANTHROPIC_API_KEY` - Your Anthropic API key
   - `NEXTAUTH_SECRET` - A random secret string
   - `NEXTAUTH_URL` - Your Vercel domain (e.g., `https://your-app.vercel.app`)
4. Deploy!

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| LLM | Anthropic Claude (claude-sonnet-4-20250514) |
| Database | SQLite (sql.js) |
| Web Scraping | Cheerio |
| File Processing | pdf-parse, mammoth |
| Styling | CSS (Custom dark theme) |

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # Chat endpoint with streaming
│   │   ├── conversations/       # Conversation management
│   │   └── upload/route.ts      # File upload handling
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Home page
├── components/
│   └── Chat.tsx                 # Main chat interface
├── lib/
│   ├── tools/
│   │   ├── api-call.ts          # External API calls
│   │   ├── database.ts          # Data storage
│   │   ├── file-process.ts      # File processing
│   │   ├── index.ts             # Tool registry
│   │   └── web-browse.ts        # Web browsing
│   ├── claude.ts                # Claude AI integration
│   ├── db.ts                    # SQLite database
│   └── memory.ts                # Memory management
├── data/                        # SQLite database files (auto-created)
└── .env.local                   # Environment variables
```

## 💡 Usage Examples

### Web Browsing
> "What's on the homepage of news.ycombinator.com?"

### File Analysis
Upload a PDF and ask: "Summarize this document"

### Memory
> "My name is Alex and I like TypeScript"
> (later) "What's my name and favorite language?"

### API Calls
> "Get the current weather data from api.open-meteo.com for New York"

## 🔒 Security Notes

- API keys are stored in `.env.local` (never committed to git)
- External API calls block localhost/internal networks
- Database operations are scoped to safe tables
- File uploads are processed server-side

## 📝 License

MIT
