import test from "node:test";
import assert from "node:assert/strict";
import { PersonaValidationError, applyTimeEvolution } from "../src/index.mjs";
import { instanceFixture, templateFixture } from "./helpers.mjs";

test("time evolution applies explicit template rules without decaying relationships", () => {
  const instance = instanceFixture();
  const result = applyTimeEvolution(instance, templateFixture(), new Date("2026-09-18T09:00:00+09:00"));
  assert.equal(result.instance.psychological_state.grief, 34);
  assert.equal(result.instance.psychological_state.self_blame, 57);
  assert.equal(result.instance.psychological_state.hopefulness, 41);
  assert.equal(result.instance.relationship_state.trust, instance.relationship_state.trust);
  assert.equal(result.instance.momentary_state.current_trigger, null);
  assert.ok(result.applied.length >= 4);
});

test("time evolution respects grace periods and rejects clock rollback", () => {
  const instance = instanceFixture();
  const noDecay = applyTimeEvolution(instance, templateFixture(), new Date("2026-08-19T10:00:00+09:00"));
  assert.equal(noDecay.applied.length, 0);
  assert.deepEqual(noDecay.instance, instance);
  assert.throws(
    () => applyTimeEvolution(instance, templateFixture(), new Date("2026-08-19T08:00:00+09:00")),
    PersonaValidationError,
  );
});

test("time evolution rejects conflicting or inverted rules", () => {
  const instance = instanceFixture();
  const template = templateFixture();
  template.state_evolution.decay_rules.push(structuredClone(template.state_evolution.decay_rules[0]));
  assert.throws(
    () => applyTimeEvolution(instance, template, new Date("2026-09-18T09:00:00+09:00")),
    /Duplicate time rule path/,
  );
  const inverted = templateFixture();
  inverted.state_evolution.decay_rules[0].floor = 90;
  inverted.state_evolution.decay_rules[0].ceiling = 10;
  assert.throws(
    () => applyTimeEvolution(instance, inverted, new Date("2026-09-18T09:00:00+09:00")),
    /floor exceeds ceiling/,
  );
});
