import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { SERVER_URL, apiHeaders } from "./app/lib/serverApi";

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
            headers: apiHeaders({ "Content-Type": "application/json" }),
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
    // #182: `auth` used as middleware only populates req.auth WITHOUT this
    // callback — it doesn't actually gate anything. Required for the
    // /game/:path* matcher in middleware.ts to redirect unauthenticated
    // requests to `pages.signIn`.
    //
    // Dev-tools carve-out is narrow and mirrors page.tsx's own fallback
    // contract (`isDev ? resolvedSearch.profileId : undefined`): a request
    // only slips through unauthenticated if BOTH the build has dev tools on
    // (never true in prod — same NEXT_PUBLIC_ENABLE_DEV_TOOLS flag gating
    // every other dev affordance) AND it's carrying the dev seat's
    // `profileId` query param, i.e. it's actually the dev harness, not a
    // bare unauthenticated hit. This keeps the whole existing E2E suite
    // (which drives seats via that query param, not real sign-in) working
    // unchanged while still closing the real gap: a plain unauthenticated
    // `/game/:code` request — including the negative-path test below —
    // gets redirected regardless of the dev-tools build flag.
    authorized({ auth, request }) {
      if (auth?.user) return true;
      const devToolsOn = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
      return devToolsOn && request.nextUrl.searchParams.has("profileId");
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
});
