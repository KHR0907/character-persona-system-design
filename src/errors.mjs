export class PersonaValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "PersonaValidationError";
    this.details = details;
  }
}

export class StateConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "StateConflictError";
  }
}

export class PromptBudgetError extends Error {
  constructor(message) {
    super(message);
    this.name = "PromptBudgetError";
  }
}
