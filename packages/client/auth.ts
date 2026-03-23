import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

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
        // V1: name-only auth — generate a deterministic ID from the name
        // This will be replaced with DB-backed profiles in a future phase
        return {
          id: crypto.randomUUID(),
          name,
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
