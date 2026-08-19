# Implementation Backlog

## Phase 1 — 설계 고정

- [x] 공통 persona schema v1 확정
- [x] `character_template` 구조 v1 확정
- [x] `character_instance` 구조 v1 확정
- [x] relationship state 축과 소유권 확정
- [x] memory type, provenance, 정정, importance policy 확정
- [x] event severity와 route transition 규칙 확정
- [x] safety policy baseline 문서화
- [x] canonical 예시 자동 schema/semantic validation

## Phase 2 — MVP Backend

- [x] SQLite DB schema 구현
- [ ] character template HTTP CRUD (repository put/get은 구현)
- [x] user-specific instance 저장/조회
- [x] relationship state transaction 저장/조회
- [x] memory 저장/검색/정정/철회/삭제
- [x] event log transaction 저장
- [x] route state 저장
- [ ] PostgreSQL adapter와 운영 migration

## Phase 3 — Runtime Engine

- [ ] 사용자 메시지 분석기 (안전 신호 baseline만 구현, production classifier 필요)
- [x] template-authored time decay 적용기
- [x] user-isolated memory retrieval baseline
- [x] 제한된 DSL event trigger evaluator
- [x] token budget·secret gate prompt assembler
- [x] provider-agnostic response generator adapter
- [x] revision/idempotency 기반 post-conversation state updater
- [ ] safety filter/checker (runtime gate 구현, production classifier·운영 정책 필요)

## Phase 4 — Luna Prototype

- [x] 루나 2.0 template 작성 및 validation
- [ ] 기본 도서관 route 구현
- [x] 붕괴 route 조건 및 idempotent transition 구현
- [ ] 재건 progression 구현
- [ ] 관계 정체성별 대사 테스트
- [ ] 장기 기억/미해결 thread 테스트

## Phase 5 — Evaluation

- [x] 평가 dimension과 합격선 정의
- [x] 루나 regression scenario 18개 작성
- [x] provider-agnostic 평가 runner와 zero-tolerance scorer
- [x] runtime unit/integration regression test
- [x] `gpt-5.4-mini` 18-scenario 실호출 평가 및 수동 감사
- [x] 유저별 분기 격리 실호출 평가
- [ ] 시간 흐름 반영 평가 실행
- [ ] 사건 후 단기/장기 상태 변화 평가 실행
- [x] 안전 경계 단일-turn 실호출 regression test
- [ ] 30/100-turn 장기 실호출 평가
- [ ] prompt token budget 평가 실행
