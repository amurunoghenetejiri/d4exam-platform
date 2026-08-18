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

export function validateLogoFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  const okType =
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/webp" ||
    type === "image/gif" ||
    type === "";
  const okExt = /\.(png|jpe?g|webp|gif)$/i.test(name);
  if (!okType && !okExt) {
    return "Use a PNG, JPG, or WebP image.";
  }
  if (/\.(heic|heif)$/i.test(name) || type.includes("heic") || type.includes("heif")) {
    return "HEIC photos are not supported. Export as JPG or PNG first.";
  }
  if (file.size > 2_500_000) return "Logo must be under 2.5 MB.";
  if (file.size < 32) return "That file looks empty. Choose another logo.";
  return null;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Try a different PNG or JPG."));
    };
    img.src = url;
  });
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const max = 512;
  let w = 0;
  let h = 0;
  let draw: CanvasImageSource | null = null;
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);
    w = bitmap.width;
    h = bitmap.height;
    draw = bitmap;
  } catch {
    const img = await loadImageElement(file);
    w = img.naturalWidth || img.width;
    h = img.naturalHeight || img.height;
    draw = img;
  }

  if (!draw || w < 1 || h < 1) {
    throw new Error("Could not read this image. Try a different PNG or JPG.");
  }

  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(draw, 0, 0, cw, ch);
  if (bitmap) bitmap.close();

  const preferPng = (file.type || "").includes("png") || file.name.toLowerCase().endsWith(".png");
  return preferPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
}

function fileToRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string" && r.startsWith("data:")) resolve(r);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
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

  try {
    const dataUrl = await fileToCompressedDataUrl(opts.file);
    if (dataUrl.length > 900_000) {
      throw new Error("Logo is still too large after compression. Use a smaller image.");
    }
    return { url: dataUrl, path: "data-url" };
  } catch (compressErr) {
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
