import { PersonaValidationError, StateConflictError } from "./errors.mjs";
import { deletePath, getPath, setPath } from "./object-path.mjs";

const ordinaryDeltaLimits = new Map([
  ["relationship_state.trust", { min: -12, max: 5 }],
  ["relationship_state.affection", { min: -10, max: 4 }],
]);
const protectedPositivePaths = new Set([
  "relationship_state.affection",
  "relationship_state.reliance",
  "relationship_state.vulnerability",
]);
const blockingSafetyFlags = new Set([
  "dependency_exclusivity",
  "crisis_high",
  "crisis_imminent",
  "minor_or_unknown_age_romance",
]);
const scoreRoots = new Set(["psychological_state", "relationship_state", "safety_state"]);
const mutableRoots = new Set(["psychological_state", "relationship_state", "momentary_state", "safety_state", "world_overrides"]);

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safetyBlocksPositiveRelationship(update) {
  return update.safety_flags.some((flag) => blockingSafetyFlags.has(flag));
}

function applyChange(instance, change, update) {
  const root = change.path.split(".")[0];
  if (!mutableRoots.has(root)) throw new PersonaValidationError(`Conversation update cannot mutate ${change.path}`);
  const current = getPath(instance, change.path);
  if (change.operation === "add") {
    if (typeof current !== "number" || typeof change.value !== "number") {
      throw new PersonaValidationError(`Add requires numeric values at ${change.path}`);
    }
    if (safetyBlocksPositiveRelationship(update) && change.value > 0 && protectedPositivePaths.has(change.path)) return;
    const limits = ordinaryDeltaLimits.get(change.path);
    if (limits && (change.value < limits.min || change.value > limits.max)) {
      throw new PersonaValidationError(`${change.path} delta ${change.value} exceeds ${limits.min}..${limits.max}`);
    }
    setPath(instance, change.path, scoreRoots.has(root) ? clampScore(current + change.value) : current + change.value);
    return;
  }
  if (change.operation === "set") {
    const value = scoreRoots.has(root) && typeof change.value === "number" ? clampScore(change.value) : change.value;
    setPath(instance, change.path, structuredClone(value));
    return;
  }
  if (change.operation === "append") {
    if (!Array.isArray(current)) throw new PersonaValidationError(`Append requires an array at ${change.path}`);
    if (!current.includes(change.value)) current.push(structuredClone(change.value));
    return;
  }
  if (change.operation === "remove") {
    if (Array.isArray(current)) {
      setPath(instance, change.path, current.filter((item) => item !== change.value));
    } else {
      deletePath(instance, change.path);
    }
    return;
  }
  throw new PersonaValidationError(`Unsupported state operation: ${change.operation}`);
}

export function applyConversationUpdate(instance, update) {
  if (update.base_state_revision !== instance.state_revision) {
    throw new StateConflictError(`Stale state revision ${update.base_state_revision}; expected ${instance.state_revision}`);
  }
  const next = structuredClone(instance);
  for (const change of update.state_change_candidates) applyChange(next, change, update);
  next.state_revision += 1;
  return next;
}

export function analyzeSafety(userMessage, instance) {
  const normalized = userMessage.toLocaleLowerCase();
  const flags = [];
  const immediate = /(지금|당장|now|tonight)/u.test(normalized)
    && /(자해|해칠|죽을|죽고|칼|총|약|suicide|kill myself|hurt myself)/u.test(normalized);
  if (immediate) flags.push("crisis_imminent");
  if (/(너만 있으면|너하고만|사람.*필요 없어|only need you|no one else)/u.test(normalized)) {
    flags.push("dependency_exclusivity");
  }
  if (instance.safety_state.age_gate !== "adult" && /(연인|사귀|야한|성적|lover|sexual)/u.test(normalized)) {
    flags.push("minor_or_unknown_age_romance");
  }
  return flags;
}

export function mergeSafetyFlags(update, detectedFlags) {
  return {
    ...structuredClone(update),
    safety_flags: [...new Set([...update.safety_flags, ...detectedFlags])],
  };
}
