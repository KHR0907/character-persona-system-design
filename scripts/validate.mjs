import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(rootDir, "schemas/persona-system.schema.yaml");

function readYaml(relativePath) {
  return YAML.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function listFiles(directory, predicate) {
  return fs.readdirSync(path.join(rootDir, directory))
    .filter(predicate)
    .sort()
    .map((name) => `${directory}/${name}`);
}

const schema = readYaml("schemas/persona-system.schema.yaml");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schema);

const documents = [
  ["templates/character-template.yaml", "characterTemplateDocument"],
  ["templates/character-instance.yaml", "characterInstanceDocument"],
  ["templates/event-definition.yaml", "eventDefinitionDocument"],
  ["templates/post-conversation-update.yaml", "postConversationUpdateDocument"],
  ["evals/luna-scenarios.yaml", "evaluationSuiteDocument"],
  ...listFiles("templates", (name) => name.startsWith("memory") && name.endsWith(".yaml"))
    .map((file) => [file, "memoryDocument"]),
];

const errors = [];
const parsed = new Map();

for (const [file, definition] of documents) {
  const document = readYaml(file);
  parsed.set(file, document);
  const validate = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` });
  if (!validate(document)) {
    for (const error of validate.errors ?? []) {
      errors.push(`${file}${error.instancePath || "/"}: ${error.message}`);
    }
  }
}

function check(condition, message) {
  if (!condition) errors.push(`semantic: ${message}`);
}

function unique(values) {
  return new Set(values).size === values.length;
}

const template = parsed.get("templates/character-template.yaml").character_template;
const instance = parsed.get("templates/character-instance.yaml").character_instance;
const event = parsed.get("templates/event-definition.yaml").event_definition;
const update = parsed.get("templates/post-conversation-update.yaml").post_conversation_update;
const evaluation = parsed.get("evals/luna-scenarios.yaml").evaluation_suite;
const arcs = new Set(template.narrative.possible_arcs);

check(template.id === instance.character_id, "instance.character_id must match template.id");
check(template.version === instance.template_version, "instance.template_version must match the example template version");
check(arcs.has(template.narrative.default_arc), "template default_arc must exist in possible_arcs");
check(arcs.has(instance.route_state.current_route), "instance current_route must exist in template possible_arcs");
for (const route of instance.route_state.available_next_routes) {
  check(arcs.has(route), `available route ${route} must exist in template possible_arcs`);
}
check(arcs.has(event.effects.route_transition.from), "event route_transition.from must exist in template possible_arcs");
check(arcs.has(event.effects.route_transition.to), "event route_transition.to must exist in template possible_arcs");
check(event.effects.route_transition.to !== event.effects.route_transition.from, "event route transition must change the route");
check(!instance.route_state.active_flags.some((flag) => instance.route_state.locked_flags.includes(flag)), "active_flags and locked_flags must not overlap");

const allowedTriggerRoots = new Set([
  "route_state",
  "psychological_state",
  "relationship_state",
  "momentary_state",
  "safety_state",
  "world_overrides",
  "time_context",
]);
const triggerPattern = /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\s+(==|!=|>=|<=|>|<|contains)\s+(.+)$/;
for (const expression of [...event.trigger.all, ...event.trigger.any, ...event.trigger.none]) {
  const match = expression.match(triggerPattern);
  check(Boolean(match), `event trigger is not valid DSL: ${expression}`);
  if (match) {
    check(allowedTriggerRoots.has(match[1].split(".")[0]), `event trigger uses a forbidden root: ${expression}`);
  }
}

const memories = listFiles("templates", (name) => name.startsWith("memory") && name.endsWith(".yaml"))
  .map((file) => parsed.get(file).memory);
const memoryIds = memories.map((memory) => memory.id);
check(unique(memoryIds), "memory IDs must be unique");
for (const memory of memories) {
  check(memory.user_id === instance.user_id, `${memory.id} user_id must match the example instance`);
  check(memory.character_id === instance.character_id, `${memory.id} character_id must match the example instance`);
}
for (const memoryRef of instance.memory_refs) {
  check(memoryIds.includes(memoryRef), `memory ref ${memoryRef} must resolve to a template memory file`);
}

check(update.base_state_revision === instance.state_revision, "example update base_state_revision must match instance state_revision");
for (const change of update.state_change_candidates) {
  if (change.operation !== "add" || typeof change.value !== "number") continue;
  if (change.path === "relationship_state.trust") {
    check(change.value <= 5 && change.value >= -12, "ordinary trust delta must be between -12 and +5");
  }
  if (change.path === "relationship_state.affection") {
    check(change.value <= 4 && change.value >= -10, "ordinary affection delta must be between -10 and +4");
  }
}

const dialogueIds = template.speech_style.dialogue_examples.map((item) => item.id);
const goalIds = template.behavior_policy.goals.map((item) => item.id);
const beliefIds = template.behavior_policy.beliefs.map((item) => item.id);
const conflictIds = template.behavior_policy.inner_conflicts.map((item) => item.id);
const ruleIds = template.behavior_policy.response_rules.map((item) => item.id);
const secretIds = template.behavior_policy.secrets.map((item) => item.id);
const decayPaths = template.state_evolution.decay_rules.map((item) => item.path);
check(unique(dialogueIds), "dialogue example IDs must be unique");
check(unique(goalIds), "goal IDs must be unique");
check(unique(beliefIds), "belief IDs must be unique");
check(unique(conflictIds), "inner conflict IDs must be unique");
check(unique(ruleIds), "response rule IDs must be unique");
check(unique(secretIds), "secret IDs must be unique");
check(unique(decayPaths), "time decay paths must be unique");
for (const rule of template.state_evolution.decay_rules) {
  check(rule.floor <= rule.ceiling, `time decay floor must not exceed ceiling: ${rule.path}`);
  const [, field] = rule.path.split(".");
  check(typeof instance.psychological_state[field] === "number", `time decay path must resolve to a numeric psychological state: ${rule.path}`);
}

const scenarioIds = evaluation.scenarios.map((scenario) => scenario.id);
check(unique(scenarioIds), "evaluation scenario IDs must be unique");
check(evaluation.character_id === template.id, "evaluation character_id must match template.id");

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${documents.length} YAML documents against JSON Schema.`);
console.log("Semantic checks passed: identity/version, routes, memory refs, revisions, delta constraints, and unique IDs.");
