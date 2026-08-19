import { applyEvents, selectEvents } from "./event-engine.mjs";
import { PersonaValidationError } from "./errors.mjs";
import { assemblePrompt } from "./prompt-assembler.mjs";
import { createSchemaValidators } from "./schema-validator.mjs";
import { analyzeSafety, applyConversationUpdate, mergeSafetyFlags } from "./state-engine.mjs";
import { applyTimeEvolution } from "./time-engine.mjs";

const crisisFlags = new Set(["crisis_high", "crisis_imminent"]);

export class PersonaRuntime {
  #repository;
  #generator;
  #validators;
  #maxPromptTokens;
  #safetyAnalyzer;

  constructor({ repository, generator, maxPromptTokens = 6000, safetyAnalyzer = analyzeSafety }) {
    if (!repository || !generator?.generate) throw new PersonaValidationError("Runtime requires repository and generator.generate");
    this.#repository = repository;
    this.#generator = generator;
    this.#validators = createSchemaValidators();
    this.#maxPromptTokens = maxPromptTokens;
    this.#safetyAnalyzer = safetyAnalyzer;
  }

  async runTurn({ instanceId, userMessage, conversationId, messageId, idempotencyKey, recentSummary = null, now = new Date() }) {
    if (!userMessage?.trim()) throw new PersonaValidationError("userMessage is required");
    const updateKey = idempotencyKey ?? `${conversationId}_${messageId}_update`;
    const committed = this.#repository.getCommittedTurn(instanceId, updateKey);
    if (committed) return { ...committed, duplicate: true };

    const storedInstance = this.#repository.getInstance(instanceId);
    const template = this.#repository.getTemplate(storedInstance.character_id, storedInstance.template_version);
    this.#validators.assert("characterTemplateDocument", { character_template: template }, "character template");
    this.#validators.assert("characterInstanceDocument", { character_instance: storedInstance }, "character instance");
    const timeEvolution = applyTimeEvolution(storedInstance, template, now);
    const instance = timeEvolution.instance;
    const eventDefinitions = this.#repository.listEventDefinitions();
    for (const event of eventDefinitions) {
      this.#validators.assert("eventDefinitionDocument", { event_definition: event }, `event definition ${event.id}`);
    }
    const safetyFlags = this.#safetyAnalyzer(userMessage, instance);
    const memories = this.#repository.retrieveMemories({
      userId: instance.user_id,
      characterId: instance.character_id,
      query: `${userMessage}\n${recentSummary ?? ""}`,
      now,
    });
    for (const memory of memories) {
      const { retrieval_score: _retrievalScore, ...canonicalMemory } = memory;
      this.#validators.assert("memoryDocument", { memory: canonicalMemory }, `retrieved memory ${memory.id}`);
    }
    const prompt = assemblePrompt({
      template,
      instance,
      memories,
      userMessage,
      recentSummary,
      detectedSafetyFlags: safetyFlags,
      maxTokens: this.#maxPromptTokens,
    });

    const generated = await this.#generator.generate({
      prompt: prompt.prompt,
      instance: structuredClone(instance),
      template: structuredClone(template),
      memories: structuredClone(memories),
      safetyFlags: [...safetyFlags],
      turn: { conversationId, messageId, idempotencyKey: updateKey, now: now.toISOString() },
    });
    if (!generated || typeof generated.response !== "string" || !generated.response.trim()) {
      throw new PersonaValidationError("Generator returned an empty response");
    }
    const rawUpdate = generated.post_conversation_update;
    this.#validators.assert("postConversationUpdateDocument", { post_conversation_update: rawUpdate }, "post_conversation_update");
    if (rawUpdate.idempotency_key !== updateKey) throw new PersonaValidationError("Generator returned a mismatched idempotency key");
    if (rawUpdate.base_state_revision !== instance.state_revision) throw new PersonaValidationError("Generator returned a stale base_state_revision");
    const update = mergeSafetyFlags(rawUpdate, safetyFlags);
    this.#validators.assert("postConversationUpdateDocument", { post_conversation_update: update }, "safe post_conversation_update");

    let nextInstance = applyConversationUpdate(instance, update);
    nextInstance.time_context.last_interaction_at = now.toISOString();
    nextInstance.time_context.conversation_count += 1;
    if (safetyFlags.includes("crisis_imminent")) nextInstance.safety_state.crisis_risk = "imminent";
    if (safetyFlags.includes("dependency_exclusivity")) {
      nextInstance.safety_state.dependency_risk = Math.min(100, nextInstance.safety_state.dependency_risk + 10);
    }
    const eventIds = new Set(eventDefinitions.map((event) => event.id));
    for (const eventId of update.event_candidate_ids) {
      if (!eventIds.has(eventId)) throw new PersonaValidationError(`Unknown event candidate: ${eventId}`);
    }
    const selectedEvents = selectEvents(eventDefinitions, nextInstance);
    nextInstance = applyEvents(nextInstance, selectedEvents);

    let memoryCandidates = generated.memory_candidates ?? [];
    if (safetyFlags.some((flag) => crisisFlags.has(flag))) memoryCandidates = [];
    const candidateIds = new Set(memoryCandidates.map((memory) => memory.id));
    const requestedMemoryIds = new Set(update.memory_candidate_ids);
    for (const id of update.memory_candidate_ids) {
      if (!candidateIds.has(id) && !safetyFlags.some((flag) => crisisFlags.has(flag))) {
        throw new PersonaValidationError(`Missing memory candidate payload: ${id}`);
      }
    }
    for (const memory of memoryCandidates) {
      if (!requestedMemoryIds.has(memory.id)) throw new PersonaValidationError(`Unrequested memory candidate payload: ${memory.id}`);
      this.#validators.assert("memoryDocument", { memory }, `memory candidate ${memory.id}`);
      if (!nextInstance.memory_refs.includes(memory.id)) nextInstance.memory_refs.push(memory.id);
    }
    this.#validators.assert("characterInstanceDocument", { character_instance: nextInstance }, "next character instance");

    const result = {
      response: generated.response,
      instance: nextInstance,
      appliedEventIds: selectedEvents.map((event) => event.id),
      storedMemoryIds: memoryCandidates.map((memory) => memory.id),
      safetyFlags: update.safety_flags,
      promptStats: {
        estimatedTokens: prompt.estimatedTokens,
        omittedSections: prompt.omittedSections,
        includedMemoryIds: prompt.includedMemoryIds,
      },
      timeEvolution: {
        elapsedHours: Number(timeEvolution.elapsedHours.toFixed(3)),
        applied: timeEvolution.applied,
      },
      duplicate: false,
    };
    const commit = this.#repository.commitTurn({
      instanceId,
      expectedRevision: storedInstance.state_revision,
      idempotencyKey: updateKey,
      nextInstance,
      memoryCandidates,
      recalledMemoryIds: prompt.includedMemoryIds,
      now,
      result,
    });
    return { ...commit.result, duplicate: commit.duplicate };
  }
}
