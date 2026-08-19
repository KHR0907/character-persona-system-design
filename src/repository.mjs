import { PersonaValidationError, StateConflictError } from "./errors.mjs";
import { InMemoryMemoryStore } from "./memory-store.mjs";

function templateKey(characterId, version) {
  return `${characterId}@${version}`;
}

export class InMemoryPersonaRepository {
  #templates = new Map();
  #instances = new Map();
  #events = new Map();
  #committedTurns = new Map();
  #memoryStore;

  constructor({ templates = [], instances = [], memories = [], eventDefinitions = [] } = {}) {
    for (const template of templates) this.#templates.set(templateKey(template.id, template.version), structuredClone(template));
    for (const instance of instances) this.#instances.set(instance.id, structuredClone(instance));
    for (const event of eventDefinitions) this.#events.set(event.id, structuredClone(event));
    this.#memoryStore = new InMemoryMemoryStore(memories);
  }

  getTemplate(characterId, version) {
    const template = this.#templates.get(templateKey(characterId, version));
    if (!template) throw new PersonaValidationError(`Template not found: ${characterId}@${version}`);
    return structuredClone(template);
  }

  getInstance(instanceId) {
    const instance = this.#instances.get(instanceId);
    if (!instance) throw new PersonaValidationError(`Instance not found: ${instanceId}`);
    return structuredClone(instance);
  }

  listEventDefinitions() {
    return [...this.#events.values()].map((event) => structuredClone(event));
  }

  retrieveMemories(options) {
    return this.#memoryStore.retrieve(options);
  }

  markMemoriesRecalled(ids, now) {
    this.#memoryStore.markRecalled(ids, now);
  }

  getMemory(id) {
    return this.#memoryStore.get(id);
  }

  getCommittedTurn(instanceId, idempotencyKey) {
    const result = this.#committedTurns.get(`${instanceId}:${idempotencyKey}`);
    return result ? structuredClone(result) : null;
  }

  commitTurn({ instanceId, expectedRevision, idempotencyKey, nextInstance, memoryCandidates = [], recalledMemoryIds = [], now = new Date(), result }) {
    const turnKey = `${instanceId}:${idempotencyKey}`;
    const previous = this.#committedTurns.get(turnKey);
    if (previous) return { duplicate: true, result: structuredClone(previous) };
    const current = this.#instances.get(instanceId);
    if (!current || current.state_revision !== expectedRevision) {
      throw new StateConflictError(`Cannot commit revision ${expectedRevision} for ${instanceId}`);
    }
    if (nextInstance.id !== instanceId || nextInstance.state_revision !== expectedRevision + 1) {
      throw new PersonaValidationError("Committed instance must advance exactly one revision");
    }
    for (const memory of memoryCandidates) {
      if (memory.user_id !== current.user_id || memory.character_id !== current.character_id) {
        throw new PersonaValidationError(`Memory ownership mismatch: ${memory.id}`);
      }
      if (this.#memoryStore.get(memory.id)) throw new PersonaValidationError(`Duplicate memory ID: ${memory.id}`);
    }
    for (const memory of memoryCandidates) this.#memoryStore.put(memory);
    this.#instances.set(instanceId, structuredClone(nextInstance));
    this.#committedTurns.set(turnKey, structuredClone(result));
    this.#memoryStore.markRecalled(recalledMemoryIds, now);
    return { duplicate: false, result: structuredClone(result) };
  }

  memoryStore() {
    return this.#memoryStore;
  }
}
