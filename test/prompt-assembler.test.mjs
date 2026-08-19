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
