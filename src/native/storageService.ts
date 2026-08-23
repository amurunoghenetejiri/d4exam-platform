/**
 * Key-value storage — localStorage on web; @capacitor/preferences on native later.
 * Never store secrets or service-role keys here.
 */
export async function storageGet(key: string): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

export async function storageRemove(key: string): Promise<void> {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
