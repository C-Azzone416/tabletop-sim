export { auth as middleware } from "./auth";

export const config = {
  // Protect game routes — require sign-in
  matcher: ["/game/:path*"],
};
