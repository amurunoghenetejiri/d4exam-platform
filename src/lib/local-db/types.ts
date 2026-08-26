import type { SyncStatus } from "./schema";

export type { SyncStatus };

export type LocalSessionRow = {
  user_id: string;
  profile_id: string | null;
  email: string | null;
  full_name: string | null;
  status: string | null;
  school_id: string | null;
  school_name: string | null;
  roles_json: string;
  primary_role: string | null;
  access_token_expires_at: string | null;
  has_refresh_session: number;
  last_validated_at: string | null;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
  sync_status: SyncStatus | string;
};

export type OutboxOperation = "insert" | "update" | "delete" | "upsert" | "custom";

export type OutboxRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: OutboxOperation | string;
  payload_json: string;
  status: "pending" | "failed" | "sent" | "conflict" | string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  available_at: string | null;
};

export type LocalDbCapability = {
  available: boolean;
  backend: "sqlite-native" | "memory" | "none";
  dbName: string;
  version: number;
};
