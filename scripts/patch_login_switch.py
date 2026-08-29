from pathlib import Path
lt = Path("src/routes/login.tsx").read_text()
changed = []
old_state = """  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);"""
new_state = """  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const q = new URLSearchParams(window.location.search);
      return q.get("identifier") || q.get("email") || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);"""
if old_state in lt:
    lt = lt.replace(old_state, new_state, 1)
    changed.append("prefill")
old_go = """    const addFlow = consumeAddAccountFlow();
    if (rememberDevice || addFlow || listSavedAccounts().length > 0) {
      await saveCurrentAccountToVault();
    }"""
new_go = """    const addFlow = consumeAddAccountFlow();
    let switchUser = "";
    try {
      switchUser = new URLSearchParams(window.location.search).get("switchUser") || "";
      if (!switchUser) switchUser = sessionStorage.getItem("d4_switch_target") || "";
    } catch {
      /* ignore */
    }
    if (rememberDevice || addFlow || switchUser || listSavedAccounts().length > 0) {
      await saveCurrentAccountToVault();
    }
    try {
      sessionStorage.removeItem("d4_switch_target");
      sessionStorage.removeItem("d4_switch_role");
    } catch {
      /* ignore */
    }"""
if old_go in lt:
    lt = lt.replace(old_go, new_go, 1)
    changed.append("save")
old_add = """  const isAddAccount =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("addAccount") === "1";"""
new_add = """  const isAddAccount =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).get("addAccount") === "1" ||
      Boolean(new URLSearchParams(window.location.search).get("switchUser")));"""
if old_add in lt:
    lt = lt.replace(old_add, new_add, 1)
    changed.append("addFlag")
Path("src/routes/login.tsx").write_text(lt)
print("login", ",".join(changed) or "none")
