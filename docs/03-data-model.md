# Data Model

## 주요 테이블/컬렉션

### character_templates

- `id`
- `version`
- `core_identity`
- `stable_personality`
- `speech_style`
- `values`
- `habits`
- `defense_mechanisms`
- `global_world`
- `possible_arcs`
- `safety_boundaries`
- `created_at`
- `updated_at`

### character_instances

- `id`
- `user_id`
- `character_id`
- `template_version`
- `route_state`
- `world_overrides`
- `adaptive_state`
- `relationship_identity`
- `momentary_state`
- `created_at`
- `updated_at`

### relationship_states

- `id`
- `user_id`
- `character_id`
- `trust`
- `affection`
- `familiarity`
- `vulnerability`
- `reliance`
- `conflict`
- `disappointment`
- `gratitude`
- `protectiveness`
- `curiosity_about_user`
- `current_label`

### memories

- `id`
- `user_id`
- `character_id`
- `type`
- `content`
- `importance`
- `emotional_valence`
- `related_values`
- `decay_policy`
- `source_conversation_id`
- `created_at`
- `last_recalled_at`

Memory types:

```yaml
memory_types:
  - factual_memory
  - emotional_memory
  - relational_memory
  - story_memory
  - unresolved_thread
```

### event_logs

- `id`
- `user_id`
- `character_id`
- `event_id`
- `severity`
- `scope`
- `trigger_context`
- `immediate_reaction`
- `short_term_effect`
- `long_term_effect`
- `created_at`

### route_states

- `id`
- `user_id`
- `character_id`
- `current_route`
- `completed_events`
- `active_flags`
- `locked_flags`
- `available_next_routes`

### conversation_summaries

- `id`
- `user_id`
- `character_id`
- `summary`
- `detected_user_signals`
- `character_reaction`
- `state_deltas`
- `memory_candidates`
- `created_at`

## Relationship State Example

```yaml
relationship_state:
  trust: 72
  affection: 61
  familiarity: 80
  vulnerability: 54
  reliance: 35
  conflict: 12
  disappointment: 8
  gratitude: 47
  protectiveness: 52
  curiosity_about_user: 68
```

## Change Constraints

```yaml
change_constraints:
  trust:
    max_increase_per_conversation: 5
    max_decrease_per_conversation: 12
  affection:
    max_increase_per_conversation: 4
    requires:
      - repeated_positive_interactions
      - emotional_safety
      - shared_vulnerability
  personality_drift:
    max_change_per_major_arc: 15
    requires:
      - major_event
      - repeated_reinforcement
      - time_passed
```
