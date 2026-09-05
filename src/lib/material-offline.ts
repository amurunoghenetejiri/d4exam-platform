import { offlineGet, offlineSet } from "@/lib/offline-cache";

export type OfflineMaterialBlob = {
  materialId: string;
  title: string;
  fileName: string | null;
  mime: string | null;
  /** data URL or remote url snapshot */
  dataUrl: string;
  savedAt: number;
  meta?: Record<string, unknown>;
};

function key(materialId: string) {
  return `material-blob::${materialId}`;
}

export async function isMaterialOffline(userId: string, materialId: string): Promise<boolean> {
  if (!userId || !materialId) return false;
  const hit = await offlineGet<OfflineMaterialBlob>(userId, key(materialId));
  return Boolean(hit?.data?.dataUrl);
}

export async function getOfflineMaterial(
  userId: string,
  materialId: string,
): Promise<OfflineMaterialBlob | null> {
  if (!userId || !materialId) return null;
  const hit = await offlineGet<OfflineMaterialBlob>(userId, key(materialId));
  return hit?.data ?? null;
}

export async function saveMaterialOffline(
  userId: string,
  material: {
    id: string;
    title: string;
    file_url: string | null;
    file_name: string | null;
    file_mime: string | null;
  },
  schoolId?: string | null,
): Promise<void> {
  if (!userId || !material.id) throw new Error("Missing user or material");
  if (!material.file_url) throw new Error("No file to save offline");

  const res = await fetch(material.file_url);
  if (!res.ok) throw new Error("Could not download material for offline use");
  const blob = await res.blob();
  const dataUrl = await blobToDataUrl(blob);
  const payload: OfflineMaterialBlob = {
    materialId: material.id,
    title: material.title,
    fileName: material.file_name,
    mime: material.file_mime || blob.type || null,
    dataUrl,
    savedAt: Date.now(),
  };
  await offlineSet(userId, key(material.id), payload, { schoolId });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}
