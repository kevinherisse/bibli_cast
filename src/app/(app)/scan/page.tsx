import { requireRole } from "@/lib/auth";
import ScanClient from "./ScanClient";

export default async function ScanPage() {
  await requireRole(["scanner", "admin"]);
  return <ScanClient />;
}
