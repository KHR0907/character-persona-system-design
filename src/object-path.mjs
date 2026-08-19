import { PersonaValidationError } from "./errors.mjs";

const forbiddenSegments = new Set(["__proto__", "prototype", "constructor"]);

function segments(path) {
  const result = path.split(".");
  if (result.length < 2 || result.some((part) => !part || forbiddenSegments.has(part))) {
    throw new PersonaValidationError(`Unsafe or invalid state path: ${path}`);
  }
  return result;
}

export function getPath(object, path) {
  return segments(path).reduce((value, key) => value?.[key], object);
}

export function setPath(object, path, value) {
  const parts = segments(path);
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    if (cursor[part] === undefined) cursor[part] = {};
    if (cursor[part] === null || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      throw new PersonaValidationError(`Cannot traverse non-object state path: ${path}`);
    }
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

export function deletePath(object, path) {
  const parts = segments(path);
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    cursor = cursor?.[part];
    if (cursor === undefined || cursor === null) return;
  }
  delete cursor[parts.at(-1)];
}
