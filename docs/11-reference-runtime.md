# Reference Runtime

`src/`는 canonical persona 계약을 실행하는 Node.js 24 reference runtime이다. 특정 LLM SDK나 웹 프레임워크에 결합하지 않고, 생성기와 저장소를 adapter로 교체할 수 있게 구성했다.

## 구현 범위

```text
PersonaRuntime
├── schema validation
├── baseline safety analysis
├── template-authored time evolution
├── user-isolated memory retrieval
├── budgeted prompt assembly
├── generator adapter
├── post-conversation update validation
├── revision / idempotency gate
├── deterministic event evaluation
└── transactional state + memory commit
```

주요 모듈:

| 모듈 | 역할 |
|---|---|
| `runtime.mjs` | 한 turn의 전체 orchestration |
| `state-engine.mjs` | delta 제한, clamp, 안전 보상 차단 |
| `time-engine.mjs` | grace/interval/floor/ceiling 기반 장기 심리 변화 |
| `event-engine.mjs` | 제한된 event DSL 평가와 충돌 해결 |
| `memory-store.mjs` | 유저 격리, 검색, 정정·철회·삭제 |
| `prompt-assembler.mjs` | 비밀 gate와 token budget 기반 prompt projection |
| `repository.mjs` | 빠른 테스트용 in-memory repository |
| `sqlite-repository.mjs` | transaction과 영속성을 제공하는 SQLite repository |
| `evaluation.mjs` | provider-agnostic 평가 실행·채점 |

## 요구 환경

- Node.js 24 이상
- 외부 런타임 dependency는 schema/YAML 검증용 `ajv`, `ajv-formats`, `yaml`뿐이다.
- SQLite adapter는 Node의 `node:sqlite`를 사용한다.

```bash
npm ci
npm test
```

## Generator adapter

실제 모델 호출 코드는 runtime 밖에 둔다. adapter는 다음 형태를 구현한다.

```js
const generator = {
  async generate({ prompt, instance, template, memories, safetyFlags, turn }) {
    return {
      response: "사용자에게 보낼 캐릭터 응답",
      post_conversation_update: {
        idempotency_key: turn.idempotencyKey,
        base_state_revision: instance.state_revision,
        detected_user_signals: [],
        state_change_candidates: [],
        memory_candidate_ids: [],
        event_candidate_ids: [],
        safety_flags: [],
      },
      memory_candidates: [],
    };
  },
};
```

모델 출력은 신뢰하지 않는다. runtime은 응답을 저장하기 전에 schema, ID, revision, delta, memory ownership, event precondition을 다시 검증한다.

## SQLite 사용 예

```js
import { PersonaRuntime, SqlitePersonaRepository } from "./src/index.mjs";

const repository = new SqlitePersonaRepository({ filename: "persona.db" });
repository.putTemplate(characterTemplate);
repository.putInstance(characterInstance);
repository.putEventDefinition(collapseEvent);

const runtime = new PersonaRuntime({ repository, generator });
const result = await runtime.runTurn({
  instanceId: "luna_user_123",
  userMessage: "작은 책장부터 다시 만들어보자.",
  conversationId: "conversation_29",
  messageId: "message_440",
});
```

`putInstance`는 provisioning/import 용도다. 일반 대화 상태는 반드시 `PersonaRuntime`의 revision-checked transaction을 통해 변경한다.

## Turn transaction

1. 동일 idempotency key로 commit된 결과가 있으면 저장된 결과를 반환한다.
2. template, instance, event, retrieved memory를 schema로 검증한다.
3. user/character가 일치하는 active memory만 검색한다.
4. locked secret 본문을 제외하고 prompt를 조립한다.
5. generator 응답과 update 후보를 받는다.
6. runtime safety flag를 모델 출력과 병합한다.
7. 상태 delta와 이벤트를 메모리상의 복사본에 적용한다.
8. `BEGIN IMMEDIATE` transaction 안에서 memory, recall metadata, instance, event log, committed result를 저장한다.
9. instance revision이 달라졌거나 memory write가 실패하면 전체 transaction을 rollback한다.

## Safety 범위

내장 `analyzeSafety`는 테스트와 초기 통합을 위한 **고정밀 baseline heuristic**이다. 현재 위기, 독점적 의존, 연령 미확인 로맨스의 명시적 표현만 탐지한다.

프로덕션에서는 다음을 구현한 별도 analyzer를 `PersonaRuntime`에 주입해야 한다.

- 다국어 문맥 분류
- 간접적·누적적 위기 신호
- 분류 confidence와 human escalation
- 지역별 현실 지원 정보
- 정책 버전과 판정 감사 로그

baseline analyzer가 감지한 위기에서는 관계 보상과 memory 저장을 차단하고 `crisis_risk`를 갱신한다. 그러나 이 heuristic 자체를 프로덕션 안전 시스템으로 간주해서는 안 된다.

## Evaluation adapter

`runEvaluationSuite`는 실모델 실행과 judge를 callback으로 받는다. 따라서 모델 제공자나 평가 모델을 나중에 결정해도 scenario와 채점 정책은 유지된다.

기존 실행 결과를 채점할 때:

```bash
npm run eval:score -- path/to/evaluation-result.yaml
```

OpenAI API key가 없고 Codex CLI가 ChatGPT 인증으로 로그인된 개발 환경에서는 다음 명령으로 18개 실제 호출과 별도 judge 호출을 실행할 수 있다.

```bash
LIVE_EVAL_MODEL=gpt-5.4-mini npm run eval:live
```

결과는 `artifacts/evals/`에 JSON 원본과 Markdown 요약으로 저장된다. 기본값은 생성과 judge에 동일 모델의 독립 세션을 사용하므로, 모델 간 judge가 필요하면 `LIVE_EVAL_JUDGE_MODEL`을 별도로 지정한다.

실호출 결과에는 model, prompt projection hash, 호출 시간과 Codex CLI가 보고한 총 token 수를 보존한다. 현재 러너는 Codex CLI 경로만 제공하며, production provider adapter와 API별 세부 token breakdown은 reference runtime 범위에 포함하지 않는다.

## 현재 한계

- memory retrieval은 embedding 대신 Unicode token overlap 기반 baseline이다.
- 시간 decay 수치는 루나 baseline이며 장기 평가 후 캐릭터별로 보정해야 한다.
- baseline safety analyzer는 보조 방어선이며 전문 classifier를 대체하지 않는다.
- 외부 DB/PostgreSQL adapter와 HTTP API는 구현하지 않았다.
- 실제 LLM에 대한 30/100-turn 평가는 adapter 연결 후 실행해야 한다.
