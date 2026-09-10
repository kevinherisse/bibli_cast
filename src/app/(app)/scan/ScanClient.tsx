"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { humanizeClaimError } from "@/lib/errors";

type Draft = {
  isbn: string | null;
  title: string;
  author: string;
  category: string;
  cover_url: string | null;
  thumbnail_url: string | null;
};

const EMPTY_DRAFT: Draft = {
  isbn: null,
  title: "",
  author: "",
  category: "",
  cover_url: null,
  thumbnail_url: null,
};

type Mode = "scanning" | "review" | "manual";

export default function ScanClient() {
  const [mode, setMode] = useState<Mode>("scanning");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  // html5-qrcode's internal camera-teardown sequence sometimes rejects with an
  // AbortError from a promise it never exposes to us (e.g. when navigating away
  // right after a scan), so our own stop()/catch() below can't catch it. It's
  // harmless — the camera still stops — but Next's dev overlay flags it as an
  // unhandled rejection, so we swallow just this one, scoped to this page.
  useEffect(() => {
    function ignoreAbortError(event: PromiseRejectionEvent) {
      if (event.reason?.name === "AbortError") event.preventDefault();
    }
    window.addEventListener("unhandledrejection", ignoreAbortError);
    return () => window.removeEventListener("unhandledrejection", ignoreAbortError);
  }, []);

  async function handleScanned(isbn: string) {
    setLookupError(null);
    setMode("review");
    setDraft({ ...EMPTY_DRAFT, isbn });
    setLookingUp(true);

    try {
      const res = await fetch(`/api/lookup-isbn?isbn=${encodeURIComponent(isbn)}`);
      if (!res.ok) {
        setLookupError(
          "Ce livre n'a été trouvé dans aucune base de données. Remplissez les détails manuellement ci-dessous.",
        );
        return;
      }
      const data = await res.json();
      setDraft({
        isbn: data.isbn,
        title: data.title ?? "",
        author: data.author ?? "",
        category: data.category ?? "",
        cover_url: data.cover_url ?? null,
        thumbnail_url: data.thumbnail_url ?? null,
      });
    } catch {
      setLookupError("La recherche a échoué. Remplissez les détails manuellement ci-dessous.");
    } finally {
      setLookingUp(false);
    }
  }

  useEffect(() => {
    if (mode !== "scanning") return;

    let cancelled = false;
    handledRef.current = false;

    (async () => {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (cancelled) return;

      const scanner = new Html5Qrcode("reader", {
        // ISBNs are only ever encoded as EAN-13 (the "Bookland" 978/979
        // prefix). EAN-8/UPC-A/UPC-E can't carry an ISBN at all, but a book's
        // back cover often has a second barcode nearby (a price add-on, a
        // distributor code, a library sticker) in one of those formats —
        // decoding that instead of the real ISBN barcode was producing a
        // valid-looking but wrong number, which is why lookups kept failing.
        formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13],
        // Use the browser's native (hardware-accelerated) barcode detector
        // where available — Chrome/Android supports it, so this is faster
        // there. Safari has no native BarcodeDetector, so this is a no-op on
        // every iPhone and falls back to the JS decoder below either way.
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 260, height: 150 },
            // A rear camera never produces a mirrored feed, so skip the
            // extra flipped-image decode pass — roughly halves the
            // per-frame CPU cost, which matters most on older devices.
            disableFlip: true,
            // Cap the capture resolution. Safari has no native
            // BarcodeDetector, so every frame goes through html5-qrcode's
            // bundled pure-JS ZXing port — there's no WASM or hardware
            // acceleration backing it on iOS. Its per-frame cost scales with
            // the number of pixels it has to scan, and that pixel count is
            // NOT the qrbox size on screen: html5-qrcode maps the qrbox
            // (defined in on-screen CSS pixels) up to the camera's native
            // resolution before decoding, so a higher capture resolution
            // directly multiplies the work done on every single frame. On
            // an older iPhone's weaker single-core JS performance, 1280x720
            // was still enough pixels per frame to make each decode take
            // long enough that the loop couldn't keep up with hand motion —
            // read as "slow" and "only partially scanned". 640x480 cuts
            // that per-frame pixel count (and so the decode time) by ~4x
            // while remaining far more resolution than an EAN-13 barcode
            // needs to resolve at normal scanning distance.
            // Note: when videoConstraints is set it REPLACES the camera
            // selector above entirely (doesn't merge with it), so facingMode
            // has to be repeated here or rear-camera selection silently breaks.
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          },
          (decodedText) => {
            if (handledRef.current) return;
            // Even restricted to EAN-13, a second non-ISBN barcode on the
            // cover (price add-on, distributor code) can still decode
            // successfully — only a Bookland-prefixed number is really an
            // ISBN, so reject anything else and keep scanning instead of
            // locking onto a wrong result.
            if (!/^(?:978|979)\d{10}$/.test(decodedText)) return;
            handledRef.current = true;
            handleScanned(decodedText);
          },
          () => {
            // per-frame decode failure — expected constantly while aiming, ignore
          },
        );
      } catch {
        if (!cancelled) setCameraError("Impossible d'accéder à la caméra. Vérifiez les autorisations.");
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [mode]);

  async function handleSave() {
    if (!draft.title.trim()) {
      setSaveError("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    setSaveError(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("upsert_scanned_book", {
      p_isbn: draft.isbn,
      p_title: draft.title.trim(),
      p_author: draft.author.trim() || null,
      p_cover_url: draft.cover_url,
      p_thumbnail_url: draft.thumbnail_url,
      p_category: draft.category.trim() || null,
    });

    setSaving(false);

    if (error) {
      setSaveError(humanizeClaimError(error.message));
      return;
    }

    setLastSaved(`« ${data.title} » enregistré (${data.total_copies} exemplaire${data.total_copies === 1 ? "" : "s"} au total)`);
    setDraft(EMPTY_DRAFT);
    setMode("scanning");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Scanner un livre</h1>
        <p className="text-sm text-gray-600">
          Pointez la caméra arrière vers le code-barres au dos du livre.
        </p>
      </div>

      {lastSaved && (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">{lastSaved}</p>
      )}

      {mode === "scanning" && (
        <div className="space-y-3">
          <div
            id="reader"
            className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-black"
          />
          {cameraError && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{cameraError}</p>
          )}
          <button
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setLookupError(null);
              setMode("manual");
            }}
            className="w-full rounded-xl border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 active:scale-[0.98]"
          >
            Saisir les détails manuellement
          </button>
        </div>
      )}

      {mode === "review" && lookingUp ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-10 shadow-sm">
          <div
            className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"
            role="status"
            aria-label="Recherche des détails du livre"
          />
          <p className="text-sm text-gray-500">Recherche des détails du livre…</p>
        </div>
      ) : (
        (mode === "review" || mode === "manual") && (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          {lookupError && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{lookupError}</p>
          )}

          {draft.thumbnail_url && (
            <div className="relative mx-auto h-40 w-28 overflow-hidden rounded-lg bg-gray-100">
              <Image
                src={draft.thumbnail_url}
                alt={draft.title}
                fill
                sizes="112px"
                unoptimized
                className="object-cover"
              />
            </div>
          )}

          <Field label="ISBN">
            <input
              value={draft.isbn ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, isbn: e.target.value || null }))}
              placeholder="Facultatif"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>
          <Field label="Titre *">
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>
          <Field label="Auteur">
            <input
              value={draft.author}
              onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>
          <Field label="Catégorie">
            <input
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setMode("scanning");
              }}
              className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 active:scale-[0.98]"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer le livre"}
            </button>
          </div>
        </div>
        )
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
