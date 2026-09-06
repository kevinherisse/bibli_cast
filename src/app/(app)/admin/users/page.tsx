import { requireRole } from "@/lib/auth";
import AdminUsersClient from "./AdminUsersClient";

export default async function AdminUsersPage() {
  await requireRole(["admin"]);
  return <AdminUsersClient />;
}
