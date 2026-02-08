import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare, hash } from 'bcryptjs';
import { getDb, saveDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// Ensure users table exists
async function ensureUsersTable() {
    const db = await getDb();
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    saveDb();
}

export const authOptions = {
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
                name: { label: 'Name', type: 'text' },
                isSignUp: { label: 'Sign Up', type: 'text' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Email and password are required');
                }

                await ensureUsersTable();
                const db = await getDb();

                // Check if signing up
                if (credentials.isSignUp === 'true') {
                    // Check if user exists
                    const existing = db.exec(
                        `SELECT id FROM users WHERE email = ?`,
                        [credentials.email]
                    );

                    if (existing[0]?.values.length > 0) {
                        throw new Error('User already exists');
                    }

                    // Create new user
                    const id = uuidv4();
                    const hashedPassword = await hash(credentials.password, 12);

                    db.run(
                        `INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)`,
                        [id, credentials.email, hashedPassword, credentials.name || 'User']
                    );
                    saveDb();

                    return {
                        id,
                        email: credentials.email,
                        name: credentials.name || 'User',
                    };
                }

                // Login flow
                const result = db.exec(
                    `SELECT id, email, password, name FROM users WHERE email = ?`,
                    [credentials.email]
                );

                if (!result[0]?.values.length) {
                    throw new Error('No user found with this email');
                }

                const [id, email, passwordHash, name] = result[0].values[0] as [string, string, string, string];

                const isValid = await compare(credentials.password, passwordHash);

                if (!isValid) {
                    throw new Error('Invalid password');
                }

                return {
                    id,
                    email,
                    name,
                };
            },
        }),
    ],
    session: {
        strategy: 'jwt' as const,
    },
    pages: {
        signIn: '/auth/login',
    },
    callbacks: {
        async jwt({ token, user }: { token: any; user: any }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }: { session: any; token: any }) {
            if (session.user) {
                session.user.id = token.id;
            }
            return session;
        },
    },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
