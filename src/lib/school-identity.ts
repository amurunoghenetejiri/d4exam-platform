import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";

export type SchoolIdentity = {
  id: string;
  name: string;
  schoolCode: string;
  logoUrl: string | null;
  status: string;
};

/** Load school identity by id (or session school). */
export function useSchoolIdentity(schoolId?: string | null) {
  const { data: session } = useSessionUser();
  const qc = useQueryClient();
  const id = schoolId ?? session?.schoolId ?? null;

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`school-identity-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schools", filter: `id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["school-identity", id] });
          void qc.invalidateQueries({ queryKey: ["session-user"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  return useQuery({
    queryKey: ["school-identity", id],
    enabled: Boolean(id),
    staleTime: 15_000,
    queryFn: async (): Promise<SchoolIdentity | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, school_code, logo_url, status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        name: data.name as string,
        schoolCode: data.school_code as string,
        logoUrl: (data.logo_url as string | null) || null,
        status: data.status as string,
      };
    },
  });
}

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export function validateLogoFile(file: File): string | null {
  const type = (file.type || "").toLowerCase();
  // Some browsers omit type — fall back to extension
  const name = file.name.toLowerCase();
  const okType =
    ALLOWED.includes(type) ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp");
  if (!okType) return "Logo must be PNG, JPG or WebP.";
  if (file.size > MAX_BYTES) return "Logo must be 2MB or smaller.";
  return null;
}

/** Compress image to a data URL (max ~512px, JPEG ~0.82) for DB storage fallback. */
export async function fileToCompressedDataUrl(file: File, maxSide = 512): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // Prefer PNG for logos with transparency; JPEG for photos
  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  return isPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Upload school logo. Tries Storage buckets first; falls back to compressed data URL
 * so branding works even without a configured bucket.
 */
export async function uploadSchoolLogo(opts: {
  file: File;
  folder: string;
}): Promise<{ url: string; path: string }> {
  const err = validateLogoFile(opts.file);
  if (err) throw new Error(err);

  const ext =
    opts.file.type === "image/webp" || opts.file.name.toLowerCase().endsWith(".webp")
      ? "webp"
      : opts.file.type === "image/png" || opts.file.name.toLowerCase().endsWith(".png")
        ? "png"
        : "jpg";
  const path = `${opts.folder}/logo-${Date.now()}.${ext}`;

  const buckets = ["school-logos", "public", "avatars"];
  for (const bucket of buckets) {
    try {
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, opts.file, {
        cacheControl: "3600",
        upsert: true,
        contentType: opts.file.type || `image/${ext}`,
      });
      if (upErr) continue;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      if (data?.publicUrl) return { url: data.publicUrl, path: `${bucket}/${path}` };
    } catch {
      // try next bucket
    }
  }

  // Fallback: store compressed data URL in schools.logo_url (no storage required)
  const dataUrl = await fileToCompressedDataUrl(opts.file);
  if (dataUrl.length > 900_000) {
    throw new Error("Logo is still too large after compression. Use a smaller image.");
  }
  return { url: dataUrl, path: "data-url" };
}

/** Persist logo_url on schools row (RLS: can_manage_school). */
export async function updateSchoolLogoUrl(schoolId: string, logoUrl: string) {
  const { error } = await supabase
    .from("schools")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() } as never)
    .eq("id", schoolId);
  if (error) throw new Error(error.message || "Could not save logo to school record");
}

/** Update school display name (RLS: can_manage_school). */
export async function updateSchoolName(schoolId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("School name must be at least 2 characters.");
  if (trimmed.length > 200) throw new Error("School name is too long.");
  const { error } = await supabase
    .from("schools")
    .update({ name: trimmed, updated_at: new Date().toISOString() } as never)
    .eq("id", schoolId);
  if (error) throw new Error(error.message || "Could not update school name");
}
