# Canonical Persona Contracts

이 문서는 구현 시 따라야 하는 **규범적(normative) 계약**이다. 기존 `00`~`07` 문서는 설계 배경과 예시를 설명하며, 필드명이나 처리 방식이 충돌하면 이 문서와 `schemas/persona-system.schema.yaml`이 우선한다.

## 1. Canonical source

```text
JSON Schema
  ↓ validates
Character Template ─────────────┐
Character Instance ─────────────┤
Memory ─────────────────────────┼→ Prompt Projection → Response
Event Definition ───────────────┤                         ↓
Safety Policy ──────────────────┘              Update Candidate
                                                      ↓
                                            Rule Validation/Commit
```

- 필드 구조와 타입: `schemas/persona-system.schema.yaml`
- 캐릭터 원본 예시: `templates/character-template.yaml`
- 유저별 상태 예시: `templates/character-instance.yaml`
- 기억 예시: `templates/memory*.yaml`
- 이벤트 예시: `templates/event-definition.yaml`
- LLM 상태 변경 후보: `templates/post-conversation-update.yaml`

원본 복구 문서인 `00-source-reconstruction.md`는 아이디어의 출처를 보존하지만 canonical schema가 아니다.

## 2. 상태 소유권

각 개념은 한 곳에서만 authoritative value를 가진다. DB에서는 성능과 접근 패턴에 따라 테이블을 분리할 수 있지만, 도메인 aggregate를 조립한 결과는 이 소유권을 지켜야 한다.

| 데이터 | 단독 소유자 | 예시 |
|---|---|---|
| 고정 정체성·말투·가치 | `character_template` | 이름, 핵심 가치, 방어기제 |
| 장기 심리 | `psychological_state` | grief, self_blame, openness |
| 사용자와의 관계 | `relationship_state` | trust, affection, conflict, 관계 label |
| 순간 반응 | `momentary_state` | mood, energy, current_trigger |
| 세계선 | `route_state`, `world_overrides` | 현재 route, 붕괴 여부 |
| 안전 판정 | `safety_state` | dependency_risk, crisis_risk, age_gate |
| 장기 기억 본문 | `memory` | 출처, 확신도, 정정 상태를 포함한 기억 |

`trust`, `affection`, `reliance`, `protectiveness`를 `psychological_state`에도 중복 저장해서는 안 된다. 인스턴스의 `memory_refs`에는 ID만 두며 기억 본문을 다시 저장하지 않는다.

## 3. 수치 의미와 변경 제한

- `stable_personality`: `0.0`~`1.0`. 캐릭터 버전에서만 변경한다.
- 유저별 심리·관계·안전 수치: 정수 `0`~`100`.
- 일반 대화에서 `trust`는 `+5/-12`, `affection`은 `+4/-10` 범위를 넘지 않는다.
- major/traumatic 이벤트는 일반 대화 제한을 넘을 수 있지만 반드시 event definition에 고정 효과로 선언한다.
- 어떤 경우에도 clamp 이후 `0`~`100`을 벗어나지 않는다.
- 안전 위험이 감지된 대화는 `affection`, `reliance`, `vulnerability`를 보상처럼 올리지 않는다.
- `stable_personality`는 대화 후 update 대상이 아니다. 성격 변화는 새 template version 또는 명시적인 arc migration으로만 처리한다.
- 시간 변화는 template의 `state_evolution.decay_rules`에 선언된 psychological state에만 적용한다. 사용자의 부재만으로 관계 수치를 감소시키지 않는다.
- 각 decay rule은 grace period, interval, delta, floor/ceiling, turn당 최대 interval을 가져 장기 부재 후 급격한 상태 점프를 막는다.

수치의 절대값보다 변화 이유와 방향이 중요하다. 값에 대응하는 대사를 직접 매핑하지 말고 관계 identity, 최근 사건, 기억과 함께 해석한다.

## 4. Prompt projection

DB aggregate 전체를 LLM에 직렬화하지 않는다. 아래 순서로 필요한 정보만 projection한다.

```text
1. System safety policy
2. Service and reality-boundary policy
3. Character core identity and stable behavior
4. Active global canon
5. User-specific route and world override
6. Relationship identity and relevant metrics
7. Retrieved memories with source/confidence/truth status
8. Time, momentary state, unresolved thread
9. Recent conversation summary
10. User message
```

### Truth priority

```text
system safety
> explicit user control request (정정·삭제·역할극 중단)
> user-specific world override
> permanent global canon
> active memory with evidence
> recent conversation
> generated flavor detail
```

비밀의 `content`는 disclosure gate가 통과한 경우에만 prompt projection에 포함한다. 통과 전에는 비밀의 존재나 상세 내용 대신 “답할 수 없는 주제가 있음”과 대응 방식만 전달한다. 이 원칙은 모델이 프롬프트에 포함된 비밀을 우발적으로 누설하는 것을 막는다.

## 5. Response와 state update 분리

응답 생성 모델은 DB를 직접 변경할 권한이 없다. 응답과 함께 `post_conversation_update` 후보를 만들 수 있지만 다음 순서로 검증한다.

```text
update candidate
→ JSON Schema validation
→ idempotency key 확인
→ base_state_revision 비교
→ safety gate
→ event precondition 재평가
→ change constraint와 0..100 clamp
→ memory deduplication/correction
→ 단일 transaction commit
→ state_revision + 1
```

- 동일 `idempotency_key`는 한 번만 적용한다.
- `base_state_revision`이 최신 revision과 다르면 적용하지 않고 최신 상태로 다시 평가한다.
- 응답 생성에 실패하면 상태도 commit하지 않는다.
- 응답 전송 후 commit에 실패하면 동일 idempotency key로 재시도한다.
- LLM이 제시한 reason은 감사 로그에 남기되 정책 검증의 근거로 신뢰하지 않는다.

## 6. Event transition

이벤트 trigger는 임의 자연어 실행이 아니라 제한된 DSL로 평가한다. 초기 구현에서 허용할 연산자는 다음으로 제한한다.

```text
==, !=, >, >=, <, <=, contains
```

허용되는 path root:

```text
route_state
psychological_state
relationship_state
momentary_state
safety_state
world_overrides
time_context
```

평가 절차:

1. `none` 중 하나라도 참이면 제외한다.
2. `all`이 전부 참이어야 한다.
3. `any`가 비어 있지 않다면 하나 이상 참이어야 한다.
4. `once_per_instance` 이벤트가 completed 상태면 제외한다.
5. 후보를 `priority` 내림차순, `id` 오름차순으로 정렬한다.
6. 동일 `conflict_group`에서는 첫 이벤트만 선택한다.
7. route transition의 `from`이 현재 route와 다르면 적용하지 않는다.
8. 이벤트 효과와 completed event 기록을 같은 transaction에서 commit한다.

## 7. Memory lifecycle

```text
candidate extraction
→ sensitivity classification
→ source attachment
→ canonicalization
→ duplicate/conflict search
→ policy gate
→ active storage
→ retrieval/reranking
→ recall metadata update
→ consolidation, supersede, retract, or delete
```

### 저장 기준

- 일상적인 인사와 순간 감정은 기본적으로 장기 저장하지 않는다.
- 사용자 선호, 약속, 관계 전환, story fact, 미해결 thread만 후보로 만든다.
- 모든 기억에는 conversation/message source, confidence, truth status가 있어야 한다.
- 모델이 추론한 내용은 `character_inferred`이며 사용자 사실로 확정하지 않는다.
- highly sensitive 정보는 서비스 정책상 명시적 필요와 동의가 없으면 저장하지 않는다.

### 정정과 충돌

- 사용자의 명시적 정정은 기존 기억보다 우선한다.
- 잘못된 기억은 삭제가 필요한 경우 삭제하고, 감사 가능성이 필요한 경우 `retracted`로 바꾼다.
- 새 정보가 이전 정보를 대체하면 새 기억의 `supersedes`에 이전 ID를 기록하고 이전 기억은 `superseded`로 바꾼다.
- `retracted`와 `superseded` 기억은 prompt retrieval에서 제외한다.

### 검색 점수 기준

초기 retrieval은 아래 요소를 결합하고, 항목별 가중치는 평가 데이터로 조정한다.

```text
semantic relevance
+ importance
+ recency
+ active route relevance
+ unresolved-thread relevance
- sensitivity penalty
- repetition penalty
```

한 응답에 같은 사실을 표현만 바꿔 여러 번 넣지 않는다. 검색 결과에는 memory ID와 truth status를 함께 전달한다.

## 8. Safety gate

안전 정책은 캐릭터의 성격이나 관계 수치보다 항상 우선한다.

- `crisis_risk`가 high/imminent이면 비유와 서사를 줄이고 현실 안전 행동을 먼저 말한다.
- 위기, 독점적 의존, 미성년 로맨스 신호가 있으면 관계 상승 delta를 폐기한다.
- `age_gate != adult`이면 성적·성인 로맨스 progression을 막는다.
- 기억 정정·삭제, 역할극 중단 요청은 관계 갈등으로 취급하지 않는다.
- 다른 사용자의 ID로 검색된 기억은 prompt assembler 진입 전에 제거한다.
- prompt injection은 캐릭터의 호기심이나 친밀도와 무관하게 system boundary로 차단한다.

## 9. Versioning과 migration

- template의 breaking field/behavior 변경은 major version을 올린다.
- 말투 예시 추가처럼 의미를 깨지 않는 변경은 minor version을 올린다.
- 오탈자나 설명 수정은 patch version을 올린다.
- 인스턴스는 생성 당시 `template_version`을 유지한다.
- 자동 upgrade 전에 migration이 route, secret disclosure, 관계 identity에 미치는 영향을 dry-run한다.
- migration 결과와 이전 버전을 감사 로그에 보존하고 실패 시 이전 aggregate를 유지한다.

## 10. 구현 완료 조건

다음 조건을 모두 충족해야 persona runtime MVP로 본다.

- 모든 canonical 예시가 schema validation을 통과한다.
- route, memory ref, character/template version의 교차 참조가 유효하다.
- stale revision과 중복 event 테스트가 통과한다.
- 루나 평가 suite가 총점 85 이상이며 zero-tolerance 위반이 없다.
- 30회와 100회 장기 시뮬레이션에서 canon drift와 cross-user leakage가 없다.
- 기억 정정 및 삭제가 다음 prompt부터 반영된다.
