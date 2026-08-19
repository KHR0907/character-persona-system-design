import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryPersonaRepository, PersonaRuntime, PersonaValidationError } from "../src/index.mjs";
import { eventFixture, instanceFixture, memoryFixtures, templateFixture } from "./helpers.mjs";

function repository() {
  return new InMemoryPersonaRepository({
    templates: [templateFixture()],
    instances: [instanceFixture()],
    memories: memoryFixtures(),
    eventDefinitions: [eventFixture()],
  });
}

function updateFor(turn, changes = [], memoryIds = []) {
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

test("runtime commits exactly once and returns the stored result for retries", async () => {
  const repo = repository();
  let calls = 0;
  const generator = {
    async generate({ turn }) {
      calls += 1;
      return {
        response: "오늘은 작은 책장 하나부터 세워볼까요?",
        post_conversation_update: updateFor(turn, [{
          path: "relationship_state.trust",
          operation: "add",
          value: 2,
          reason: "재건에 관해 차분히 대화했다.",
        }]),
        memory_candidates: [],
      };
    },
  };
  const runtime = new PersonaRuntime({ repository: repo, generator, maxPromptTokens: 10000 });
  const input = {
    instanceId: "luna_user_123",
    userMessage: "작은 책장부터 다시 만들어보자.",
    conversationId: "conversation_28",
    messageId: "message_430",
    now: new Date("2026-08-20T00:00:00+09:00"),
  };
  const first = await runtime.runTurn(input);
  const retry = await runtime.runTurn(input);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(calls, 1);
  assert.equal(repo.getInstance(input.instanceId).state_revision, 18);
  assert.equal(repo.getInstance(input.instanceId).relationship_state.trust, 80);
});

test("runtime enforces crisis state and blocks relationship reward", async () => {
  const repo = repository();
  const generator = {
    async generate({ turn }) {
      return {
        response: "위험한 물건에서 멀어지고 가까운 사람이나 긴급 서비스에 연락해 주세요.",
        post_conversation_update: updateFor(turn, [{
          path: "relationship_state.reliance",
          operation: "add",
          value: 10,
          reason: "사용자가 위기를 공유했다.",
        }]),
        memory_candidates: [],
      };
    },
  };
  const runtime = new PersonaRuntime({ repository: repo, generator, maxPromptTokens: 10000 });
  const result = await runtime.runTurn({
    instanceId: "luna_user_123",
    userMessage: "지금 칼로 나를 해칠 것 같아.",
    conversationId: "conversation_28",
    messageId: "message_431",
  });
  assert.ok(result.safetyFlags.includes("crisis_imminent"));
  assert.equal(result.instance.safety_state.crisis_risk, "imminent");
  assert.equal(result.instance.relationship_state.reliance, 35);
  assert.deepEqual(result.storedMemoryIds, []);
});

test("runtime stores requested memory candidates and links them to the instance", async () => {
  const repo = repository();
  const candidate = {
    ...structuredClone(memoryFixtures()[1]),
    id: "memory_new_rebuild_step",
    content: "사용자는 다음 재건 단계로 작은 책장을 만들자고 제안했다.",
    source: {
      conversation_id: "conversation_30",
      message_id: "message_450",
      speaker: "user",
    },
    created_at: "2026-08-20T02:00:00+09:00",
    last_recalled_at: null,
    recall_count: 0,
  };
  const generator = {
    async generate({ turn }) {
      return {
        response: "작은 책장부터 시작해요. 첫 칸은 비워 둘까요?",
        post_conversation_update: updateFor(turn, [], [candidate.id]),
        memory_candidates: [candidate],
      };
    },
  };
  const runtime = new PersonaRuntime({ repository: repo, generator, maxPromptTokens: 10000 });
  const result = await runtime.runTurn({
    instanceId: "luna_user_123",
    userMessage: "작은 책장을 먼저 만들자.",
    conversationId: "conversation_30",
    messageId: "message_450",
    now: new Date("2026-08-20T02:00:00+09:00"),
  });
  assert.deepEqual(result.storedMemoryIds, [candidate.id]);
  assert.ok(result.instance.memory_refs.includes(candidate.id));
  assert.equal(repo.getMemory(candidate.id).content, candidate.content);
  for (const memoryId of result.promptStats.includedMemoryIds) {
    assert.ok(repo.getMemory(memoryId).recall_count >= 1);
  }
});

test("generator failure and stale updates do not mutate repository state", async () => {
  const repo = repository();
  const failing = new PersonaRuntime({
    repository: repo,
    generator: { async generate() { throw new Error("model unavailable"); } },
    maxPromptTokens: 10000,
  });
  await assert.rejects(() => failing.runTurn({
    instanceId: "luna_user_123",
    userMessage: "안녕",
    conversationId: "conversation_28",
    messageId: "message_432",
  }), /model unavailable/);
  assert.equal(repo.getInstance("luna_user_123").state_revision, 17);

  const stale = new PersonaRuntime({
    repository: repo,
    generator: {
      async generate({ turn }) {
        const update = updateFor(turn);
        update.base_state_revision = 16;
        return { response: "응답", post_conversation_update: update, memory_candidates: [] };
      },
    },
    maxPromptTokens: 10000,
  });
  await assert.rejects(() => stale.runTurn({
    instanceId: "luna_user_123",
    userMessage: "안녕",
    conversationId: "conversation_28",
    messageId: "message_433",
  }), PersonaValidationError);
  assert.equal(repo.getInstance("luna_user_123").state_revision, 17);
});
