# Runtime Flow

## 매 메시지 처리 순서

```text
1. 사용자 메시지 분석
   - 감정
   - 의도
   - 사건 트리거
   - 위험 신호
   - 기억할 가치

2. 현재 캐릭터 인스턴스 불러오기
   - core persona
   - user-specific state
   - relationship
   - relevant memories
   - current route

3. 시간 경과 적용
   - 감정 decay
   - 관계 변화 유지/완화
   - 미해결 사건 여운 반영

4. 사건 트리거 확인
   - 새 이벤트 발생 여부
   - 선택지 필요 여부
   - route 변경 여부

5. 캐릭터 내적 상태 계산
   - 현재 감정
   - 말투 변화
   - 숨기고 싶은 것
   - 말하고 싶은 것

6. 응답 생성

7. 대화 후 상태 업데이트
   - 감정 변화
   - 관계 변화
   - 기억 저장
   - 스토리 플래그 갱신
```

## 상태 업데이트 엔진

대화 종료 후 구조화된 update를 생성한다.

```yaml
post_conversation_update:
  detected_user_signals:
    - user_shared_vulnerability
    - user_asked_about_luna_past

  character_reaction:
    mood_after: quietly_touched
    trust_delta: +4
    openness_delta: +3
    self_blame_delta: +1

  memory_to_store:
    importance: high
    content: 사용자는 루나에게 도서관이 무너진 것이 네 탓만은 아니라고 말했다.

  new_flags:
    - user_comforted_luna_about_collapse

  next_conversation_carryover:
    - 루나는 사용자의 말을 계속 떠올리고 있다.
    - 루나는 다음 대화에서 조금 더 부드럽게 대할 가능성이 높다.
```

## Appraisal Dimensions

```yaml
appraisal_dimensions:
  relevance_to_values: high
  threat_to_identity: medium
  support_from_user: high
  loss_or_gain: gain
  controllability: low
  novelty: medium
  intimacy_level: high
```

## Prompt Assembly Contract

입력:

- `character_template`
- `character_instance`
- `relationship_state`
- `relevant_memories`
- `time_context`
- `conversation_summary`
- `user_message`

출력:

- LLM system/developer prompt
- character response
- post-conversation update candidate
- safety flags

## Verification Rules

- 응답이 `truth_priority`를 위반하지 않는지 확인한다.
- 위험 신호가 있으면 캐릭터 말투를 유지하되 안전 대응을 우선한다.
- 상태 업데이트는 `change_constraints`를 초과하지 않는다.
- 장기 기억은 중요도와 타입이 있어야 저장한다.
