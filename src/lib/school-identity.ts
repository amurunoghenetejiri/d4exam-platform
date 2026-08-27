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

function subscribeToSchool(schoolId: string, onChange: () => void) {
  let entry = schoolSubscriptions.get(schoolId);
  if (!entry) {
    const channel = supabase
      .channel(`school-identity-${schoolId}-${++schoolChannelSequence}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schools", filter: `id=eq.${schoolId}` },
        () => {
          const current = schoolSubscriptions.get(schoolId);
          if (!current) return;
          current.listeners.forEach((fn) => {
            try {
              fn();
            } catch {
              /* ignore */
            }
          });
        },
      )
      .subscribe();
    entry = { channel, listeners: new Set(), cleanupTimer: null };
    schoolSubscriptions.set(schoolId, entry);
  }
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = null;
  }
  entry.listeners.add(onChange);
  return () => {
    const current = schoolSubscriptions.get(schoolId);
    if (!current) return;
    current.listeners.delete(onChange);
    if (current.listeners.size === 0) {
      current.cleanupTimer = setTimeout(() => {
        const latest = schoolSubscriptions.get(schoolId);
        if (!latest || latest.listeners.size > 0) return;
        void supabase.removeChannel(latest.channel);
        schoolSubscriptions.delete(schoolId);
      }, 5_000);
    }
  };
}

export type SchoolIdentity = {
  id: string;
  name: string;
  schoolCode: string;
  logoUrl: string | null;
  status: string;
};

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
      if (error) {
        console.warn("[school-identity]", error);
        return null;
      }
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

export function validateLogoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  const okType =
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/webp" ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp");
  if (!okType) return "Use PNG, JPG or WebP only.";
  if (name.endsWith(".heic") || name.endsWith(".heif") || type.includes("heic")) {
    return "HEIC is not supported. Export as PNG or JPG first.";
  }
  if (file.size <= 0) return "Empty file.";
  if (file.size > 2 * 1024 * 1024) return "Logo must be under 2MB.";
  return null;
}

async function fileToRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = 512;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const isPng =
      file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    return isPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
  }
}

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

  // Prefer compressed data URL so logos always display (storage public URLs often break).
  try {
    const dataUrl = await fileToCompressedDataUrl(opts.file);
    if (dataUrl.length > 900_000) {
      throw new Error("Logo is still too large after compression. Use a smaller image.");
    }
    const buckets = ["school-logos", "public", "avatars"];
    for (const bucket of buckets) {
      try {
        await supabase.storage.from(bucket).upload(path, opts.file, {
          cacheControl: "3600",
          upsert: true,
          contentType: opts.file.type || `image/${ext}`,
        });
        break;
      } catch {
        /* try next */
      }
    }
    return { url: dataUrl, path: "data-url" };
  } catch (compressErr) {
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
        /* try next */
      }
    }
    if (opts.file.size <= 400_000) {
      try {
        const raw = await fileToRawDataUrl(opts.file);
        if (raw.length <= 900_000) return { url: raw, path: "data-url-raw" };
      } catch {
        /* ignore */
      }
    }
    const msg =
      compressErr instanceof Error
        ? compressErr.message
        : "Could not process this logo image.";
    if (/decode|source image/i.test(msg)) {
      throw new Error(
        "This logo file cannot be read. Please use a clear PNG or JPG (not HEIC or a damaged file).",
      );
    }
    throw new Error(msg);
  }
}

export async function updateSchoolLogoUrl(schoolId: string, logoUrl: string) {
  const { error } = await supabase
    .from("schools")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() } as never)
    .eq("id", schoolId);
  if (error) throw new Error(error.message || "Could not save logo to school record");
}

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
