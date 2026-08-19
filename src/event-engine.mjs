import { PersonaValidationError } from "./errors.mjs";
import { getPath, setPath } from "./object-path.mjs";

const expressionPattern = /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\s+(==|!=|>=|<=|>|<|contains)\s+(.+)$/;
const allowedRoots = new Set([
  "route_state",
  "psychological_state",
  "relationship_state",
  "momentary_state",
  "safety_state",
  "world_overrides",
  "time_context",
]);

function parseLiteral(raw) {
  const value = raw.trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (!/^[A-Za-z0-9_:+.-]+$/.test(value)) {
    throw new PersonaValidationError(`Invalid event literal: ${raw}`);
  }
  return value;
}

export function parseEventExpression(expression) {
  const match = expression.match(expressionPattern);
  if (!match) throw new PersonaValidationError(`Invalid event expression: ${expression}`);
  const [, path, operator, rawValue] = match;
  if (!allowedRoots.has(path.split(".")[0])) {
    throw new PersonaValidationError(`Forbidden event state root: ${path}`);
  }
  return { path, operator, expected: parseLiteral(rawValue) };
}

export function evaluateEventExpression(expression, state) {
  const { path, operator, expected } = parseEventExpression(expression);
  const actual = getPath(state, path);
  switch (operator) {
    case "==": return actual === expected;
    case "!=": return actual !== expected;
    case ">": return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case ">=": return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "<": return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "<=": return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "contains": return (Array.isArray(actual) || typeof actual === "string") && actual.includes(expected);
    default: throw new PersonaValidationError(`Unsupported event operator: ${operator}`);
  }
}

export function eventMatches(definition, instance) {
  if (definition.once_per_instance && instance.route_state.completed_events.includes(definition.id)) return false;
  const transition = definition.effects.route_transition;
  if (transition && transition.from !== instance.route_state.current_route) return false;
  if (definition.trigger.none.some((item) => evaluateEventExpression(item, instance))) return false;
  if (!definition.trigger.all.every((item) => evaluateEventExpression(item, instance))) return false;
  return definition.trigger.any.length === 0
    || definition.trigger.any.some((item) => evaluateEventExpression(item, instance));
}

export function selectEvents(definitions, instance) {
  const candidates = definitions
    .filter((definition) => eventMatches(definition, instance))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const conflictGroups = new Set();
  return candidates.filter((event) => {
    if (!event.conflict_group) return true;
    if (conflictGroups.has(event.conflict_group)) return false;
    conflictGroups.add(event.conflict_group);
    return true;
  });
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function applyEventChange(instance, change) {
  const current = getPath(instance, change.path);
  if (change.operation === "add") {
    if (typeof current !== "number" || typeof change.value !== "number") {
      throw new PersonaValidationError(`Event add requires numeric values at ${change.path}`);
    }
    const next = change.path.startsWith("world_overrides.") ? current + change.value : clampScore(current + change.value);
    setPath(instance, change.path, next);
    return;
  }
  if (change.operation === "set") {
    setPath(instance, change.path, structuredClone(change.value));
    return;
  }
  if (change.operation === "append") {
    if (!Array.isArray(current)) throw new PersonaValidationError(`Event append requires an array at ${change.path}`);
    if (!current.includes(change.value)) current.push(structuredClone(change.value));
    return;
  }
  if (change.operation === "remove") {
    if (!Array.isArray(current)) throw new PersonaValidationError(`Event remove requires an array at ${change.path}`);
    setPath(instance, change.path, current.filter((item) => item !== change.value));
    return;
  }
  throw new PersonaValidationError(`Unsupported event operation: ${change.operation}`);
}

export function applyEvents(instance, definitions) {
  const next = structuredClone(instance);
  for (const definition of definitions) {
    for (const change of definition.effects.state_changes) applyEventChange(next, change);
    for (const flag of definition.effects.add_flags) {
      if (!next.route_state.active_flags.includes(flag)) next.route_state.active_flags.push(flag);
    }
    const transition = definition.effects.route_transition;
    if (transition) next.route_state.current_route = transition.to;
    if (!next.route_state.completed_events.includes(definition.id)) {
      next.route_state.completed_events.push(definition.id);
    }
  }
  return next;
}
