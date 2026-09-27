import { NextResponse } from "next/server";
import { auth, isAdminEmail } from "@/auth";

/**
 * Admin gating via the next-auth (Auth.js) session.
 * - /admin/dashboard/* pages: the client layout also guards, but we redirect
 *   early here for non-admins.
 * - /api/admin/* routes (except auth helpers): require an admin session.
 *
 * The visitor sign-in (Google/GitHub) is the SAME one the guestbook uses;
 * only allowlisted emails (see auth.ts ADMIN_EMAILS) are treated as admins.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const email = req.auth?.user?.email;
  const admin = isAdminEmail(email);

  const isAdminPage = pathname.startsWith("/admin/dashboard");
  const isAdminApi =
    pathname.startsWith("/api/admin/") &&
    !pathname.startsWith("/api/admin/login") &&
    !pathname.startsWith("/api/admin/logout") &&
    !pathname.startsWith("/api/admin/me");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (!admin) {
    if (isAdminPage) {
      // Bounce non-admins to the public dashboard (which offers sign-in).
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/dashboard/:path*", "/api/admin/:path*"],
};
