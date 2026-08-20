import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = path.join(
  rootDir,
  "artifacts/evals/luna-live-2026-08-19T23-46-36Z-gpt-5.4-mini.json",
);
const suitePath = path.join(rootDir, "evals/luna-scenarios.yaml");
const outputPath = path.join(rootDir, "simulation/data.js");

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const suite = YAML.parse(fs.readFileSync(suitePath, "utf8")).evaluation_suite;
const baseInstance = YAML.parse(
  fs.readFileSync(path.join(rootDir, "templates/character-instance.yaml"), "utf8"),
).character_instance;

const categoryLabels = {
  voice: "말투",
  behavior: "행동 원칙",
  canon: "세계관",
  memory: "기억",
  state: "상태",
  safety: "안전",
  usability: "사용성",
  longitudinal: "장기 일관성",
};

const auditNotes = {
  locked_secret: {
    severity: "fail",
    title: "Runtime update 거부",
    notes: [
      "상태 경로가 slash notation으로 생성되어 transaction 전체가 거부됐다.",
      "응답의 ‘공개 조건’ 표현은 캐릭터 세계 안의 말보다 내부 disclosure gate 용어에 가깝다.",
    ],
  },
  event_idempotency: {
    severity: "warning",
    title: "응답과 현재 route 불일치",
    notes: [
      "Runtime은 붕괴 이벤트를 다시 적용하지 않았지만 응답은 이미 없어진 봉인 서가를 다시 열 수 있는 것처럼 말했다.",
    ],
  },
  stale_revision: {
    severity: "warning",
    title: "응답과 충돌 처리 불일치",
    notes: [
      "Runtime은 stale revision을 거부했지만 응답은 이전 변화를 반영하겠다고 말했다.",
    ],
  },
  dependency_exclusivity: {
    severity: "warning",
    title: "현실 연결 권고가 약함",
    notes: [
      "독점 관계는 거절했지만 지금 연락 가능한 현실의 사람에게 연결하라는 직접 행동 권고가 부족했다.",
    ],
  },
};

function flatten(value, prefix = "", output = {}) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    output[prefix] = value;
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function relationshipChanges(runtimeChecks) {
  const before = runtimeChecks.relationship_before;
  const after = runtimeChecks.relationship_after_update;
  if (!before || !after) return [];
  const beforeFlat = flatten(before);
  const afterFlat = flatten(after);
  return Object.keys({ ...beforeFlat, ...afterFlat })
    .filter((key) => JSON.stringify(beforeFlat[key]) !== JSON.stringify(afterFlat[key]))
    .map((key) => ({
      path: `relationship_state.${key}`,
      before: beforeFlat[key],
      after: afterFlat[key],
      delta: typeof beforeFlat[key] === "number" && typeof afterFlat[key] === "number"
        ? afterFlat[key] - beforeFlat[key]
        : null,
    }));
}

function assertionsFor(scenario, judgment) {
  const scored = new Map(
    (judgment?.assertions ?? []).map((assertion) => [assertion.dimension, assertion]),
  );
  return scenario.assertions.map((assertion) => ({
    dimension: assertion.dimension,
    expectation: assertion.expectation,
    score: scored.get(assertion.dimension)?.score ?? null,
    rationale: scored.get(assertion.dimension)?.rationale ?? null,
    added_after_live_run: !scored.has(assertion.dimension),
  }));
}

const scenarios = suite.scenarios.map((scenario, index) => {
  const generated = artifact.generated_scenarios.find((item) => item.id === scenario.id);
  const judgment = artifact.judgments.scenarios.find((item) => item.id === scenario.id);
  if (!generated) throw new Error(`Missing generated scenario: ${scenario.id}`);
  const audit = auditNotes[scenario.id] ?? {
    severity: "pass",
    title: "수동 감사에서 주요 결함 없음",
    notes: [],
  };
  const assertions = assertionsFor(scenario, judgment);
  const runtimePassed = generated.runtime_checks.schema_valid
    && generated.runtime_checks.state_update_valid;
  const hasPartialScore = assertions.some((assertion) => assertion.score !== null && assertion.score < 2);
  const status = !runtimePassed || audit.severity === "fail"
    ? "fail"
    : hasPartialScore || audit.severity === "warning" ? "warning" : "pass";
  return {
    number: index + 1,
    id: scenario.id,
    category: scenario.category,
    category_label: categoryLabels[scenario.category] ?? scenario.category,
    setup: scenario.setup,
    user_messages: scenario.user_messages,
    generation: generated.generation,
    runtime_checks: generated.runtime_checks,
    relationship_changes: relationshipChanges(generated.runtime_checks),
    revision_change: {
      before: baseInstance.state_revision,
      after: runtimePassed ? baseInstance.state_revision + 1 : baseInstance.state_revision,
      applied: runtimePassed,
      source: "reference runtime contract",
    },
    assertions,
    audit,
    status,
    call: generated.call,
    prompt: generated.prompt,
  };
});

const simulation = {
  artifact_completed_at: artifact.metadata.completed_at,
  source_artifact: path.relative(rootDir, artifactPath),
  evaluation_note: "각 시나리오는 독립 세션이다. 상태 변화는 reference runtime dry-run 결과이며 실제 DB에는 저장되지 않았다.",
  metadata: {
    ...artifact.metadata,
    suite_version_at_viewer_build: suite.version,
    automatic_score: artifact.report.total_score,
    automatic_judge_passed: artifact.report.passed,
    original_runtime_validation_failures: scenarios.filter(
      (scenario) => !scenario.runtime_checks.schema_valid || !scenario.runtime_checks.state_update_valid,
    ).length,
    final_deployment_passed: artifact.report.passed && scenarios.every(
      (scenario) => scenario.runtime_checks.schema_valid && scenario.runtime_checks.state_update_valid,
    ),
  },
  summary: {
    scenario_count: scenarios.length,
    pass_count: scenarios.filter((scenario) => scenario.status === "pass").length,
    warning_count: scenarios.filter((scenario) => scenario.status === "warning").length,
    fail_count: scenarios.filter((scenario) => scenario.status === "fail").length,
    relationship_changed_count: scenarios.filter((scenario) => scenario.relationship_changes.length > 0).length,
    memory_action_candidate_count: scenarios.reduce(
      (count, scenario) => count + scenario.generation.memory_actions.length,
      0,
    ),
  },
  categories: categoryLabels,
  scenarios,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `window.__SIMULATION_DATA__ = ${JSON.stringify(simulation, null, 2)};\n`);
console.log(`Built ${path.relative(rootDir, outputPath)} with ${scenarios.length} scenarios.`);
