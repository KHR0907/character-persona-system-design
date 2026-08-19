import { PersonaValidationError } from "./errors.mjs";

function tokenize(value) {
  return new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((token) => token.length > 1));
}

function relevance(queryTokens, content) {
  const memoryTokens = tokenize(content);
  if (queryTokens.size === 0 || memoryTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of queryTokens) if (memoryTokens.has(token)) overlap += 1;
  return overlap / new Set([...queryTokens, ...memoryTokens]).size;
}

function recencyScore(createdAt, now) {
  const ageDays = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  return Math.max(0, 10 - Math.log2(ageDays + 1) * 2);
}

const sensitivityPenalty = {
  normal: 0,
  personal: 2,
  sensitive: 8,
  highly_sensitive: 20,
};

export class InMemoryMemoryStore {
  #memories = new Map();

  constructor(memories = []) {
    for (const memory of memories) this.put(memory);
  }

  put(memory) {
    if (this.#memories.has(memory.id)) throw new PersonaValidationError(`Duplicate memory ID: ${memory.id}`);
    this.#memories.set(memory.id, structuredClone(memory));
  }

  get(id) {
    const memory = this.#memories.get(id);
    return memory ? structuredClone(memory) : null;
  }

  listActive(userId, characterId) {
    return [...this.#memories.values()]
      .filter((memory) => memory.user_id === userId && memory.character_id === characterId && memory.status === "active")
      .map((memory) => structuredClone(memory));
  }

  retrieve({ userId, characterId, query, maxItems = 6, maxCharacters = 1800, now = new Date(), includeSensitive = false }) {
    const queryTokens = tokenize(query);
    const ranked = this.listActive(userId, characterId)
      .filter((memory) => includeSensitive || !["sensitive", "highly_sensitive"].includes(memory.sensitivity))
      .map((memory) => ({
        memory,
        score: relevance(queryTokens, memory.content) * 50
          + memory.importance * 0.25
          + recencyScore(memory.created_at, now)
          - sensitivityPenalty[memory.sensitivity]
          - Math.min(8, memory.recall_count * 0.5),
      }))
      .sort((left, right) => right.score - left.score || left.memory.id.localeCompare(right.memory.id));

    const selected = [];
    let characters = 0;
    for (const item of ranked) {
      if (selected.length >= maxItems || characters + item.memory.content.length > maxCharacters) continue;
      selected.push({ ...structuredClone(item.memory), retrieval_score: Number(item.score.toFixed(3)) });
      characters += item.memory.content.length;
    }
    return selected;
  }

  markRecalled(ids, now = new Date()) {
    for (const id of ids) {
      const memory = this.#memories.get(id);
      if (!memory || memory.status !== "active") continue;
      memory.recall_count += 1;
      memory.last_recalled_at = now.toISOString();
    }
  }

  retract({ id, userId, characterId }) {
    const memory = this.#owned(id, userId, characterId);
    memory.status = "retracted";
    return structuredClone(memory);
  }

  supersede({ id, replacement, userId, characterId }) {
    const memory = this.#owned(id, userId, characterId);
    if (replacement.user_id !== userId || replacement.character_id !== characterId) {
      throw new PersonaValidationError("Replacement memory ownership mismatch");
    }
    memory.status = "superseded";
    this.put({ ...structuredClone(replacement), supersedes: id, status: "active" });
    return this.get(replacement.id);
  }

  delete({ id, userId, characterId }) {
    this.#owned(id, userId, characterId);
    this.#memories.delete(id);
  }

  snapshot() {
    return [...this.#memories.values()].map((memory) => structuredClone(memory));
  }

  #owned(id, userId, characterId) {
    const memory = this.#memories.get(id);
    if (!memory || memory.user_id !== userId || memory.character_id !== characterId) {
      throw new PersonaValidationError(`Memory not found for this user/character: ${id}`);
    }
    return memory;
  }
}
