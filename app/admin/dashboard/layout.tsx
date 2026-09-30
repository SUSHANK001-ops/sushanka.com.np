"use client";

import "@mdxeditor/editor/style.css";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  LogOut,
  FileText,
  PlusCircle,
  LayoutDashboard,
  MessageSquare,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = Boolean(session?.user?.isAdmin);

  // Gate: only admin emails may see the panel. Everyone else is redirected.
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      // Not signed in → send to the visitor sign-in (same one the guestbook uses).
      signIn(undefined, { callbackUrl: pathname });
      return;
    }
    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [status, session, isAdmin, pathname, router]);

  if (status === "loading" || !session?.user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1A1A1A]">
        <div className="text-lg text-white/50">Checking access…</div>
      </div>
    );
  }

  const navItems = [
    { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { label: "All Blogs", href: "/admin/dashboard/blogs", icon: FileText },
    { label: "New Blog", href: "/admin/dashboard/blogs/new", icon: PlusCircle },
    { label: "Guestbook", href: "/admin/dashboard/guestbook", icon: MessageSquare },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-[#1A1A1A]">
      {/* Sidebar */}
      <aside className="relative md:fixed flex w-full md:h-full md:w-64 flex-col border-b md:border-b-0 md:border-r border-white/10 bg-white/[0.02] p-6">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white">Admin Panel</h2>
          <p className="mt-1 text-sm text-white/40">{session.user.name}</p>
        </div>

        <nav className="flex flex-wrap md:flex-col gap-2 flex-1 md:space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-[#00ff88]/10 text-[#00ff88]"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => signOut({ callbackUrl: "/dashboard" })}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/10"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </aside>

      {/* Main content */}
      <main className="md:ml-64 flex-1 p-4 md:p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
