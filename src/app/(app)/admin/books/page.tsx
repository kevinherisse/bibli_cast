import { requireRole } from "@/lib/auth";
import AdminBooksClient from "./AdminBooksClient";

export default async function AdminBooksPage() {
  await requireRole(["admin"]);
  return <AdminBooksClient />;
}
