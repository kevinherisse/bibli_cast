"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBookData } from "@/lib/useBookData";
import type { AllowedUser, Role } from "@/lib/types";

const ROLES: Role[] = ["viewer", "scanner", "admin"];
const ROLE_LABELS: Record<Role, string> = {
  viewer: "Lecteur",
  scanner: "Scanneur",
  admin: "Admin",
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");
  const [adding, setAdding] = useState(false);

  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const { books, claims } = useBookData();

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("allowed_users")
      .select("*")
      .order("invited_at", { ascending: false });
    if (error) setError(error.message);
    else setUsers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // Initial fetch from Supabase (an external system) on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const claimsByEmail = useMemo(() => {
    const map = new Map<string, { title: string; note: string | null }[]>();
    for (const claim of claims) {
      const book = books.find((b) => b.id === claim.book_id);
      if (!book) continue;
      const list = map.get(claim.user_email) ?? [];
      list.push({ title: book.title, note: claim.note });
      map.set(claim.user_email, list);
    }
    return map;
  }, [claims, books]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("allowed_users").insert({ email, role: newRole });
    setAdding(false);
    if (error) {
      setError(error.message.includes("duplicate") ? "Cet email est déjà sur la liste." : error.message);
      return;
    }
    setNewEmail("");
    setNewRole("viewer");
    load();
  }

  async function handleRoleChange(email: string, role: Role) {
    const supabase = createClient();
    setUsers((prev) => prev.map((u) => (u.email === email ? { ...u, role } : u)));
    const { error } = await supabase.from("allowed_users").update({ role }).eq("email", email);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function handleRemove(email: string) {
    if (!confirm(`Retirer ${email} de la liste ?`)) return;
    const supabase = createClient();
    setUsers((prev) => prev.filter((u) => u.email !== email));
    const { error } = await supabase.from("allowed_users").delete().eq("email", email);
    if (error) {
      setError(error.message);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Gérer les utilisateurs</h1>
        <p className="text-sm text-gray-600">Contrôlez qui peut se connecter et ce que chacun peut faire.</p>
      </div>

      <form
        onSubmit={handleAdd}
        className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email@exemple.com"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-50"
          >
            {adding ? "Ajout…" : "Ajouter"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-120 text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Invité le</th>
                <th className="px-4 py-3">Réservations</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const userClaims = claimsByEmail.get(u.email) ?? [];
                const isExpanded = expandedEmail === u.email;
                return (
                  <Fragment key={u.email}>
                    <tr className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.email, e.target.value as Role)}
                          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {new Date(u.invited_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedEmail(isExpanded ? null : u.email)}
                          disabled={userClaims.length === 0}
                          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 disabled:opacity-50"
                        >
                          {userClaims.length} {isExpanded ? "▲" : "▼"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemove(u.email)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Retirer
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={5} className="px-4 py-3">
                          {userClaims.length === 0 ? (
                            <p className="text-xs text-gray-500">Aucune réservation.</p>
                          ) : (
                            <ul className="space-y-1">
                              {userClaims.map((c, i) => (
                                <li key={i} className="text-xs text-gray-700">
                                  <span className="font-medium">{c.title}</span>
                                  {c.note && (
                                    <span className="text-gray-500"> — « {c.note} »</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Aucun utilisateur pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
