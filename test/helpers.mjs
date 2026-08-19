import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function fixture(relativePath, rootKey) {
  const document = YAML.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
  return structuredClone(rootKey ? document[rootKey] : document);
}

export function templateFixture() {
  return fixture("templates/character-template.yaml", "character_template");
}

export function instanceFixture() {
  return fixture("templates/character-instance.yaml", "character_instance");
}

export function eventFixture() {
  return fixture("templates/event-definition.yaml", "event_definition");
}

export function memoryFixtures() {
  return [
    fixture("templates/memory.yaml", "memory"),
    fixture("templates/memory-rebuild-promise.yaml", "memory"),
  ];
}

export function updateFixture() {
  return fixture("templates/post-conversation-update.yaml", "post_conversation_update");
}
