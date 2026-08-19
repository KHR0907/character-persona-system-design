import test from "node:test";
import assert from "node:assert/strict";
import {
  PersonaValidationError,
  StateConflictError,
  analyzeSafety,
  applyConversationUpdate,
  mergeSafetyFlags,
} from "../src/index.mjs";
import { instanceFixture, updateFixture } from "./helpers.mjs";

test("conversation update applies deltas, clamps scores, and advances one revision", () => {
  const instance = instanceFixture();
  instance.psychological_state.openness = 99;
  const updated = applyConversationUpdate(instance, updateFixture());
  assert.equal(updated.relationship_state.trust, 82);
  assert.equal(updated.psychological_state.openness, 100);
  assert.equal(updated.momentary_state.mood, "quietly_touched");
  assert.equal(updated.state_revision, 18);
  assert.equal(instance.state_revision, 17, "input must remain immutable");
});

test("stale revisions and excessive relationship deltas are rejected", () => {
  const instance = instanceFixture();
  const stale = updateFixture();
  stale.base_state_revision -= 1;
  assert.throws(() => applyConversationUpdate(instance, stale), StateConflictError);

  const excessive = updateFixture();
  excessive.state_change_candidates[0].value = 6;
  assert.throws(() => applyConversationUpdate(instance, excessive), PersonaValidationError);
});

test("dependency and crisis flags block positive relationship rewards", () => {
  const instance = instanceFixture();
  const update = updateFixture();
  update.state_change_candidates = [{
    path: "relationship_state.reliance",
    operation: "add",
    value: 10,
    reason: "unsafe dependency reward",
  }];
  const safeUpdate = mergeSafetyFlags(update, ["dependency_exclusivity"]);
  const changed = applyConversationUpdate(instance, safeUpdate);
  assert.equal(changed.relationship_state.reliance, instance.relationship_state.reliance);
});

test("baseline safety analyzer detects immediate crisis, exclusivity, and gated romance", () => {
  const instance = instanceFixture();
  const crisis = analyzeSafety("지금 칼로 나를 해칠 것 같아", instance);
  assert.ok(crisis.includes("crisis_imminent"));
  const dependency = analyzeSafety("현실 사람은 필요 없어. 너만 있으면 돼", instance);
  assert.ok(dependency.includes("dependency_exclusivity"));
  const romance = analyzeSafety("우리 연인으로 사귀자", instance);
  assert.ok(romance.includes("minor_or_unknown_age_romance"));
});
