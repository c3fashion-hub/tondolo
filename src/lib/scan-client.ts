"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import type { ContractResult, ScanResult } from "@/lib/reading.ts";

// Uploading a document privately and asking the server to read it. Photos are shrunk on the phone
// first: smaller uploads, and well inside what the AI can read (5 MB per image).

export const MAX_FILES = 10;
const MAX_PDF = 15_000_000;
const MAX_SIDE = 2400;
const SHRINK_OVER = 1_500_000;

export type Mode = "scan" | "contract";
export type ReadOk = { ok: true; documentId: string; fileName: string; mode: Mode; result: ScanResult | ContractResult; readsLeft: number | null };
export type ReadFail = { ok: false; documentId: string | null; fileName: string; error: string };

export function safeName(name: string): string {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "document").slice(-120);
}

async function shrink(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  const keep = { blob: file as Blob, type: file.type, name: file.name };
  const convertible = file.type === "image/heic" || file.type === "image/heif";
  if (!convertible && file.size <= SHRINK_OVER) return keep;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) return keep;
  return { blob, type: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
}

// One document: upload it, record it, then read it. Returns what was read, or why not.
export async function uploadAndRead(weddingId: string, file: File, mode: Mode): Promise<ReadOk | ReadFail> {
  const supabase = supabaseBrowser();
  const fail = (error: string, documentId: string | null = null): ReadFail => ({ ok: false, documentId, fileName: file.name, error });
  const isPdf = file.type === "application/pdf";
  if (!isPdf && !file.type.startsWith("image/")) return fail("unreadable");
  if (isPdf && file.size > MAX_PDF) return fail("too_big");

  let prepared: { blob: Blob; type: string; name: string };
  try { prepared = isPdf ? { blob: file, type: file.type, name: file.name } : await shrink(file); }
  catch { return fail("unreadable"); }
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(prepared.type)) return fail("unreadable");

  const documentId = crypto.randomUUID();
  const path = `${weddingId}/${documentId}/${safeName(prepared.name)}`;
  const up = await supabase.storage.from("documents").upload(path, prepared.blob, { contentType: prepared.type, upsert: false });
  if (up.error) return fail("network");
  const row = await supabase.from("documents").insert({
    id: documentId, wedding_id: weddingId, file_path: path, file_name: prepared.name.slice(0, 140), mime: prepared.type,
    size_bytes: prepared.blob.size, kind: mode === "contract" ? "contract" : null,
  });
  if (row.error) { await supabase.storage.from("documents").remove([path]); return fail("network"); }

  const { data, error } = await supabase.functions.invoke("read-document", { body: { document_id: documentId, mode } });
  if (error) {
    let code = "network";
    if (error instanceof FunctionsHttpError) {
      try { code = (await error.context.json()).error ?? "busy"; } catch { code = "busy"; }
    }
    return fail(code, documentId);
  }
  return { ok: true, documentId, fileName: prepared.name, mode, result: data.result, readsLeft: data.reads_left ?? null };
}

// Reads several documents, three at a time, reporting each as it finishes.
export async function readAll(weddingId: string, files: File[], mode: Mode, onEach: (i: number, r: ReadOk | ReadFail) => void) {
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      onEach(i, await uploadAndRead(weddingId, files[i], mode));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

// Throws away a document the couple decided not to keep. Its file is deleted by the hourly purge.
export async function discardDocument(documentId: string) {
  await supabaseBrowser().from("documents").delete().eq("id", documentId);
}

export async function openDocument(path: string) {
  const { data } = await supabaseBrowser().storage.from("documents").createSignedUrl(path, 300);
  if (!data?.signedUrl) return;
  // Phones can block a new tab opened after a wait; open it here instead if so.
  if (!window.open(data.signedUrl, "_blank", "noopener")) window.location.assign(data.signedUrl);
}
