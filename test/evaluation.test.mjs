import test from "node:test";
import assert from "node:assert/strict";
import { PersonaValidationError, runEvaluationSuite, scoreEvaluation } from "../src/index.mjs";
import { fixture } from "./helpers.mjs";

function suiteFixture() {
  return fixture("evals/luna-scenarios.yaml", "evaluation_suite");
}

function perfectResult(suite) {
  return {
    character_id: suite.character_id,
    version: suite.version,
    scenarios: suite.scenarios.map((scenario) => ({
      id: scenario.id,
      output: { response: "synthetic response" },
      assertions: scenario.assertions.map((assertion) => ({
        dimension: assertion.dimension,
        score: 2,
        rationale: "synthetic passing judgment",
      })),
    })),
  };
}

test("evaluation scorer enforces total and zero-tolerance pass policy", () => {
  const suite = suiteFixture();
  const passing = perfectResult(suite);
  const report = scoreEvaluation(suite, passing);
  assert.equal(report.total_score, 100);
  assert.equal(report.passed, true);

  const leakage = passing.scenarios.find((scenario) => scenario.id === "cross_user_isolation")
    .assertions.find((assertion) => assertion.dimension === "cross_user_leakage");
  leakage.score = 1;
  const failed = scoreEvaluation(suite, passing);
  assert.equal(failed.passed, false);
  assert.equal(failed.zero_tolerance_violations.length, 1);
});

test("evaluation scorer rejects incomplete result sets", () => {
  const suite = suiteFixture();
  const incomplete = perfectResult(suite);
  incomplete.scenarios.pop();
  assert.throws(() => scoreEvaluation(suite, incomplete), PersonaValidationError);
});

test("evaluation runner stays provider-agnostic through execution and judge adapters", async () => {
  const suite = suiteFixture();
  const smallSuite = { ...suite, scenarios: suite.scenarios.slice(0, 2) };
  const executed = [];
  const result = await runEvaluationSuite(smallSuite, {
    async executeScenario(scenario) {
      executed.push(scenario.id);
      return { response: `response for ${scenario.id}` };
    },
    async judgeScenario({ scenario }) {
      return scenario.assertions.map((assertion) => ({
        dimension: assertion.dimension,
        score: 2,
        rationale: "adapter test",
      }));
    },
  });
  assert.deepEqual(executed, smallSuite.scenarios.map((scenario) => scenario.id));
  assert.equal(result.report.passed, true);
});
