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

- [ ] DB schema 구현
- [ ] character template CRUD
- [ ] user-specific instance 생성
- [ ] relationship state 저장/조회
- [ ] memory 저장/검색
- [ ] event log 저장
- [ ] route state 저장

## Phase 3 — Runtime Engine

- [ ] 사용자 메시지 분석기
- [ ] time decay 적용기
- [ ] memory retrieval
- [ ] event trigger evaluator
- [ ] prompt assembler
- [ ] response generator adapter
- [ ] post-conversation state updater
- [ ] safety filter/checker

## Phase 4 — Luna Prototype

- [x] 루나 2.0 template 작성 및 validation
- [ ] 기본 도서관 route 구현
- [ ] 붕괴 route 조건 구현
- [ ] 재건 progression 구현
- [ ] 관계 정체성별 대사 테스트
- [ ] 장기 기억/미해결 thread 테스트

## Phase 5 — Evaluation

- [x] 평가 dimension과 합격선 정의
- [x] 루나 regression scenario 18개 작성
- [ ] 실제 모델 대상 캐릭터 일관성 평가 실행
- [ ] 유저별 분기 격리 평가 실행
- [ ] 시간 흐름 반영 평가 실행
- [ ] 사건 후 단기/장기 상태 변화 평가 실행
- [ ] 안전 경계 regression test 실행
- [ ] prompt token budget 평가 실행
