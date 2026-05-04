"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, X, Loader2, FileText, Camera } from "lucide-react";
import type { Company } from "@/lib/companies";

type FileStatus =
  | { state: "queued" }
  | { state: "uploading" }
  | { state: "ocr" }
  | { state: "done"; invoice_id: string; confidence?: number }
  | { state: "error"; message: string };

interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
}

export default function UploadButton({
  companies,
}: {
  companies: Company[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Globale window-level drag detector zodat de hele pagina als drop-
  // target voelt; we toggelen alleen visuele state. Eigenlijke drop
  // handler zit op het zone-element zelf zodat we niet per ongeluk
  // alle browser-drops opvangen (bv. drag van browser tab).
  useEffect(() => {
    let counter = 0;
    function hasFiles(e: DragEvent): boolean {
      return Array.from(e.dataTransfer?.types || []).includes("Files");
    }
    function onEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      counter++;
      setDragOver(true);
    }
    function onLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      counter--;
      if (counter <= 0) {
        counter = 0;
        setDragOver(false);
      }
    }
    function onDrop() {
      counter = 0;
      setDragOver(false);
    }
    function onOver(e: DragEvent) {
      if (hasFiles(e)) e.preventDefault();
    }
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onOver);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onOver);
    };
  }, []);

  function updateItem(id: string, status: FileStatus) {
    setQueue((q) =>
      q.map((i) => (i.id === id ? { ...i, status } : i)),
    );
  }

  async function uploadOne(item: QueueItem) {
    updateItem(item.id, { state: "uploading" });
    try {
      const fd = new FormData();
      fd.append("pdf", item.file);
      fd.append("company_id", companyId);
      // Tussenstap "ocr" pakken we visueel — server doet upload+ocr
      // in één call, dus we togglen kort naar 'ocr' voor de UI.
      const t = setTimeout(() => {
        updateItem(item.id, { state: "ocr" });
      }, 1500);
      const r = await fetch("/api/purchase/upload", {
        method: "POST",
        body: fd,
      });
      clearTimeout(t);
      const d = await r.json();
      if (!r.ok) {
        updateItem(item.id, {
          state: "error",
          message: d.error || "Upload mislukt",
        });
        return;
      }
      updateItem(item.id, {
        state: "done",
        invoice_id: d.invoice.id,
        confidence: d.ocr?.confidence,
      });
    } catch {
      updateItem(item.id, {
        state: "error",
        message: "Verbindingsfout",
      });
    }
  }

  async function startQueue(initial: QueueItem[]) {
    setBusy(true);
    // Sequentieel — Claude Vision heeft rate limits, en parallelle
    // PDF-processing (@react-pdf/renderer) jaagt het container-geheugen
    // omhoog. 5-15s per file is acceptabel.
    for (const item of initial) {
      await uploadOne(item);
    }
    setBusy(false);
    router.refresh();
  }

  function onFilesSelected(files: FileList) {
    if (!companyId) return;
    const valid: QueueItem[] = [];
    const accepted = new Set([
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    for (const file of Array.from(files)) {
      if (!accepted.has(file.type)) {
        if (file.type === "image/heic" || file.type === "image/heif") {
          valid.push({
            id: `${Date.now()}-${file.name}-heic`,
            file,
            status: {
              state: "error",
              message:
                "HEIC niet ondersteund — zet iPhone Camera op 'Meest compatibel'",
            },
          });
        }
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        valid.push({
          id: `${Date.now()}-${file.name}`,
          file,
          status: {
            state: "error",
            message: "Te groot (max 15 MB)",
          },
        });
        continue;
      }
      valid.push({
        id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        status: { state: "queued" },
      });
    }
    if (valid.length === 0) return;
    setQueue((q) => [...q, ...valid]);
    void startQueue(valid.filter((v) => v.status.state === "queued"));
  }

  function clearDone() {
    setQueue((q) => q.filter((i) => i.status.state !== "done"));
  }

  const doneCount = queue.filter((i) => i.status.state === "done").length;
  const errorCount = queue.filter((i) => i.status.state === "error").length;
  const inProgress = queue.some(
    (i) =>
      i.status.state === "uploading" ||
      i.status.state === "ocr" ||
      i.status.state === "queued",
  );

  return (
    <div className="space-y-3">
      <div
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) onFilesSelected(e.dataTransfer.files);
        }}
        onDragOver={(e) => e.preventDefault()}
        className={`relative rounded-xl border-2 border-dashed transition-colors ${
          dragOver
            ? "border-emerald-500 bg-emerald-500/5"
            : "border-[var(--border)] hover:border-zinc-600"
        }`}
      >
        <div className="px-4 py-5 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
            <FileText className="w-4 h-4" />
            <span>
              Sleep PDFs of foto&apos;s hierheen, klik om te selecteren,
              of tik op{" "}
              <Camera className="w-3.5 h-3.5 inline" /> om met de camera
              te scannen
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              ref={ref}
              type="file"
              accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onFilesSelected(e.target.files);
                if (ref.current) ref.current.value = "";
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onFilesSelected(e.target.files);
                if (cameraRef.current) cameraRef.current.value = "";
              }}
            />
            <button
              onClick={() => ref.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
            >
              <Upload className="w-4 h-4" />
              {busy
                ? `Verwerken (${doneCount + errorCount}/${queue.length})...`
                : "Selecteer bestanden"}
            </button>
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg disabled:opacity-40"
              title="Open camera om bonnetje/factuur te scannen"
            >
              <Camera className="w-4 h-4" />
              Scan
            </button>
            {queue.length > 0 && !inProgress && (
              <button
                onClick={clearDone}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Lijst leegmaken
              </button>
            )}
          </div>
          <p className="text-[11px] text-zinc-600">
            PDF, JPG, PNG, WEBP · max 15 MB · sequentieel verwerkt
            (~3-15s per file via Claude Vision). iPhone? Zet Camera op
            &apos;Meest compatibel&apos; in Instellingen voor JPG ipv HEIC
          </p>
        </div>
        {dragOver && (
          <div className="absolute inset-0 rounded-xl bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center pointer-events-none">
            <div className="text-emerald-300 font-semibold text-base inline-flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Laat los om te uploaden naar {" "}
              {companies.find((c) => c.id === companyId)?.name}
            </div>
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] max-h-80 overflow-y-auto">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="text-zinc-200 truncate">{item.file.name}</p>
                <p className="text-[10px] text-zinc-500">
                  {(item.file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  switch (status.state) {
    case "queued":
      return <span className="text-xs text-zinc-500">In wachtrij</span>;
    case "uploading":
      return (
        <span className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Uploaden
        </span>
      );
    case "ocr":
      return (
        <span className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          OCR scant…
        </span>
      );
    case "done":
      return (
        <a
          href={`/purchase/${status.invoice_id}`}
          className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1.5"
        >
          <Check className="w-3 h-3" />
          Klaar
          {status.confidence !== undefined && (
            <span className="text-zinc-500">
              · {Math.round(status.confidence * 100)}%
            </span>
          )}
        </a>
      );
    case "error":
      return (
        <span
          className="text-xs text-red-400 inline-flex items-center gap-1.5"
          title={status.message}
        >
          <X className="w-3 h-3" />
          Mislukt
        </span>
      );
  }
}
