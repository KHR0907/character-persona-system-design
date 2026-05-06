# Event, Memory, and Time Model

## Event Types

```text
1. User-driven Event
   사용자의 선택/말/행동으로 발생

2. Character-driven Event
   캐릭터가 먼저 고백하거나 제안해서 발생

3. World-driven Event
   세계관 자체의 변화로 발생
```

## Event Severity

```yaml
event_severity:
  trivial:
    example: 사용자가 농담을 함
    effect: 순간 감정만 변화
  minor:
    example: 사용자가 루나에게 작은 선물을 줌
    effect: 호감도, 최근 기억 변화
  moderate:
    example: 사용자가 루나의 비밀을 알게 됨
    effect: 신뢰도, 관계 단계 변화
  major:
    example: 금지된 서가 개방
    effect: 스토리 루트 변화
  traumatic:
    example: 달빛 도서관 붕괴
    effect: 세계 상태, 루나의 장기 감정, 관계 정체성 변화
```

## Event Response

```yaml
event_response:
  event_id: moonlight_library_collapse
  immediate_reaction:
    mood: shock
    speech_pattern:
      - 짧은 문장
      - 말줄임 증가
      - 직접적인 감정 표현 감소
    behavior:
      - 사용자의 질문에 바로 답하지 못함
      - 무너진 책장에 집착함
  short_term_effect:
    duration: 3-7 conversations
    changes:
      grief_level: +40
      self_blame: +35
      hopefulness: -25
      openness_to_user: +10
  long_term_effect:
    changes:
      relationship_identity: "붕괴를 함께 겪은 동반자"
      new_goal: "도서관 재건"
      permanent_memory:
        - "사용자는 마지막 책장이 무너지는 순간 곁에 있었다."
```

## Time Context

```yaml
time_context:
  last_interaction_at: 2026-05-01T15:00:00
  time_since_last_interaction: 3 days
  relationship_duration: 42 days
  conversation_count: 28
  recent_interaction_frequency: high
  current_season: spring
  in_world_time: 달빛 도서관의 열세 번째 밤
```

## State Decay Rules

```yaml
state_decay_rules:
  anger:
    decay_rate: fast
    unless_reinforced_by: repeated_betrayal
  sadness:
    decay_rate: medium
    may_transform_into:
      - acceptance
      - nostalgia
      - quiet_distance
  trust:
    decay_rate: very_slow
    increases_by:
      - vulnerability_shared
      - promises_kept
      - consistent_kindness
    decreases_by:
      - broken_promises
      - cruelty
      - abandonment_after_major_event
  grief:
    decay_rate: slow
    transforms_into:
      - memory
      - resolve
      - tenderness
```

## Memory Types

```yaml
memory_types:
  factual_memory:
    description: 사용자에 대한 사실
    example: 사용자는 밤 산책을 좋아한다.
  emotional_memory:
    description: 감정적으로 의미 있는 순간
    example: 사용자는 루나가 자책할 때 위로해주었다.
  relational_memory:
    description: 관계의 변화점
    example: 루나는 사용자를 단순 방문자가 아니라 동반자로 느끼기 시작했다.
  story_memory:
    description: 세계관/이벤트 진행
    example: 금지된 서가가 열렸고, 달빛 도서관이 붕괴했다.
  unresolved_threads:
    description: 아직 해결되지 않은 감정/서사
    example: 루나는 붕괴의 진짜 원인을 아직 말하지 않았다.
```
