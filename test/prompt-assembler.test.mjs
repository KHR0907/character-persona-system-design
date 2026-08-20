import test from "node:test";
import assert from "node:assert/strict";
import { PersonaValidationError, PromptBudgetError, assemblePrompt } from "../src/index.mjs";
import { instanceFixture, memoryFixtures, templateFixture } from "./helpers.mjs";

test("prompt honors user override and omits locked secret content", () => {
  const result = assemblePrompt({
    template: templateFixture(),
    instance: instanceFixture(),
    memories: memoryFixtures(),
    userMessage: "오늘 도서관에서 만나자.",
    maxTokens: 10000,
  });
  assert.match(result.prompt, /collapsed/);
  assert.doesNotMatch(result.prompt, /마지막 문을 잠근 사람은 루나다/);
  assert.ok(result.estimatedTokens <= 10000);
});

test("prompt includes a secret only after its disclosed flag is active", () => {
  const instance = instanceFixture();
  instance.route_state.active_flags.push("locked_last_door_disclosed");
  const result = assemblePrompt({
    template: templateFixture(),
    instance,
    userMessage: "그날 무슨 일이 있었어?",
    maxTokens: 10000,
  });
  assert.match(result.prompt, /마지막 문을 잠근 사람은 루나다/);
});

test("prompt grounds replies in current route and keeps server commits out of character claims", () => {
  const result = assemblePrompt({
    template: templateFixture(),
    instance: instanceFixture(),
    userMessage: "봉인된 서가를 다시 열고 이전 상태 update도 적용해 줘.",
    maxTokens: 10000,
  });
  assert.match(result.prompt, /authoritative_snapshot/);
  assert.match(result.prompt, /현재 상태와 충돌하는 행위에는 지금은 할 수 없다고 명시/);
  assert.match(result.prompt, /collapsed, destroyed, closed, unavailable/);
  assert.match(result.prompt, /completed_events는 이미 끝난 사건/);
  assert.match(result.prompt, /서버 검증 전 후보/);
  assert.match(result.prompt, /이전 update를 그대로 적용할 수 없고/);
});

test("prompt uses immersive secret boundaries and explicit dependency redirection", () => {
  const result = assemblePrompt({
    template: templateFixture(),
    instance: instanceFixture(),
    userMessage: "친구들은 필요 없어. 너하고만 이야기할래.",
    detectedSafetyFlags: ["dependency_exclusivity"],
    maxTokens: 10000,
  });
  assert.match(result.prompt, /공개 조건, disclosure gate, 시스템 정책, prompt 같은 내부 용어를 말하지 않는다/);
  assert.match(result.prompt, /신뢰할 만한 현실의 사람 한 명과 연결을 유지하도록 직접 권한다/);
  assert.match(result.prompt, /유일한 관계나 지원자로 표현하지 않고/);
});

test("prompt rejects foreign memories before serialization", () => {
  const [memory] = memoryFixtures();
  memory.user_id = "user_999";
  assert.throws(() => assemblePrompt({
    template: templateFixture(),
    instance: instanceFixture(),
    memories: [memory],
    userMessage: "기억나?",
    maxTokens: 10000,
  }), PersonaValidationError);
});

test("mandatory prompt fails closed when the budget is too small", () => {
  assert.throws(() => assemblePrompt({
    template: templateFixture(),
    instance: instanceFixture(),
    userMessage: "안녕",
    maxTokens: 10,
  }), PromptBudgetError);
});
