import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryMemoryStore, PersonaValidationError } from "../src/index.mjs";
import { memoryFixtures } from "./helpers.mjs";

test("retrieval is isolated by user and character", () => {
  const memories = memoryFixtures();
  const foreign = structuredClone(memories[0]);
  foreign.id = "memory_foreign_user";
  foreign.user_id = "user_999";
  foreign.content = "다른 사용자가 금지된 서가를 열었다.";
  const store = new InMemoryMemoryStore([...memories, foreign]);
  const selected = store.retrieve({
    userId: "user_123",
    characterId: "luna",
    query: "금지된 서가와 도서관",
    now: new Date("2026-08-20T00:00:00+09:00"),
  });
  assert.ok(selected.length > 0);
  assert.ok(selected.every((memory) => memory.user_id === "user_123"));
  assert.ok(!selected.some((memory) => memory.id === foreign.id));
});

test("sensitive memory is excluded unless explicitly allowed", () => {
  const [memory] = memoryFixtures();
  memory.sensitivity = "highly_sensitive";
  const store = new InMemoryMemoryStore([memory]);
  const query = { userId: memory.user_id, characterId: memory.character_id, query: memory.content };
  assert.equal(store.retrieve(query).length, 0);
  assert.equal(store.retrieve({ ...query, includeSensitive: true }).length, 1);
});

test("supersede and retract remove old memories from active retrieval", () => {
  const [memory] = memoryFixtures();
  const store = new InMemoryMemoryStore([memory]);
  const replacement = {
    ...structuredClone(memory),
    id: "memory_corrected_preference",
    content: "사용자는 밤 산책을 싫어한다.",
    created_at: "2026-08-20T00:00:00+09:00",
  };
  store.supersede({ id: memory.id, replacement, userId: memory.user_id, characterId: memory.character_id });
  assert.equal(store.get(memory.id).status, "superseded");
  assert.deepEqual(store.listActive(memory.user_id, memory.character_id).map((item) => item.id), [replacement.id]);
  store.retract({ id: replacement.id, userId: memory.user_id, characterId: memory.character_id });
  assert.equal(store.listActive(memory.user_id, memory.character_id).length, 0);
});

test("memory mutation requires matching ownership", () => {
  const [memory] = memoryFixtures();
  const store = new InMemoryMemoryStore([memory]);
  assert.throws(
    () => store.delete({ id: memory.id, userId: "user_999", characterId: memory.character_id }),
    PersonaValidationError,
  );
});
