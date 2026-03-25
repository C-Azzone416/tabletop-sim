export { auth as proxy } from "./auth";

export const config = {
  // Protect game routes — require sign-in
  matcher: ["/game/:path*"],
};
