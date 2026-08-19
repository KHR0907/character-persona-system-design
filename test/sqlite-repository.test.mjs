import test from "node:test";
import assert from "node:assert/strict";
import { PersonaRuntime, SqlitePersonaRepository } from "../src/index.mjs";
import { eventFixture, instanceFixture, memoryFixtures, templateFixture } from "./helpers.mjs";

function seededRepository() {
  const repository = new SqlitePersonaRepository();
  repository.putTemplate(templateFixture());
  repository.putInstance(instanceFixture());
  for (const memory of memoryFixtures()) repository.putMemory(memory);
  repository.putEventDefinition(eventFixture());
  return repository;
}

function emptyUpdate(turn, changes = [], memoryIds = []) {
  return {
    idempotency_key: turn.idempotencyKey,
    base_state_revision: 17,
    detected_user_signals: [],
    state_change_candidates: changes,
    memory_candidate_ids: memoryIds,
    event_candidate_ids: [],
    safety_flags: [],
  };
}

test("SQLite repository persists canonical documents and isolates memory lookup", () => {
  const repository = seededRepository();
  try {
    assert.equal(repository.getTemplate("luna", "2.0.0").core_identity.name, "루나");
    assert.equal(repository.getInstance("luna_user_123").state_revision, 17);
    assert.equal(repository.listEventDefinitions().length, 1);
    const selected = repository.retrieveMemories({
      userId: "user_123",
      characterId: "luna",
      query: "도서관 재건 약속",
      now: new Date("2026-08-20T00:00:00+09:00"),
    });
    assert.ok(selected.length > 0);
    assert.ok(selected.every((memory) => memory.user_id === "user_123"));
  } finally {
    repository.close();
  }
});

test("SQLite memory lifecycle supports supersede, retract, and ownership checks", () => {
  const repository = seededRepository();
  const original = memoryFixtures()[0];
  const replacement = {
    ...structuredClone(original),
    id: "memory_corrected_fact",
    content: "사용자가 이전 표현을 정정했다.",
    created_at: "2026-08-20T01:00:00+09:00",
  };
  try {
    repository.supersedeMemory({
      id: original.id,
      replacement,
      userId: original.user_id,
      characterId: original.character_id,
    });
    assert.equal(repository.getMemory(original.id).status, "superseded");
    assert.equal(repository.getMemory(replacement.id).supersedes, original.id);
    repository.retractMemory({ id: replacement.id, userId: original.user_id, characterId: original.character_id });
    assert.equal(repository.getMemory(replacement.id).status, "retracted");
    assert.throws(() => repository.deleteMemory({
      id: replacement.id,
      userId: "user_999",
      characterId: original.character_id,
    }), /Memory not found/);
    repository.deleteMemory({ id: replacement.id, userId: original.user_id, characterId: original.character_id });
    assert.equal(repository.getMemory(replacement.id), null);
  } finally {
    repository.close();
  }
});

test("runtime can atomically commit and deduplicate a turn in SQLite", async () => {
  const repository = seededRepository();
  let calls = 0;
  const runtime = new PersonaRuntime({
    repository,
    maxPromptTokens: 10000,
    generator: {
      async generate({ turn }) {
        calls += 1;
        return {
          response: "작은 약속부터 기록해 둘게요.",
          post_conversation_update: emptyUpdate(turn, [{
            path: "relationship_state.gratitude",
            operation: "add",
            value: 2,
            reason: "재건을 돕겠다는 제안을 받았다.",
          }]),
          memory_candidates: [],
        };
      },
    },
  });
  const input = {
    instanceId: "luna_user_123",
    userMessage: "재건을 계속 도울게.",
    conversationId: "conversation_29",
    messageId: "message_440",
  };
  try {
    const first = await runtime.runTurn(input);
    const duplicate = await runtime.runTurn(input);
    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(calls, 1);
    assert.equal(repository.getInstance(input.instanceId).state_revision, 18);
    assert.equal(repository.getInstance(input.instanceId).relationship_state.gratitude, 49);
  } finally {
    repository.close();
  }
});

test("SQLite transaction rolls back state when a memory write fails", async () => {
  const repository = seededRepository();
  const duplicateMemory = memoryFixtures()[0];
  const runtime = new PersonaRuntime({
    repository,
    maxPromptTokens: 10000,
    generator: {
      async generate({ turn }) {
        return {
          response: "기록해 둘게요.",
          post_conversation_update: emptyUpdate(turn, [{
            path: "relationship_state.trust",
            operation: "add",
            value: 1,
            reason: "대화가 이어졌다.",
          }], [duplicateMemory.id]),
          memory_candidates: [duplicateMemory],
        };
      },
    },
  });
  try {
    await assert.rejects(() => runtime.runTurn({
      instanceId: "luna_user_123",
      userMessage: "이 말을 다시 기억해 줘.",
      conversationId: "conversation_29",
      messageId: "message_441",
    }), /UNIQUE constraint failed/);
    assert.equal(repository.getInstance("luna_user_123").state_revision, 17);
    assert.equal(repository.getInstance("luna_user_123").relationship_state.trust, 78);
  } finally {
    repository.close();
  }
});

test("SQLite runtime commits an eligible event and its event log together", async () => {
  const repository = new SqlitePersonaRepository();
  const instance = instanceFixture();
  instance.route_state.current_route = "forbidden_archive_arc";
  instance.route_state.completed_events = instance.route_state.completed_events.filter((id) => id !== "moonlight_library_collapse");
  instance.route_state.active_flags.push(
    "user_saw_closed_archive",
    "user_learned_memory_rule",
    "luna_shared_two_secrets",
    "user_opened_sealed_archive",
  );
  instance.world_overrides.moonlight_library.status = "active";
  repository.putTemplate(templateFixture());
  repository.putInstance(instance);
  repository.putEventDefinition(eventFixture());
  const runtime = new PersonaRuntime({
    repository,
    maxPromptTokens: 10000,
    generator: {
      async generate({ turn }) {
        return {
          response: "서가가 무너지고 있어요… 우선 이쪽으로 와요.",
          post_conversation_update: emptyUpdate(turn),
          memory_candidates: [],
        };
      },
    },
  });
  try {
    const result = await runtime.runTurn({
      instanceId: instance.id,
      userMessage: "경고를 무시하고 봉인된 서가를 열게.",
      conversationId: "conversation_30",
      messageId: "message_451",
      now: new Date("2026-08-20T03:00:00+09:00"),
    });
    assert.deepEqual(result.appliedEventIds, ["moonlight_library_collapse"]);
    assert.equal(result.instance.route_state.current_route, "collapse_arc");
    const logs = repository.listEventLogs(instance.id);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event_id, "moonlight_library_collapse");
    assert.equal(logs[0].state_revision, 18);
  } finally {
    repository.close();
  }
});
