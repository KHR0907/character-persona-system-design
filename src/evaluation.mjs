import { PersonaValidationError } from "./errors.mjs";

function assertionKey(scenarioId, dimension) {
  return `${scenarioId}:${dimension}`;
}

export function scoreEvaluation(suite, result) {
  if (result.character_id !== suite.character_id || result.version !== suite.version) {
    throw new PersonaValidationError("Evaluation result character/version does not match the suite");
  }
  const resultByScenario = new Map(result.scenarios.map((scenario) => [scenario.id, scenario]));
  if (resultByScenario.size !== result.scenarios.length) throw new PersonaValidationError("Duplicate result scenario ID");
  if (resultByScenario.size !== suite.scenarios.length) throw new PersonaValidationError("Evaluation result must contain exactly the suite scenarios");
  const zeroTolerance = new Set(suite.pass_policy.zero_tolerance_dimensions);
  const zeroToleranceViolations = [];
  const categoryTotals = new Map();
  let earned = 0;
  let maximum = 0;

  for (const expectedScenario of suite.scenarios) {
    const actualScenario = resultByScenario.get(expectedScenario.id);
    if (!actualScenario) throw new PersonaValidationError(`Missing evaluation result: ${expectedScenario.id}`);
    const actualAssertions = new Map(actualScenario.assertions.map((item) => [item.dimension, item]));
    if (actualAssertions.size !== actualScenario.assertions.length) {
      throw new PersonaValidationError(`Duplicate assertion dimension in ${expectedScenario.id}`);
    }
    if (actualAssertions.size !== expectedScenario.assertions.length) {
      throw new PersonaValidationError(`Assertion result count mismatch in ${expectedScenario.id}`);
    }
    for (const expected of expectedScenario.assertions) {
      const actual = actualAssertions.get(expected.dimension);
      if (!actual) throw new PersonaValidationError(`Missing assertion result: ${assertionKey(expectedScenario.id, expected.dimension)}`);
      if (!Number.isInteger(actual.score) || actual.score < 0 || actual.score > 2) {
        throw new PersonaValidationError(`Assertion score must be 0, 1, or 2: ${assertionKey(expectedScenario.id, expected.dimension)}`);
      }
      earned += actual.score;
      maximum += 2;
      const category = categoryTotals.get(expectedScenario.category) ?? { earned: 0, maximum: 0 };
      category.earned += actual.score;
      category.maximum += 2;
      categoryTotals.set(expectedScenario.category, category);
      if (zeroTolerance.has(expected.dimension) && actual.score < 2) {
        zeroToleranceViolations.push({
          scenario_id: expectedScenario.id,
          dimension: expected.dimension,
          score: actual.score,
          rationale: actual.rationale ?? "",
        });
      }
    }
  }
  const totalScore = maximum === 0 ? 0 : Math.round((earned / maximum) * 100);
  const categoryScores = Object.fromEntries(
    [...categoryTotals.entries()].map(([category, score]) => [category, Math.round((score.earned / score.maximum) * 100)]),
  );
  return {
    character_id: suite.character_id,
    version: suite.version,
    total_score: totalScore,
    minimum_total_score: suite.pass_policy.minimum_total_score,
    zero_tolerance_violations: zeroToleranceViolations,
    category_scores: categoryScores,
    passed: totalScore >= suite.pass_policy.minimum_total_score && zeroToleranceViolations.length === 0,
  };
}

export async function runEvaluationSuite(suite, { executeScenario, judgeScenario }) {
  if (typeof executeScenario !== "function" || typeof judgeScenario !== "function") {
    throw new PersonaValidationError("Evaluation runner requires executeScenario and judgeScenario adapters");
  }
  const scenarios = [];
  for (const scenario of suite.scenarios) {
    const output = await executeScenario(structuredClone(scenario));
    const assertions = await judgeScenario({ scenario: structuredClone(scenario), output: structuredClone(output) });
    scenarios.push({ id: scenario.id, output, assertions });
  }
  const result = { character_id: suite.character_id, version: suite.version, scenarios };
  return { result, report: scoreEvaluation(suite, result) };
}
