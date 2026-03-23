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
        const res = await fetch(`${SERVER_URL}/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
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
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
});
