import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Plus,
  Trash2,
  Users,
  LogOut,
} from "lucide-react";
import { useSessionUser, initials } from "@/lib/session";
import {
  listAccountsForUi,
  roleLabel,
  switchToAccount,
  removeAccountFromDevice,
  saveCurrentAccountToVault,
  beginAddAccountFlow,
  signOutThisAccount,
  signOutAllAccounts,
  type AccountListItem,
} from "@/lib/account-switcher";

export function SwitchAccountCard() {
  const { data: session } = useSessionUser();
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingCurrent, setSavingCurrent] = useState(false);

  const refresh = useCallback(() => {
    setAccounts(listAccountsForUi(session?.userId));
  }, [session?.userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep active account tokens fresh in vault when session is present
  useEffect(() => {
    if (!session?.userId) return;
    void saveCurrentAccountToVault(session).then(() => refresh());
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSwitch(userId: string) {
    if (userId === session?.userId) {
      toast.message("Already signed in as this account.");
      return;
    }
    setBusyId(userId);
    try {
      const result = await switchToAccount(userId);
      if (!result.ok) {
        if (result.needsLogin) {
          toast.error("Could not restore that account. Tap Add Account and sign in once to refresh it.");
          await removeAccountFromDevice(userId);
          refresh();
        } else {
          toast.error(result.error);
        }
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not switch account.");
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(userId: string) {
    if (!window.confirm("Remove this account from this device? Your D4EXAM account is not deleted.")) {
      return;
    }
    setBusyId(userId);
    try {
      if (userId === session?.userId) {
        await signOutThisAccount();
        return;
      }
      await removeAccountFromDevice(userId);
      toast.success("Account removed from this device.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message || "Could not remove account.");
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveCurrent() {
    if (!session?.userId) {
      toast.error("Sign in first.");
      return;
    }
    setSavingCurrent(true);
    try {
      const ok = await saveCurrentAccountToVault(session);
      if (ok) {
        toast.success("Account saved on this device.");
        refresh();
      } else {
        toast.error("Could not save account.");
      }
    } finally {
      setSavingCurrent(false);
    }
  }

  const currentSaved = session?.userId
    ? accounts.some((a) => a.userId === session.userId)
    : false;

  return (
    <SectionCard
      title="Switch Account"
      description="Use multiple D4EXAM accounts on this device. Sessions stay separate."
      className="lg:col-span-2"
    >
      <div className="space-y-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No other accounts saved yet. Sign in with another account and choose to save it, or
            save this one below.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {accounts.map((a) => {
              const active = a.isActive || a.userId === session?.userId;
              return (
                <li
                  key={a.userId}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 sm:px-4",
                    active && "bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold",
                      active ? "bg-primary text-white" : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {initials(a.fullName || a.email || "U")}
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    disabled={Boolean(busyId) || active}
                    onClick={() => void onSwitch(a.userId)}
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {a.fullName || a.email || "Account"}
                      {active ? (
                        <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {roleLabel(a.role)}
                      {a.schoolName ? ` · ${a.schoolName}` : ""}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {!active && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold"
                        disabled={Boolean(busyId)}
                        onClick={() => void onSwitch(a.userId)}
                      >
                        {busyId === a.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Switch"
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                      title="Remove from this device"
                      disabled={Boolean(busyId)}
                      onClick={() => void onRemove(a.userId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!currentSaved && session?.userId ? (
            <Button
              type="button"
              variant="secondary"
              className="font-semibold"
              disabled={savingCurrent}
              onClick={() => void onSaveCurrent()}
            >
              {savingCurrent ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              Save this account on device
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="font-semibold"
            onClick={() => beginAddAccountFlow()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
          <Button
            type="button"
            variant="outline"
            className="font-semibold"
            onClick={() => {
              if (window.confirm("Sign out of this account only? Other saved accounts stay on this device.")) {
                void signOutThisAccount();
              }
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out of this account
          </Button>
          {accounts.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              className="font-semibold text-red-600 hover:text-red-700"
              onClick={() => {
                if (
                  window.confirm(
                    "Log out of ALL accounts on this device? You will need to sign in again for each one.",
                  )
                ) {
                  void signOutAllAccounts();
                }
              }}
            >
              Log out of all accounts
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-slate-400">
          Removing an account only clears it from this device. It does not delete the account on
          D4EXAM. Passwords are never stored.
        </p>
      </div>
    </SectionCard>
  );
}
