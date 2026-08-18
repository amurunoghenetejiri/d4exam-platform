// School branding helpers — identity fetch + logo upload/validation.
import { supabase } from "@/integrations/supabase/client";

export type SchoolIdentity = {
  id: string;
  name: string;
  schoolCode: string | null;
  logoUrl: string | null;
  status: string | null;
};

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/jpg"]);

export function validateLogoFile(file: File): string | null {
  if (!file) return "No file selected.";
  if (file.size <= 0) return "Empty file.";
  if (file.size > MAX_LOGO_BYTES) return "Logo must be under 2MB.";
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  const okType =
    ALLOWED_TYPES.has(type) ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp");
  if (!okType) return "Use PNG, JPG or WebP only.";
  if (name.endsWith(".heic") || name.endsWith(".heif") || type.includes("heic")) {
    return "HEIC is not supported. Export as PNG or JPG first.";
  }
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
  // Draw onto canvas to normalize format and reduce size for storage in JSON documents.
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
    // Prefer PNG for logos with transparency; JPEG is smaller for photos.
    const isPng =
      file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    const dataUrl = isPng
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", 0.85);
    return dataUrl;
  } finally {
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
  }
}

export async function fetchSchoolIdentity(schoolId: string): Promise<SchoolIdentity | null> {
  try {
    const { data, error } = await supabase
      .from("schools")
      .select("id, name, school_code, logo_url, status")
      .eq("id", schoolId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id as string,
      name: (data.name as string) || "",
      schoolCode: (data.school_code as string | null) ?? null,
      logoUrl: (data.logo_url as string | null) ?? null,
      status: (data.status as string | null) ?? null,
    };
  } catch {
    return null;
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

  // Prefer compressed data URL for reliability (always displays; storage buckets may be private / missing).
  // Still attempt storage upload so files exist when buckets are configured.
  let storedUrl: string | null = null;
  let storedPath: string | null = null;
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
      if (data?.publicUrl) {
        storedUrl = data.publicUrl;
        storedPath = `${bucket}/${path}`;
        break;
      }
    } catch {
      // try next bucket
    }
  }

  try {
    const dataUrl = await fileToCompressedDataUrl(opts.file);
    if (dataUrl.length > 900_000) {
      // Too large for data URL — fall back to storage URL if we have one
      if (storedUrl) return { url: storedUrl, path: storedPath || path };
      throw new Error("Logo is still too large after compression. Use a smaller image.");
    }
    // Data URLs always render in <img>; avoids broken images when storage is private.
    return { url: dataUrl, path: storedPath || "data-url" };
  } catch (compressErr) {
    if (storedUrl) return { url: storedUrl, path: storedPath || path };
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
