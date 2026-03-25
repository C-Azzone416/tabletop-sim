import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Player Name",
      credentials: {
        name: { label: "Name", type: "text", placeholder: "Enter your name" },
      },
      async authorize(credentials) {
        const name =
          typeof credentials?.name === "string"
            ? credentials.name.trim()
            : null;
        if (!name || name.length === 0 || name.length > 20) {
          return null;
        }
        // Find or create a stable profile via the server
        let res: Response;
        try {
          res = await fetch(`${SERVER_URL}/profiles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
        } catch {
          return null;
        }
        if (!res.ok) {
          return null;
        }
        const { profile } = await res.json();
        return {
          id: profile.id,
          name: profile.name,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
});
