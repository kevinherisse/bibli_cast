import { requireUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <NavBar user={user} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-4">{children}</div>
    </div>
  );
}
