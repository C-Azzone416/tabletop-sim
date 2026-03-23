export { auth as middleware } from "./auth";

export const config = {
  // Protect home and game routes — require sign-in
  matcher: ["/", "/game/:path*"],
};
