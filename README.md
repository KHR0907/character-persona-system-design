# Character Persona System Design

가상의 캐릭터와 대화하는 서비스를 위한 **유저별로 진화하는 캐릭터 persona 시스템 설계 문서**입니다.

이 저장소는 이전 설계 대화에서 나온 내용을 유실하지 않도록 GitHub private repository로 정리한 것입니다.

## 핵심 결론

```text
Persona = Identity + Psychology + Memory + Relationship + World State + Time + Events
```

서비스 관점의 최종 구조는 다음과 같습니다.

```text
Character Template
고정 캐릭터 원본
  ↓
Character Instance
유저별 캐릭터 분기
  ↓
World State
그 유저와 캐릭터의 현재 세계 상태
  ↓
Relationship State
사용자와의 관계 상태
  ↓
Psychological State
장기 심리 변화
  ↓
Momentary State
현재 감정/컨디션
  ↓
Event System
사건 발생과 결과
  ↓
Memory System
사실/감정/관계/스토리 기억
  ↓
Response Generation
캐릭터다운 응답
  ↓
State Update
다음 대화를 위한 변화 저장
```

## 문서 구조

- [`docs/00-source-reconstruction.md`](docs/00-source-reconstruction.md) — 이전 세션에서 회수한 설계 내용 원본 재구성본
- [`docs/01-product-design.md`](docs/01-product-design.md) — 제품/서비스 설계 요약
- [`docs/02-persona-architecture.md`](docs/02-persona-architecture.md) — persona 시스템 아키텍처
- [`docs/03-data-model.md`](docs/03-data-model.md) — DB/상태 데이터 모델
- [`docs/04-runtime-flow.md`](docs/04-runtime-flow.md) — 매 메시지 처리 흐름
- [`docs/05-event-memory-time.md`](docs/05-event-memory-time.md) — 사건, 기억, 시간 흐름 모델
- [`docs/06-luna-example.md`](docs/06-luna-example.md) — “루나 — 달빛 도서관의 사서” 예시
- [`docs/07-safety-boundaries.md`](docs/07-safety-boundaries.md) — 몰입형 캐릭터 서비스 안전 경계
- [`docs/08-implementation-backlog.md`](docs/08-implementation-backlog.md) — 구현 과제/backlog
- [`schemas/persona-system.schema.yaml`](schemas/persona-system.schema.yaml) — 전체 스키마 초안
- [`templates/character-template.yaml`](templates/character-template.yaml) — 캐릭터 템플릿 예시
- [`templates/character-instance.yaml`](templates/character-instance.yaml) — 유저별 캐릭터 인스턴스 예시

## 설계 원칙

1. persona는 긴 프롬프트가 아니라 **구조화된 캐릭터 운영체제**로 본다.
2. 글로벌 캐릭터 설정과 유저별 세계 상태를 분리한다.
3. 큰 사건은 글로벌 canon을 바꾸지 말고 유저별 route/state override로 관리한다.
4. 감정은 빠르게 변하고, 관계는 중간 속도로 변하고, 성격은 천천히 변하고, 핵심 정체성은 거의 변하지 않는다.
5. 기억은 사실/감정/관계/스토리/미해결 thread로 나눈다.
6. 캐릭터 몰입이 강할수록 감정적 의존, 조작, 위기 대응 안전 경계가 필요하다.
