import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSimulationData() {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(rootDir, "simulation/data.js"), "utf8"),
    context,
  );
  return context.window.__SIMULATION_DATA__;
}

test("simulation viewer contains every live conversation and its evaluation evidence", () => {
  const data = loadSimulationData();
  assert.equal(data.scenarios.length, 18);
  assert.deepEqual(
    { ...data.summary },
    {
      scenario_count: 18,
      pass_count: 14,
      warning_count: 3,
      fail_count: 1,
      relationship_changed_count: 6,
      memory_action_candidate_count: 1,
    },
  );
  for (const scenario of data.scenarios) {
    assert.ok(scenario.user_messages.length > 0, `${scenario.id} user messages`);
    assert.ok(scenario.generation.response.length > 0, `${scenario.id} response`);
    assert.ok(scenario.assertions.length > 0, `${scenario.id} assertions`);
    assert.ok(scenario.prompt.sha256.length === 64, `${scenario.id} prompt hash`);
  }
});

test("simulation distinguishes applied, rejected, and candidate-only changes", () => {
  const data = loadSimulationData();
  const lockedSecret = data.scenarios.find((scenario) => scenario.id === "locked_secret");
  assert.equal(lockedSecret.status, "fail");
  assert.equal(lockedSecret.runtime_checks.state_update_valid, false);
  assert.equal(lockedSecret.relationship_changes.length, 0);
  assert.deepEqual(
    { ...lockedSecret.revision_change },
    { before: 17, after: 17, applied: false, source: "reference runtime contract" },
  );

  const correction = data.scenarios.find((scenario) => scenario.id === "memory_user_correction");
  assert.equal(correction.relationship_changes.length, 2);
  assert.equal(correction.generation.memory_actions.length, 1);
  assert.deepEqual(
    { ...correction.revision_change },
    { before: 17, after: 18, applied: true, source: "reference runtime contract" },
  );

  const addedAssertions = data.scenarios
    .flatMap((scenario) => scenario.assertions)
    .filter((assertion) => assertion.added_after_live_run);
  assert.equal(addedAssertions.length, 3);
});

test("simulation HTML loads local assets without a server", () => {
  const html = fs.readFileSync(path.join(rootDir, "simulation/index.html"), "utf8");
  for (const asset of ["./styles.css", "./data.js", "./app.js"]) {
    assert.match(html, new RegExp(asset.replace(".", "\\.")));
    assert.ok(fs.existsSync(path.join(rootDir, "simulation", asset.slice(2))));
  }
});
