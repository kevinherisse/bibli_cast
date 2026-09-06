import { requireUser } from "@/lib/auth";
import MyClaimsClient from "./MyClaimsClient";

export default async function MyClaimsPage() {
  const user = await requireUser();
  return <MyClaimsClient myEmail={user.email} />;
}
