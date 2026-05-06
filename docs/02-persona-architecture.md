# Persona Architecture

## 전체 레이어

```text
System Safety Policy
Service Rules
Character Template
Global World Canon
User-specific Character Instance
Relationship State
Memory Graph
Time Context
Event/Route State
Conversation Context
User Message
```

## Character Template

모든 유저에게 공통인 캐릭터 원본.

포함 항목:

- core identity
- stable personality
- speech style
- values
- habits
- defense mechanisms
- global world canon
- possible arcs
- boundaries

원칙:

- 글로벌 template은 유저별 사건 때문에 직접 변경하지 않는다.
- template 변경은 캐릭터 버전 업데이트로 관리한다.

## Character Instance

특정 유저와 캐릭터 사이에만 존재하는 분기 상태.

포함 항목:

- route state
- world overrides
- adaptive psychological state
- relationship identity
- momentary state
- important memories
- unresolved threads

## Stable vs Adaptive vs Momentary

```text
Core Persona: 거의 변하지 않는 정체성
Adaptive State: 시간, 관계, 사건에 따라 천천히 변하는 성향
Momentary State: 현재 감정, 컨디션, 최근 사건 반응
```

변화 속도:

```text
감정: 빠름
관계: 중간
성격: 느림
핵심 정체성: 거의 고정
```

## Truth Priority

```yaml
truth_priority:
  1_system_safety
  2_user_specific_story_state
  3_permanent_character_canon
  4_long_term_memory
  5_recent_conversation
  6_generated_flavor_detail
```

## Prompt Assembly

```text
[System Policy]
[Service Safety Rules]
[Character Core Persona]
[Global World Canon]
[User-specific Story Overrides]
[Relationship State]
[Relevant Memories]
[Time Context]
[Current Scene / Momentary State]
[Conversation Summary]
[User Message]
```

## Important Rule

유저별 스토리 상태가 글로벌 canon보다 우선하지만, core persona 자체를 완전히 덮어쓰지는 않는다.
