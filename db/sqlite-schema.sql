PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS character_templates (
  character_id TEXT NOT NULL,
  version TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (character_id, version)
);

CREATE TABLE IF NOT EXISTS character_instances (
  instance_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
  document TEXT NOT NULL CHECK (json_valid(document)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, character_id),
  FOREIGN KEY (character_id, template_version)
    REFERENCES character_templates(character_id, version)
);

CREATE TABLE IF NOT EXISTS memories (
  memory_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'retracted')),
  importance INTEGER NOT NULL CHECK (importance BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE INDEX IF NOT EXISTS memories_owner_status_idx
  ON memories(user_id, character_id, status);
CREATE INDEX IF NOT EXISTS memories_owner_importance_idx
  ON memories(user_id, character_id, importance DESC);

CREATE TABLE IF NOT EXISTS event_definitions (
  event_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  priority INTEGER NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document))
);

CREATE TABLE IF NOT EXISTS committed_turns (
  instance_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  base_state_revision INTEGER NOT NULL,
  committed_state_revision INTEGER NOT NULL,
  result TEXT NOT NULL CHECK (json_valid(result)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (instance_id, idempotency_key),
  FOREIGN KEY (instance_id) REFERENCES character_instances(instance_id)
);

CREATE TABLE IF NOT EXISTS event_logs (
  event_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  state_revision INTEGER NOT NULL,
  context TEXT NOT NULL CHECK (json_valid(context)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instance_id) REFERENCES character_instances(instance_id)
);

CREATE INDEX IF NOT EXISTS event_logs_instance_revision_idx
  ON event_logs(instance_id, state_revision);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  signals TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(signals)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instance_id) REFERENCES character_instances(instance_id)
);
