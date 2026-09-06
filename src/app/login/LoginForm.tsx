"use client";

import { useState, useTransition } from "react";
import { sendMagicLink } from "./actions";

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL || "la famille";

type Status = "idle" | "sent" | "not-allowed" | "invalid-email" | "send-failed" | "check-failed";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await sendMagicLink(email);
      if (result.ok) {
        setStatus("sent");
      } else {
        setStatus(result.error);
      }
    });
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-900">
        <p className="font-medium">Vérifiez vos emails</p>
        <p className="mt-1 text-sm">
          Nous avons envoyé un lien de connexion à <span className="font-medium">{email}</span>.
          Ouvrez-le sur cet appareil pour continuer.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
          Adresse email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setStatus("idle");
          }}
          placeholder="vous@exemple.com"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {status === "not-allowed" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          Cet email n&apos;est pas sur la liste. Si vous devriez y avoir accès, contactez {CONTACT_EMAIL}.
        </p>
      )}
      {status === "invalid-email" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          Cette adresse email ne semble pas valide.
        </p>
      )}
      {status === "send-failed" && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900" role="alert">
          Une erreur est survenue lors de l&apos;envoi du lien. Merci de réessayer.
        </p>
      )}
      {status === "check-failed" && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900" role="alert">
          Une erreur est survenue lors de la vérification. Merci de réessayer dans un instant.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !email}
        className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-base font-medium text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Envoi…" : "Envoyer le lien de connexion"}
      </button>
    </form>
  );
}
