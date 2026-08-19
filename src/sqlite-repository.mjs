import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { PersonaValidationError, StateConflictError } from "./errors.mjs";
import { InMemoryMemoryStore } from "./memory-store.mjs";
import { createSchemaValidators } from "./schema-validator.mjs";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSchemaPath = path.resolve(sourceDir, "../db/sqlite-schema.sql");

function encode(value) {
  return JSON.stringify(value);
}

function decode(value) {
  return JSON.parse(value);
}

export class SqlitePersonaRepository {
  #db;
  #validators;

  constructor({ filename = ":memory:", schemaPath = defaultSchemaPath } = {}) {
    this.#db = new DatabaseSync(filename);
    this.#db.exec(fs.readFileSync(schemaPath, "utf8"));
    this.#validators = createSchemaValidators();
  }

  close() {
    this.#db.close();
  }

  putTemplate(template) {
    this.#validators.assert("characterTemplateDocument", { character_template: template }, "character template");
    this.#db.prepare(`
      INSERT INTO character_templates(character_id, version, document)
      VALUES (?, ?, ?)
      ON CONFLICT(character_id, version) DO UPDATE SET
        document = excluded.document,
        updated_at = CURRENT_TIMESTAMP
    `).run(template.id, template.version, encode(template));
  }

  putInstance(instance) {
    this.#validators.assert("characterInstanceDocument", { character_instance: instance }, "character instance");
    this.#db.prepare(`
      INSERT INTO character_instances(instance_id, user_id, character_id, template_version, state_revision, document)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_id) DO UPDATE SET
        user_id = excluded.user_id,
        character_id = excluded.character_id,
        template_version = excluded.template_version,
        state_revision = excluded.state_revision,
        document = excluded.document,
        updated_at = CURRENT_TIMESTAMP
    `).run(instance.id, instance.user_id, instance.character_id, instance.template_version, instance.state_revision, encode(instance));
  }

  putMemory(memory) {
    this.#validators.assert("memoryDocument", { memory }, "memory");
    this.#db.prepare(`
      INSERT INTO memories(memory_id, user_id, character_id, status, importance, created_at, document)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(memory.id, memory.user_id, memory.character_id, memory.status, memory.importance, memory.created_at, encode(memory));
  }

  putEventDefinition(event) {
    this.#validators.assert("eventDefinitionDocument", { event_definition: event }, "event definition");
    this.#db.prepare(`
      INSERT INTO event_definitions(event_id, version, priority, document)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        version = excluded.version,
        priority = excluded.priority,
        document = excluded.document
    `).run(event.id, event.version, event.priority, encode(event));
  }

  getTemplate(characterId, version) {
    const row = this.#db.prepare("SELECT document FROM character_templates WHERE character_id = ? AND version = ?")
      .get(characterId, version);
    if (!row) throw new PersonaValidationError(`Template not found: ${characterId}@${version}`);
    return decode(row.document);
  }

  getInstance(instanceId) {
    const row = this.#db.prepare("SELECT document FROM character_instances WHERE instance_id = ?").get(instanceId);
    if (!row) throw new PersonaValidationError(`Instance not found: ${instanceId}`);
    return decode(row.document);
  }

  getMemory(id) {
    const row = this.#db.prepare("SELECT document FROM memories WHERE memory_id = ?").get(id);
    return row ? decode(row.document) : null;
  }

  retractMemory({ id, userId, characterId }) {
    const memory = this.#ownedMemory(id, userId, characterId);
    memory.status = "retracted";
    this.#db.prepare("UPDATE memories SET status = 'retracted', document = ? WHERE memory_id = ?")
      .run(encode(memory), id);
    return structuredClone(memory);
  }

  supersedeMemory({ id, replacement, userId, characterId }) {
    const current = this.#ownedMemory(id, userId, characterId);
    if (replacement.user_id !== userId || replacement.character_id !== characterId) {
      throw new PersonaValidationError("Replacement memory ownership mismatch");
    }
    const next = { ...structuredClone(replacement), supersedes: id, status: "active" };
    this.#validators.assert("memoryDocument", { memory: next }, "replacement memory");
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      current.status = "superseded";
      this.#db.prepare("UPDATE memories SET status = 'superseded', document = ? WHERE memory_id = ?")
        .run(encode(current), id);
      this.#db.prepare(`
        INSERT INTO memories(memory_id, user_id, character_id, status, importance, created_at, document)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(next.id, next.user_id, next.character_id, next.status, next.importance, next.created_at, encode(next));
      this.#db.exec("COMMIT");
      return structuredClone(next);
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  deleteMemory({ id, userId, characterId }) {
    this.#ownedMemory(id, userId, characterId);
    this.#db.prepare("DELETE FROM memories WHERE memory_id = ?").run(id);
  }

  listEventDefinitions() {
    return this.#db.prepare("SELECT document FROM event_definitions ORDER BY priority DESC, event_id ASC")
      .all()
      .map((row) => decode(row.document));
  }

  listEventLogs(instanceId) {
    return this.#db.prepare(`
      SELECT event_id, state_revision, context, created_at
      FROM event_logs WHERE instance_id = ? ORDER BY event_log_id ASC
    `).all(instanceId).map((row) => ({
      event_id: row.event_id,
      state_revision: row.state_revision,
      context: decode(row.context),
      created_at: row.created_at,
    }));
  }

  retrieveMemories(options) {
    const rows = this.#db.prepare(`
      SELECT document FROM memories
      WHERE user_id = ? AND character_id = ? AND status = 'active'
    `).all(options.userId, options.characterId);
    return new InMemoryMemoryStore(rows.map((row) => decode(row.document))).retrieve(options);
  }

  markMemoriesRecalled(ids, now = new Date()) {
    const select = this.#db.prepare("SELECT document FROM memories WHERE memory_id = ? AND status = 'active'");
    const update = this.#db.prepare("UPDATE memories SET document = ? WHERE memory_id = ?");
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      for (const id of ids) {
        const row = select.get(id);
        if (!row) continue;
        const memory = decode(row.document);
        memory.recall_count += 1;
        memory.last_recalled_at = now.toISOString();
        update.run(encode(memory), id);
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  getCommittedTurn(instanceId, idempotencyKey) {
    const row = this.#db.prepare("SELECT result FROM committed_turns WHERE instance_id = ? AND idempotency_key = ?")
      .get(instanceId, idempotencyKey);
    return row ? decode(row.result) : null;
  }

  commitTurn({ instanceId, expectedRevision, idempotencyKey, nextInstance, memoryCandidates = [], recalledMemoryIds = [], now = new Date(), result }) {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.#db.prepare("SELECT result FROM committed_turns WHERE instance_id = ? AND idempotency_key = ?")
        .get(instanceId, idempotencyKey);
      if (prior) {
        this.#db.exec("COMMIT");
        return { duplicate: true, result: decode(prior.result) };
      }
      const currentRow = this.#db.prepare("SELECT document, state_revision FROM character_instances WHERE instance_id = ?")
        .get(instanceId);
      if (!currentRow || currentRow.state_revision !== expectedRevision) {
        throw new StateConflictError(`Cannot commit revision ${expectedRevision} for ${instanceId}`);
      }
      const current = decode(currentRow.document);
      if (nextInstance.id !== instanceId || nextInstance.state_revision !== expectedRevision + 1) {
        throw new PersonaValidationError("Committed instance must advance exactly one revision");
      }
      this.#validators.assert("characterInstanceDocument", { character_instance: nextInstance }, "next character instance");
      const insertMemory = this.#db.prepare(`
        INSERT INTO memories(memory_id, user_id, character_id, status, importance, created_at, document)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const memory of memoryCandidates) {
        this.#validators.assert("memoryDocument", { memory }, `memory candidate ${memory.id}`);
        if (memory.user_id !== current.user_id || memory.character_id !== current.character_id) {
          throw new PersonaValidationError(`Memory ownership mismatch: ${memory.id}`);
        }
        insertMemory.run(memory.id, memory.user_id, memory.character_id, memory.status, memory.importance, memory.created_at, encode(memory));
      }
      const selectMemory = this.#db.prepare("SELECT document FROM memories WHERE memory_id = ? AND status = 'active'");
      const updateMemory = this.#db.prepare("UPDATE memories SET document = ? WHERE memory_id = ?");
      for (const memoryId of recalledMemoryIds) {
        const row = selectMemory.get(memoryId);
        if (!row) continue;
        const memory = decode(row.document);
        if (memory.user_id !== current.user_id || memory.character_id !== current.character_id) {
          throw new PersonaValidationError(`Recalled memory ownership mismatch: ${memoryId}`);
        }
        memory.recall_count += 1;
        memory.last_recalled_at = now.toISOString();
        updateMemory.run(encode(memory), memoryId);
      }
      const changed = this.#db.prepare(`
        UPDATE character_instances
        SET state_revision = ?, document = ?, updated_at = CURRENT_TIMESTAMP
        WHERE instance_id = ? AND state_revision = ?
      `).run(nextInstance.state_revision, encode(nextInstance), instanceId, expectedRevision);
      if (changed.changes !== 1) throw new StateConflictError(`Concurrent state update for ${instanceId}`);
      this.#db.prepare(`
        INSERT INTO committed_turns(instance_id, idempotency_key, base_state_revision, committed_state_revision, result)
        VALUES (?, ?, ?, ?, ?)
      `).run(instanceId, idempotencyKey, expectedRevision, nextInstance.state_revision, encode(result));
      for (const eventId of result.appliedEventIds ?? []) {
        this.#db.prepare(`
          INSERT INTO event_logs(instance_id, event_id, state_revision, context)
          VALUES (?, ?, ?, ?)
        `).run(instanceId, eventId, nextInstance.state_revision, encode({ idempotency_key: idempotencyKey }));
      }
      this.#db.exec("COMMIT");
      return { duplicate: false, result: structuredClone(result) };
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  memoryStore() {
    throw new PersonaValidationError("SQLite memories must be accessed through repository methods");
  }

  #ownedMemory(id, userId, characterId) {
    const memory = this.getMemory(id);
    if (!memory || memory.user_id !== userId || memory.character_id !== characterId) {
      throw new PersonaValidationError(`Memory not found for this user/character: ${id}`);
    }
    return memory;
  }
}
