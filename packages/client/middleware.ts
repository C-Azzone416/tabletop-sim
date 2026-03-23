import { auth } from "./auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/signin", req.url);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

export const config = {
  // Protect home and game routes — require sign-in
  matcher: ["/", "/game/:path*"],
};
