import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/session";

type SchoolSubscription = {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<() => void>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

const schoolSubscriptions = new Map<string, SchoolSubscription>();
let schoolChannelSequence = 0;

/**
 * Share one fully-configured channel per school. A new hook only adds a local
 * listener; it never adds a postgres callback to an already-subscribed channel.
 */
function subscribeToSchool(schoolId: string, listener: () => void) {
  let entry = schoolSubscriptions.get(schoolId);

  if (!entry) {
    schoolChannelSequence += 1;
    const listeners = new Set<() => void>();
    const channel = supabase.channel(
      `school-identity-${schoolId}-${Date.now()}-${schoolChannelSequence}`,
    );

    entry = { channel, listeners, cleanupTimer: null };
    schoolSubscriptions.set(schoolId, entry);

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schools", filter: `id=eq.${schoolId}` },
        () => {
          for (const notify of listeners) notify();
        },
      )
      .subscribe();
  }

  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }
  entry.listeners.add(listener);

  return () => {
    const current = schoolSubscriptions.get(schoolId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;

    // Delay disposal by one task so React Strict Mode's effect replay can
    // reacquire the existing subscription without racing removeChannel().
    current.cleanupTimer = setTimeout(() => {
      const latest = schoolSubscriptions.get(schoolId);
      if (latest !== current || latest.listeners.size > 0) return;
      schoolSubscriptions.delete(schoolId);
      void supabase.removeChannel(latest.channel);
    }, 0);
  };
}

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToSchool(id, () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void qc.invalidateQueries({ queryKey: ["school-identity", id] });
      }, 1500);
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      unsubscribe();
    };
  }, [id, qc]);

  return useQuery({
    queryKey: ["school-identity", id],
    enabled: Boolean(id),
    staleTime: 10 * 60_000,
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
        name: (data.name as string) || "School",
        schoolCode: (data.school_code as string) || "",
        logoUrl: (data.logo_url as string | null) ?? null,
        status: (data.status as string) || "active",
      };
    },
  });
}

/** Validate logo file type and size. Returns an error message or null if OK. */
export function validateLogoFile(file: File): string | null {
  const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!ok.includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    return "Use a PNG, JPG, or WebP image.";
  }
  if (file.size > 2_500_000) return "Logo must be under 2.5 MB.";
  return null;
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 512;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/png");
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
