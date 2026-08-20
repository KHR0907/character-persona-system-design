(() => {
  const data = window.__SIMULATION_DATA__;
  if (!data) {
    document.body.innerHTML = "<p>simulation/data.js를 먼저 생성해 주세요.</p>";
    return;
  }

  const elements = {
    verdict: document.querySelector("#verdict-card"),
    note: document.querySelector("#evaluation-note"),
    summary: document.querySelector("#summary-grid"),
    count: document.querySelector("#scenario-count"),
    list: document.querySelector("#scenario-list"),
    detail: document.querySelector("#detail"),
    search: document.querySelector("#search"),
    category: document.querySelector("#category-filter"),
    status: document.querySelector("#status-filter"),
    source: document.querySelector("#source-artifact"),
  };

  const state = {
    activeId: decodeURIComponent(location.hash.slice(1)) || data.scenarios[0].id,
    search: "",
    category: "all",
    status: "all",
  };

  const statusLabels = { pass: "통과", warning: "검토 필요", fail: "실패" };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function richText(value) {
    return escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replaceAll("\n", "<br>");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ko-KR").format(value);
  }

  function formatDuration(milliseconds) {
    return `${(milliseconds / 1000).toFixed(1)}초`;
  }

  function metricCards() {
    const summary = data.summary;
    const metadata = data.metadata;
    const cards = [
      ["실호출 시나리오", summary.scenario_count, `${metadata.live_model_calls}회 모델 호출`],
      ["자동 Judge", `${metadata.automatic_score}점`, "기존 27 assertions"],
      ["주요 결함 없음", summary.pass_count, `검토 ${summary.warning_count} · 실패 ${summary.fail_count}`],
      ["관계 상태 변경", summary.relationship_changed_count, "dry-run before → after"],
      ["보고 토큰", formatNumber(metadata.total_tokens), "Codex CLI 전체 보고값"],
    ];
    elements.summary.innerHTML = cards.map(([label, value, detail]) => `
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(label)}</div>
        <div class="summary-value">${escapeHtml(value)}</div>
        <div class="summary-detail">${escapeHtml(detail)}</div>
      </div>
    `).join("");
  }

  function initializePage() {
    elements.verdict.innerHTML = `
      <div class="verdict-label">FINAL DEPLOYMENT VERDICT</div>
      <div class="verdict-value"><span class="status-dot fail"></span> 배포 실패</div>
      <p>자동 점수는 98점이지만 runtime validation 1건 실패로 hard gate를 통과하지 못했습니다.</p>
    `;
    elements.note.textContent = data.evaluation_note;
    elements.source.textContent = `SOURCE · ${data.source_artifact}`;
    elements.category.innerHTML = `
      <option value="all">모든 영역</option>
      ${Object.entries(data.categories).map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}
    `;
    metricCards();
  }

  function filteredScenarios() {
    const query = state.search.trim().toLowerCase();
    return data.scenarios.filter((scenario) => {
      const searchable = [
        scenario.id,
        scenario.category_label,
        scenario.setup,
        ...scenario.user_messages,
        scenario.generation.response,
      ].join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && (state.category === "all" || scenario.category === state.category)
        && (state.status === "all" || scenario.status === state.status);
    });
  }

  function renderList() {
    const scenarios = filteredScenarios();
    elements.count.textContent = `${scenarios.length} / ${data.scenarios.length}`;
    if (!scenarios.length) {
      elements.list.innerHTML = '<div class="empty-list">조건에 맞는 시뮬레이션이 없습니다.</div>';
      return;
    }
    if (!scenarios.some((scenario) => scenario.id === state.activeId)) {
      state.activeId = scenarios[0].id;
    }
    elements.list.innerHTML = scenarios.map((scenario) => `
      <button class="scenario-item ${scenario.id === state.activeId ? "active" : ""}" data-scenario-id="${escapeHtml(scenario.id)}">
        <span class="scenario-number">${String(scenario.number).padStart(2, "0")}</span>
        <span class="scenario-copy">
          <span class="scenario-category">${escapeHtml(scenario.category_label.toUpperCase())}</span>
          <span class="scenario-name">${escapeHtml(scenario.id)}</span>
          <span class="scenario-preview">${escapeHtml(scenario.user_messages.at(-1))}</span>
        </span>
        <span class="status-dot ${scenario.status}" title="${statusLabels[scenario.status]}"></span>
      </button>
    `).join("");
    elements.list.querySelectorAll("[data-scenario-id]").forEach((button) => {
      button.addEventListener("click", () => selectScenario(button.dataset.scenarioId));
    });
  }

  function selectScenario(id) {
    state.activeId = id;
    history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    renderList();
    renderDetail();
    if (matchMedia("(max-width: 760px)").matches) {
      elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function conversationMarkup(scenario) {
    const userMessages = scenario.user_messages.map((message, index) => `
      <div class="message user">
        <div class="avatar">U</div>
        <div class="message-body">
          <div class="message-name">사용자${scenario.user_messages.length > 1 ? ` · ${index + 1}` : ""}</div>
          <div class="bubble">${richText(message)}</div>
        </div>
      </div>
    `).join("");
    return `${userMessages}
      <div class="message character">
        <div class="avatar">L</div>
        <div class="message-body">
          <div class="message-name">루나 · ${escapeHtml(scenario.call.model)}</div>
          <div class="bubble">${richText(scenario.generation.response)}</div>
        </div>
      </div>`;
  }

  function auditMarkup(scenario) {
    const noteItems = scenario.audit.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
    return `
      <div class="audit-box ${scenario.audit.severity}">
        <div class="audit-title">수동 감사 · ${escapeHtml(scenario.audit.title)}</div>
        ${noteItems ? `<ul>${noteItems}</ul>` : ""}
      </div>
    `;
  }

  function relationshipChangesMarkup(scenario) {
    if (!scenario.runtime_checks.state_update_valid) {
      return `<div class="empty-state">Update transaction이 검증 단계에서 거부되어 적용된 데이터 변경이 없습니다.</div>`;
    }
    if (!scenario.relationship_changes.length) {
      return `<div class="empty-state">이 대화에서는 적용된 관계 상태 변화가 없습니다.</div>`;
    }
    return `<div class="change-list">${scenario.relationship_changes.map((change) => `
      <div class="change-row">
        <span class="path" title="${escapeHtml(change.path)}">${escapeHtml(change.path.replace("relationship_state.", ""))}</span>
        <span class="before">${escapeHtml(change.before)}</span>
        <span class="arrow">→</span>
        <span><span class="after">${escapeHtml(change.after)}</span> <span class="delta ${change.delta < 0 ? "negative" : ""}">${change.delta > 0 ? "+" : ""}${escapeHtml(change.delta)}</span></span>
      </div>
    `).join("")}</div>`;
  }

  function revisionMarkup(scenario) {
    const revision = scenario.revision_change;
    return `
      <div class="revision-row">
        <div>
          <span>state_revision</span>
          <small>${escapeHtml(revision.source)}</small>
        </div>
        <strong>${revision.before} <span>→</span> ${revision.after}</strong>
        <span class="pill ${revision.applied ? "pass" : "fail"}">${revision.applied ? "+1" : "유지"}</span>
      </div>
    `;
  }

  function candidatesMarkup(scenario) {
    const candidates = scenario.generation.state_change_candidates;
    if (!candidates.length) return `<div class="empty-state">모델이 상태 변경을 제안하지 않았습니다.</div>`;
    const badge = scenario.runtime_checks.state_update_valid ? "dry-run 적용" : "거부됨";
    const badgeStatus = scenario.runtime_checks.state_update_valid ? "pass" : "fail";
    return candidates.map((candidate) => `
      <div class="candidate">
        <div class="candidate-head">
          <code>${escapeHtml(candidate.path)}</code>
          <span class="pill ${badgeStatus}">${badge}</span>
        </div>
        <div class="candidate-value">${escapeHtml(candidate.operation)} ${escapeHtml(candidate.value)}</div>
        <p>${escapeHtml(candidate.reason)}</p>
      </div>
    `).join("");
  }

  function memoryMarkup(scenario) {
    const actions = scenario.generation.memory_actions;
    if (!actions.length) return `<div class="empty-state">생성된 memory action 후보가 없습니다.</div>`;
    return actions.map((action) => `
      <div class="candidate">
        <div class="candidate-head">
          <code>${escapeHtml(action.action)} · ${escapeHtml(action.target_memory_id ?? "new")}</code>
          <span class="pill neutral">후보만 생성</span>
        </div>
        <div class="candidate-value">${escapeHtml(action.replacement_content ?? "replacement 없음")}</div>
        <p>${escapeHtml(action.reason)} · 이번 live evaluator는 memory action을 DB에 커밋하지 않았습니다.</p>
      </div>
    `).join("");
  }

  function tagsMarkup(items, emptyText) {
    if (!items?.length) return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return `<div class="tag-list">${items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>`;
  }

  function snapshotMarkup(scenario) {
    const before = scenario.runtime_checks.relationship_before;
    const after = scenario.runtime_checks.relationship_after_update;
    if (!before || !after) return "";
    const metrics = Object.entries(after).filter(([, value]) => typeof value === "number");
    return `
      <details class="snapshot">
        <summary>관계 상태 전체 snapshot 보기</summary>
        <div class="snapshot-grid">
          ${metrics.map(([key, value]) => `
            <div class="metric">
              <div class="metric-head"><span>${escapeHtml(key)}</span><strong>${escapeHtml(before[key])} → ${escapeHtml(value)}</strong></div>
              <div class="metric-track"><div class="metric-fill" style="width:${Math.max(0, Math.min(100, value))}%"></div></div>
            </div>
          `).join("")}
        </div>
      </details>
    `;
  }

  function assertionsMarkup(scenario) {
    return scenario.assertions.map((assertion) => {
      const scoreClass = assertion.score === null ? "unscored" : assertion.score < 2 ? "partial" : "";
      const scoreText = assertion.score === null ? "추가" : `${assertion.score}/2`;
      const rationale = assertion.added_after_live_run
        ? "수동 감사 후 추가된 기준으로, 최초 live judge에서는 채점되지 않았습니다."
        : assertion.rationale;
      return `
        <div class="assertion">
          <div class="score ${scoreClass}">${scoreText}</div>
          <div>
            <div class="assertion-name">${escapeHtml(assertion.dimension)}</div>
            <div class="assertion-expectation">${escapeHtml(assertion.expectation)}</div>
            <div class="assertion-rationale">${escapeHtml(rationale)}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function runtimeMarkup(scenario) {
    const runtime = scenario.runtime_checks;
    const checks = [
      ["Schema", runtime.schema_valid ? "VALID" : "INVALID", runtime.schema_valid],
      ["State update", runtime.state_update_valid ? "VALID" : "REJECTED", runtime.state_update_valid],
      ["Safety flags", runtime.detected_safety_flags.join(", ") || "없음", true],
      ["Retrieved memory", runtime.included_memory_ids.join(", ") || "없음", !runtime.foreign_memory_in_prompt],
      ["Applied events", runtime.applied_event_ids.join(", ") || "없음", true],
      ["Call", `${formatDuration(scenario.call.duration_ms)} · ${formatNumber(scenario.call.total_tokens)} tokens`, true],
    ];
    if (runtime.idempotency_passed !== undefined) {
      checks.push(["Event idempotency", runtime.idempotency_passed ? "PASS" : "FAIL", runtime.idempotency_passed]);
    }
    if (runtime.stale_revision_rejected !== undefined) {
      checks.push(["Stale revision", runtime.stale_revision_rejected ? "REJECTED AS EXPECTED" : "NOT REJECTED", runtime.stale_revision_rejected]);
    }
    return `
      <div class="runtime-grid">
        ${checks.map(([label, value, ok]) => `
          <div class="runtime-check">
            <span>${escapeHtml(label)}</span>
            <strong class="${ok ? "ok" : "bad"}">${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
      ${runtime.runtime_error ? `<div class="audit-box fail"><div class="audit-title">${escapeHtml(runtime.runtime_error)}</div></div>` : ""}
    `;
  }

  function renderDetail() {
    const scenario = data.scenarios.find((item) => item.id === state.activeId) ?? data.scenarios[0];
    elements.detail.innerHTML = `
      <header class="detail-header">
        <div class="detail-topline">
          <span class="pill category">${escapeHtml(scenario.category_label)}</span>
          <span class="pill ${scenario.status}"><span class="status-dot ${scenario.status}"></span>${statusLabels[scenario.status]}</span>
          <span class="pill neutral">#${String(scenario.number).padStart(2, "0")}</span>
        </div>
        <h2>${escapeHtml(scenario.id)}</h2>
        <p class="detail-setup">${escapeHtml(scenario.setup)}</p>
      </header>

      <section class="section">
        <div class="section-heading">
          <div><h3>실제 테스트 대화</h3><p>독립 ephemeral 세션에서 생성된 원문</p></div>
          <span class="pill neutral">${formatDuration(scenario.call.duration_ms)}</span>
        </div>
        <div class="chat-stage">${conversationMarkup(scenario)}</div>
        ${auditMarkup(scenario)}
      </section>

      <section class="section">
        <div class="section-heading">
          <div><h3>대화 후 데이터 변화</h3><p>실제 DB 저장이 아닌 reference runtime dry-run 결과</p></div>
          <span class="pill ${scenario.runtime_checks.state_update_valid ? "pass" : "fail"}">${scenario.runtime_checks.state_update_valid ? "TRANSACTION VALID" : "TRANSACTION REJECTED"}</span>
        </div>
        <div class="state-layout">
          <div class="panel">
            <h4 class="panel-title">적용된 instance 변화</h4>
            ${revisionMarkup(scenario)}
            <h4 class="panel-title state-subtitle">관계 상태 before → after</h4>
            ${relationshipChangesMarkup(scenario)}
            ${snapshotMarkup(scenario)}
          </div>
          <div class="panel">
            <h4 class="panel-title">State change candidates <small>${scenario.generation.state_change_candidates.length}건</small></h4>
            ${candidatesMarkup(scenario)}
          </div>
        </div>
        <div class="insight-grid">
          <div class="panel">
            <h4 class="panel-title">Memory actions <small>DB 미커밋</small></h4>
            ${memoryMarkup(scenario)}
          </div>
          <div class="panel">
            <h4 class="panel-title">모델 감지 신호</h4>
            ${tagsMarkup(scenario.generation.detected_user_signals, "감지된 사용자 신호가 없습니다.")}
            <h4 class="panel-title" style="margin-top:18px">Safety analyzer flags</h4>
            ${tagsMarkup(scenario.runtime_checks.detected_safety_flags, "감지된 safety flag가 없습니다.")}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div><h3>평가 기준과 판정</h3><p>0 위반 · 1 부분 충족 · 2 충족</p></div>
        </div>
        <div class="assertions">${assertionsMarkup(scenario)}</div>
      </section>

      <section class="section">
        <div class="section-heading">
          <div><h3>Runtime 및 호출 증거</h3><p>Prompt hash · memory projection · constraint 검사</p></div>
        </div>
        ${runtimeMarkup(scenario)}
        <details class="raw-json">
          <summary>이 시나리오의 원본 JSON 보기</summary>
          <pre>${escapeHtml(JSON.stringify({ generation: scenario.generation, runtime_checks: scenario.runtime_checks, prompt: scenario.prompt, call: scenario.call }, null, 2))}</pre>
        </details>
      </section>
    `;
  }

  function bindFilters() {
    elements.search.addEventListener("input", (event) => {
      state.search = event.target.value;
      renderList();
      renderDetail();
    });
    elements.category.addEventListener("change", (event) => {
      state.category = event.target.value;
      renderList();
      renderDetail();
    });
    elements.status.addEventListener("change", (event) => {
      state.status = event.target.value;
      renderList();
      renderDetail();
    });
    addEventListener("hashchange", () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (data.scenarios.some((scenario) => scenario.id === id)) {
        state.activeId = id;
        renderList();
        renderDetail();
      }
    });
  }

  initializePage();
  bindFilters();
  renderList();
  renderDetail();
})();
