import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { scoreEvaluation } from "../src/evaluation.mjs";

const resultPath = process.argv[2];
if (!resultPath) {
  console.error("Usage: npm run eval:score -- <evaluation-result.yaml>");
  process.exit(2);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suite = YAML.parse(fs.readFileSync(path.join(rootDir, "evals/luna-scenarios.yaml"), "utf8")).evaluation_suite;
const document = YAML.parse(fs.readFileSync(path.resolve(resultPath), "utf8"));
const result = document.evaluation_result ?? document;
const report = scoreEvaluation(suite, result);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
