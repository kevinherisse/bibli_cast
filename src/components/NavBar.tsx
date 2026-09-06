import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";

export default function NavBar({ user }: { user: CurrentUser }) {
  const links = [
    { href: "/gallery", label: "Galerie" },
    { href: "/my-claims", label: "Mes réservations" },
    ...(user.role === "scanner" || user.role === "admin"
      ? [{ href: "/scan", label: "Scanner" }]
      : []),
    ...(user.role === "admin"
      ? [
          { href: "/admin/books", label: "Gérer les livres" },
          { href: "/admin/users", label: "Gérer les utilisateurs" },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/gallery" className="text-base font-semibold text-gray-900">
          La bibliothèque de Laurent
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            Déconnexion
          </button>
        </form>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
