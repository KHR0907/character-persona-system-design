import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { PersonaValidationError } from "./errors.mjs";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSchemaPath = path.resolve(sourceDir, "../schemas/persona-system.schema.yaml");

export function createSchemaValidators(schemaPath = defaultSchemaPath) {
  const schema = YAML.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(schema);
  const cache = new Map();

  function validator(definition) {
    if (!cache.has(definition)) {
      cache.set(definition, ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` }));
    }
    return cache.get(definition);
  }

  return {
    validate(definition, value) {
      const validate = validator(definition);
      return { valid: validate(value), errors: structuredClone(validate.errors ?? []) };
    },
    assert(definition, value, label = definition) {
      const result = this.validate(definition, value);
      if (!result.valid) {
        const details = result.errors.map((error) => `${error.instancePath || "/"}: ${error.message}`);
        throw new PersonaValidationError(`${label} failed schema validation`, details);
      }
    },
  };
}
