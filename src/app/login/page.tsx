import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/gallery");

  const { reason } = await searchParams;
  const notice =
    reason === "not-allowed"
      ? "Votre accès a été retiré. Contactez la famille si vous pensez qu'il s'agit d'une erreur."
      : reason === "link-expired"
        ? "Ce lien de connexion a expiré ou a déjà été utilisé. Demandez-en un nouveau ci-dessous."
        : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">La bibliothèque de Laurent</h1>
          <p className="mt-2 text-sm text-gray-600">
            Connectez-vous avec votre email pour parcourir la collection et réserver un livre à
            garder.
          </p>
        </div>
        {notice && (
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>
        )}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
