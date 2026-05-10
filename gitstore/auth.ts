import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: {
        params: {
          // Request repo + user scopes so we can create repos and read/write files
          scope: "repo user read:user user:email delete_repo",
          // Force account chooser on re-login so users can switch GitHub accounts cleanly.
          login: "",
          // Best-effort account selection prompt for providers that support OIDC-style prompt.
          prompt: "select_account",
        },
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist GitHub access token, login, and a per-session CSRF token on first sign-in
      if (account) {
        token.accessToken = account.access_token;
        token.login = (profile as { login?: string })?.login;
        // Generate a cryptographically random CSRF token bound to this session.
        // Never log or expose this value in error messages.
        token.csrfToken = crypto.randomUUID();
      }
      if (!token.login && profile) {
        token.login = (profile as { login?: string })?.login;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose accessToken, login, and csrfToken to the client session object
      (session as unknown as Record<string, unknown>).accessToken = token.accessToken;
      (session as unknown as Record<string, unknown>).login = token.login;
      (session as unknown as Record<string, unknown>).csrfToken = token.csrfToken;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
