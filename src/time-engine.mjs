import { PersonaValidationError } from "./errors.mjs";
import { getPath, setPath } from "./object-path.mjs";

const hourMs = 3_600_000;

export function applyTimeEvolution(instance, template, now = new Date()) {
  const lastInteraction = new Date(instance.time_context.last_interaction_at);
  if (Number.isNaN(lastInteraction.getTime()) || Number.isNaN(now.getTime())) {
    throw new PersonaValidationError("Invalid time context");
  }
  if (now.getTime() < lastInteraction.getTime()) {
    throw new PersonaValidationError("Turn time cannot precede last_interaction_at");
  }
  const elapsedHours = (now.getTime() - lastInteraction.getTime()) / hourMs;
  const next = structuredClone(instance);
  const applied = [];
  const policy = template.state_evolution;

  if (elapsedHours >= policy.momentary_reset_after_hours) {
    next.momentary_state.current_trigger = null;
    applied.push({ path: "momentary_state.current_trigger", operation: "set", value: null });
  }
  const paths = new Set();
  for (const rule of policy.decay_rules) {
    if (paths.has(rule.path)) throw new PersonaValidationError(`Duplicate time rule path: ${rule.path}`);
    paths.add(rule.path);
    if (rule.floor > rule.ceiling) throw new PersonaValidationError(`Time rule floor exceeds ceiling: ${rule.path}`);
    if (elapsedHours < rule.grace_period_hours) continue;
    const intervals = Math.min(
      rule.max_intervals_per_turn,
      Math.floor((elapsedHours - rule.grace_period_hours) / rule.interval_hours) + 1,
    );
    const current = getPath(next, rule.path);
    if (typeof current !== "number") throw new PersonaValidationError(`Time rule path is not numeric: ${rule.path}`);
    const value = Math.max(rule.floor, Math.min(rule.ceiling, current + intervals * rule.delta_per_interval));
    if (value !== current) {
      setPath(next, rule.path, value);
      applied.push({ path: rule.path, operation: "set", value, intervals });
    }
  }
  return { instance: next, elapsedHours, applied };
}
