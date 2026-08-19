import test from "node:test";
import assert from "node:assert/strict";
import {
  PersonaValidationError,
  applyEvents,
  evaluateEventExpression,
  eventMatches,
  selectEvents,
} from "../src/index.mjs";
import { eventFixture, instanceFixture } from "./helpers.mjs";

function triggerableInstance() {
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
  return instance;
}

test("event DSL evaluates allowed numeric and contains expressions", () => {
  const instance = triggerableInstance();
  assert.equal(evaluateEventExpression("relationship_state.trust >= 65", instance), true);
  assert.equal(evaluateEventExpression("route_state.active_flags contains user_saw_closed_archive", instance), true);
  assert.equal(evaluateEventExpression("relationship_state.trust < 10", instance), false);
});

test("event DSL rejects unsafe literals and state roots", () => {
  const instance = triggerableInstance();
  assert.throws(
    () => evaluateEventExpression("relationship_state.trust == 1; process.exit()", instance),
    PersonaValidationError,
  );
  assert.throws(() => evaluateEventExpression("constructor.prototype == unsafe", instance), PersonaValidationError);
});

test("once-per-instance event transitions and applies effects only once", () => {
  const event = eventFixture();
  const instance = triggerableInstance();
  assert.equal(eventMatches(event, instance), true);
  const selected = selectEvents([event], instance);
  const changed = applyEvents(instance, selected);
  assert.equal(changed.route_state.current_route, "collapse_arc");
  assert.equal(changed.world_overrides.moonlight_library.status, "collapsed");
  assert.equal(changed.psychological_state.grief, 82);
  assert.equal(changed.psychological_state.self_blame, 96);
  assert.equal(changed.psychological_state.hopefulness, 13);
  assert.equal(eventMatches(event, changed), false);
  assert.equal(selectEvents([event], changed).length, 0);
});

test("conflicting events select the highest priority deterministically", () => {
  const instance = triggerableInstance();
  const event = eventFixture();
  const lower = structuredClone(event);
  lower.id = "alternate_library_fate";
  lower.priority = event.priority - 1;
  const selected = selectEvents([lower, event], instance);
  assert.deepEqual(selected.map((item) => item.id), [event.id]);
});
