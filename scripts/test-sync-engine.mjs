import { readFileSync } from "node:fs";
import path from "node:path";

function assert(c, m) { if (!c) throw new Error(m); }

const root = process.cwd();
const files = [
  "src/lib/sync/types.ts",
  "src/lib/sync/connectivity.ts",
  "src/lib/sync/conflict.ts",
  "src/lib/sync/retry.ts",
  "src/lib/sync/push.ts",
  "src/lib/sync/pull.ts",
  "src/lib/sync/engine.ts",
  "src/lib/sync/status.ts",
  "src/lib/sync/queue.ts",
  "src/lib/sync/index.ts",
  "src/lib/offline-sync.ts",
];
for (const f of files) {
  const t = readFileSync(path.join(root, f), "utf8");
  assert(t.length > 50, `empty ${f}`);
}
const conflict = readFileSync(path.join(root, "src/lib/sync/conflict.ts"), "utf8");
assert(conflict.includes("server_wins"), "server_wins policy");
assert(conflict.includes("mark_conflict"), "mark_conflict for CBT");
const push = readFileSync(path.join(root, "src/lib/sync/push.ts"), "utf8");
assert(push.includes("notification_read"), "safe outbox entities");
assert(!push.includes("exam_answer"), "must not push exam answers");
const engine = readFileSync(path.join(root, "src/lib/sync/engine.ts"), "utf8");
assert(engine.includes("pushOutbox") && engine.includes("pullScopedData"), "engine orchestration");
const offline = readFileSync(path.join(root, "src/lib/offline-sync.ts"), "utf8");
assert(offline.includes("runSyncEngine"), "offline-sync delegates to engine");
console.log("ALL SYNC ENGINE STRUCTURAL TESTS PASSED");
