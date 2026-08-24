/** Map technical/DB errors to short user-facing messages. Never expose RLS/SQL codes. */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err == null) return fallback;
  const raw =
    typeof err === "string"
      ? err
      : typeof err === "object" && err && "message" in err
        ? String((err as { message?: string }).message ?? "")
        : String(err);

  const m = raw.toLowerCase();

  if (
    m.includes("internet connection required") ||
    m.includes("requires an internet") ||
    m.includes("err_internet_disconnected") ||
    m.includes("networkerror") ||
    m.includes("network request failed")
  ) {
    return "This feature requires an internet connection. Please reconnect and try again.";
  }
  if (!raw || m.includes("jwt") || m.includes("session")) {
    return "Your session expired. Please sign in again.";
  }
  if (m.includes("row-level security") || m.includes("rls") || m.includes("permission") || m.includes("not authorized") || m.includes("42501")) {
    return "You don't have permission to do that.";
  }
  if (m.includes("duplicate") || m.includes("unique") || m.includes("already exists") || m.includes("23505")) {
    return "This record already exists.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch") || m.includes("load failed")) {
    return "Network problem. Check your connection and try again.";
  }
  if (m.includes("timeout")) {
    return "The request took too long. Please try again.";
  }
  if (m.includes("not found") || m.includes("no rows") || m.includes("pgrst116")) {
    return "We couldn't find that item.";
  }
  if (m.includes("foreign key") || m.includes("23503")) {
    return "Related data is missing. Refresh the page and try again.";
  }
  if (raw.length > 120 || m.includes("supabase") || m.includes("postgres") || m.includes("violates") || m.includes("policy")) {
    return fallback;
  }
  return raw;
}
