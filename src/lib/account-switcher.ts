/**
 * Multi-account switcher for D4EXAM.
 * Stores session tokens (never passwords) per account on-device.
 * Backend remains authority for roles/permissions.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, SessionUser } from "@/lib/session";
import { roleHome, clearPendingLoginRole, seedPendingLoginRole } from "@/lib/session";
import { offlineClearUser } from "@/lib/offline-cache";

const VAULT_KEY = "d4_account_vault_v1";
const ACTIVE_KEY = "d4_account_active_v1";
const ADD_ACCOUNT_FLAG = "d4_add_account_flow";

export type SavedAccount = {
  userId: string;
  email: string;
  fullName: string;
  role: AppRole | null;
  roles: AppRole[];
  schoolId: string | null;
  schoolName: string | null;
  schoolCode: string | null;
  identifier: string | null;
  /** Supabase session tokens — never passwords */
  accessToken: string;
  refreshToken: string;
  savedAt: number;
  lastUsedAt: number;
};

type Vault = {
  accounts: SavedAccount[];
};

function readVault(): Vault {
  if (typeof window === "undefined") return { accounts: [] };
  try {
    const raw = window.localStorage.getItem(VAULT_KEY);
    if (!raw) return { accounts: [] };
    const parsed = JSON.parse(raw) as Vault;
    if (!parsed || !Array.isArray(parsed.accounts)) return { accounts: [] };
    return { accounts: parsed.accounts.filter((a) => a && a.userId && a.refreshToken) };
  } catch {
    return { accounts: [] };
  }
}

function writeVault(vault: Vault): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } catch {
    /* quota */
  }
}

export function listSavedAccounts(): SavedAccount[] {
  const accounts = readVault().accounts;
  return [...accounts].sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
}

export function getActiveAccountId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function setActiveAccountId(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) window.localStorage.setItem(ACTIVE_KEY, userId);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Public metadata only — never tokens */
export type AccountListItem = {
  userId: string;
  email: string;
  fullName: string;
  role: AppRole | null;
  roles: AppRole[];
  schoolId: string | null;
  schoolName: string | null;
  schoolCode: string | null;
  identifier: string | null;
  lastUsedAt: number;
  isActive: boolean;
};

export function listAccountsForUi(activeUserId?: string | null): AccountListItem[] {
  const active = activeUserId ?? getActiveAccountId();
  return listSavedAccounts().map((a) => ({
    userId: a.userId,
    email: a.email,
    fullName: a.fullName,
    role: a.role,
    roles: a.roles,
    schoolId: a.schoolId,
    schoolName: a.schoolName,
    schoolCode: a.schoolCode,
    identifier: a.identifier,
    lastUsedAt: a.lastUsedAt,
    isActive: Boolean(active && a.userId === active),
  }));
}

export function roleLabel(role: AppRole | string | null | undefined): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "school_admin":
      return "School Admin";
    case "examination_officer":
      return "Officer";
    case "teacher":
      return "Teacher";
    case "student":
      return "Student";
    default:
      return role ? String(role) : "User";
  }
}

/**
 * Save/update the current Supabase session into the device vault.
 * Call after successful login when user opts in (or always for "Remember").
 */
export async function saveCurrentAccountToVault(sessionUser?: SessionUser | null): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const sess = data.session;
    if (!sess?.access_token || !sess.refresh_token || !sess.user?.id) return false;

    let user = sessionUser;
    if (!user) {
      const { fetchSessionUser } = await import("@/lib/session");
      user = await fetchSessionUser();
    }
    if (!user?.userId) return false;

    const entry: SavedAccount = {
      userId: user.userId,
      email: user.email || sess.user.email || "",
      fullName: user.fullName || user.email || "Account",
      role: user.role,
      roles: user.roles || [],
      schoolId: user.schoolId,
      schoolName: user.schoolName,
      schoolCode: user.schoolCode,
      identifier: user.identifier,
      accessToken: sess.access_token,
      refreshToken: sess.refresh_token,
      savedAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    const vault = readVault();
    const idx = vault.accounts.findIndex((a) => a.userId === entry.userId);
    if (idx >= 0) vault.accounts[idx] = { ...vault.accounts[idx], ...entry };
    else vault.accounts.push(entry);
    writeVault(vault);
    setActiveAccountId(entry.userId);
    return true;
  } catch {
    return false;
  }
}

/** Refresh tokens in vault after a successful session refresh */
export async function touchActiveAccountTokens(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const sess = data.session;
    if (!sess?.user?.id || !sess.access_token || !sess.refresh_token) return;
    const vault = readVault();
    const idx = vault.accounts.findIndex((a) => a.userId === sess.user!.id);
    if (idx < 0) return;
    vault.accounts[idx] = {
      ...vault.accounts[idx],
      accessToken: sess.access_token,
      refreshToken: sess.refresh_token,
      lastUsedAt: Date.now(),
    };
    writeVault(vault);
    setActiveAccountId(sess.user.id);
  } catch {
    /* ignore */
  }
}

export function isAccountSaved(userId: string): boolean {
  return readVault().accounts.some((a) => a.userId === userId);
}

/** Remove one account from this device only (does not delete D4EXAM account). */
export async function removeAccountFromDevice(userId: string): Promise<void> {
  const vault = readVault();
  vault.accounts = vault.accounts.filter((a) => a.userId !== userId);
  writeVault(vault);
  try {
    await offlineClearUser(userId);
  } catch {
    /* ignore */
  }
  if (getActiveAccountId() === userId) setActiveAccountId(null);
}

/** Switch active session to a saved account. Full page navigation to role home. */
export async function switchToAccount(userId: string): Promise<{ ok: true } | { ok: false; error: string; needsLogin?: boolean }> {
  const vault = readVault();
  const account = vault.accounts.find((a) => a.userId === userId);
  if (!account) return { ok: false, error: "Account not found on this device." };
  if (!account.refreshToken) {
    return { ok: false, error: "No saved session for that account. Sign in again.", needsLogin: true };
  }

  const path =
    account.role && account.role in roleHome ? roleHome[account.role] : "/";

  try {
    try {
      const { data: cur } = await supabase.auth.getSession();
      if (cur.session?.user?.id === userId) {
        setActiveAccountId(userId);
        if (account.role) seedPendingLoginRole(account.role);
        if (typeof window !== "undefined") window.location.replace(path);
        return { ok: true };
      }
    } catch {
      /* continue */
    }

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }

    let access = account.accessToken;
    let refresh = account.refreshToken;

    const { data: setData, error: setErr } = await supabase.auth.setSession({
      access_token: access,
      refresh_token: refresh,
    });

    if (!setErr && setData.session?.access_token && setData.session.refresh_token) {
      access = setData.session.access_token;
      refresh = setData.session.refresh_token;
    } else {
      const { data: refData, error: refErr } = await supabase.auth.refreshSession({
        refresh_token: refresh,
      });
      if (refErr || !refData.session?.access_token || !refData.session.refresh_token) {
        return {
          ok: false,
          error: "Session expired for that account. Sign in again.",
          needsLogin: true,
        };
      }
      access = refData.session.access_token;
      refresh = refData.session.refresh_token;
    }

    account.accessToken = access;
    account.refreshToken = refresh;
    account.lastUsedAt = Date.now();
    const idx = vault.accounts.findIndex((a) => a.userId === userId);
    if (idx >= 0) vault.accounts[idx] = account;
    else vault.accounts.push(account);
    writeVault(vault);
    setActiveAccountId(userId);

    if (account.role) seedPendingLoginRole(account.role);

    if (typeof window !== "undefined") window.location.replace(path);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not switch account." };
  }
}

/** Log out of the current account only; keep other saved accounts. */
export async function signOutThisAccount(): Promise<void> {
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? getActiveAccountId();
  } catch {
    userId = getActiveAccountId();
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  clearPendingLoginRole();

  if (userId) {
    await removeAccountFromDevice(userId);
  }

  const remaining = listSavedAccounts();
  if (remaining.length > 0) {
    if (typeof window !== "undefined") {
      window.location.href = "/login?switched=1";
    }
    return;
  }
  if (typeof window !== "undefined") window.location.href = "/login";
}

/** Log out of all accounts on this device. */
export async function signOutAllAccounts(): Promise<void> {
  const vault = readVault();
  const ids = vault.accounts.map((a) => a.userId);
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  clearPendingLoginRole();
  writeVault({ accounts: [] });
  setActiveAccountId(null);
  for (const id of ids) {
    try {
      await offlineClearUser(id);
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") window.location.href = "/login";
}

export function beginAddAccountFlow(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ADD_ACCOUNT_FLAG, "1");
  } catch {
    /* ignore */
  }
  void supabase.auth.signOut({ scope: "local" }).finally(() => {
    window.location.href = "/login?addAccount=1";
  });
}

export function consumeAddAccountFlow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.sessionStorage.getItem(ADD_ACCOUNT_FLAG);
    if (v) {
      window.sessionStorage.removeItem(ADD_ACCOUNT_FLAG);
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    return new URLSearchParams(window.location.search).get("addAccount") === "1";
  } catch {
    return false;
  }
}

export function isAddAccountUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("addAccount") === "1";
  } catch {
    return false;
  }
}
