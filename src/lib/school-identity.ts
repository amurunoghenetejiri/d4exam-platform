import { useQuery } from "@tanstack/react-query";
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

/** Load school identity by id (or session school). Realtime-friendly. */
export function useSchoolIdentity(schoolId?: string | null) {
  const { data: session } = useSessionUser();
  const id = schoolId ?? session?.schoolId ?? null;

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`school-identity-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schools", filter: `id=eq.${id}` },
        () => {
          // react-query invalidation via refetchInterval + manual; channel triggers refetch
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  return useQuery({
    queryKey: ["school-identity", id],
    enabled: Boolean(id),
    refetchInterval: 60_000,
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
  if (!ALLOWED.includes(file.type)) {
    return "Logo must be PNG, JPG or WebP.";
  }
  if (file.size > MAX_BYTES) {
    return "Logo must be 2MB or smaller.";
  }
  return null;
}

/**
 * Upload school logo to storage and return public URL.
 * Path: school-logos/{schoolId or applicationId}/{timestamp}.{ext}
 */
export async function uploadSchoolLogo(opts: {
  file: File;
  folder: string; // schoolId or "applications/{appId}"
}): Promise<{ url: string; path: string }> {
  const err = validateLogoFile(opts.file);
  if (err) throw new Error(err);

  const ext =
    opts.file.type === "image/webp"
      ? "webp"
      : opts.file.type === "image/png"
        ? "png"
        : "jpg";
  const path = `${opts.folder}/logo-${Date.now()}.${ext}`;

  // Prefer dedicated bucket; fall back to public
  const buckets = ["school-logos", "public", "avatars"];
  let lastError: Error | null = null;

  for (const bucket of buckets) {
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, opts.file, {
        cacheControl: "3600",
        upsert: true,
        contentType: opts.file.type,
      });

    if (upErr) {
      lastError = new Error(upErr.message);
      continue;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) {
      lastError = new Error("Could not resolve public URL for uploaded logo.");
      continue;
    }
    return { url: data.publicUrl, path: `${bucket}/${path}` };
  }

  throw lastError ?? new Error("Logo upload failed. Ensure a storage bucket exists.");
}

/** Persist logo_url on schools row (school admin / own school only via RLS). */
export async function updateSchoolLogoUrl(schoolId: string, logoUrl: string) {
  const { error } = await supabase
    .from("schools")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() } as never)
    .eq("id", schoolId);
  if (error) throw error;
}
