import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { env } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: env.GITHUB_ID,
      clientSecret: env.GITHUB_SECRET,
      authorization: {
        params: {
          scope: "repo user read:user user:email delete_repo",
          prompt: "select_account",
        },
      },
    }),
  ],
  secret: env.AUTH_SECRET,
  trustHost: true,
  cookies: {
    sessionToken: {
      name: `${env.NODE_ENV === "production" ? "__Secure-" : ""}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.login = (profile as { login?: string })?.login;
        token.csrfToken = crypto.randomUUID();
      }
      if (!token.login && profile) {
        token.login = (profile as { login?: string })?.login;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).login = token.login;
      (session as any).csrfToken = token.csrfToken;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
