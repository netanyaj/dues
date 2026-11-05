#!/usr/bin/env node
// No-AI check (brief: "No AI inside the app"). Fails if any dependency, source file or
// env var references a model provider. Runs before every build (package.json "build").
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const problems = [];

// 1. Dependencies: direct and transitive (lockfile).
const BAD_PKG = [
  /^openai$/, /^@openai\//, /^@anthropic-ai\//, /^anthropic$/, /^langchain$/, /^@langchain\//, /^ai$/, /^@ai-sdk\//,
  /^cohere-ai$/, /^@google\/generative-ai$/, /^@google\/genai$/, /^groq-sdk$/, /^@mistralai\//, /^replicate$/, /^ollama$/,
  /^@huggingface\//, /^llamaindex$/, /^together-ai$/, /^@aws-sdk\/client-bedrock/,
];
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const direct = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const all = new Set(direct);
for (const k of Object.keys(lock.packages ?? {})) {
  const m = k.match(/node_modules\/((?:@[^/]+\/)?[^/]+)$/);
  if (m) all.add(m[1]);
}
for (const name of all) if (BAD_PKG.some((re) => re.test(name))) problems.push(`dependency: ${name}`);

// 2. Source, config and env templates: imports, API hosts, model-key env vars.
const BAD_TEXT = [
  /from\s+["'](openai|@anthropic-ai\/[^"']+|anthropic|langchain|@langchain\/[^"']+|ai|@ai-sdk\/[^"']+)["']/,
  /require\(\s*["'](openai|@anthropic-ai\/[^"']+|anthropic|langchain|ai|@ai-sdk\/[^"']+)["']\s*\)/,
  /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.groq\.com|api\.mistral\.ai|api\.cohere\.ai/,
  /\b(OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE_AI|GROQ|MISTRAL|COHERE|HUGGINGFACE|HF|REPLICATE|TOGETHER)_API_KEY\b/,
  /\bAI_GATEWAY_API_KEY\b/,
];
const SCAN_DIRS = ["src", "scripts", "tests", "supabase"];
const SCAN_FILES = ["package.json", ".env.example", "next.config.ts", "vercel.json"];
const self = path.join(root, "scripts", "check-no-ai.mjs");
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p); }
    else if (/\.(m?[jt]sx?|json|sql|env.*)$/.test(e.name) && p !== self) check(p);
  }
}
function check(p) {
  const text = fs.readFileSync(p, "utf8");
  for (const re of BAD_TEXT) if (re.test(text)) problems.push(`${path.relative(root, p)}: matches ${re}`);
}
SCAN_DIRS.forEach((d) => walk(path.join(root, d)));
SCAN_FILES.forEach((f) => fs.existsSync(path.join(root, f)) && check(path.join(root, f)));

// 3. The app's environment: process.env on Vercel/CI (env vars are injected into the
//    build), and the .env* files locally (a developer's shell has unrelated tooling vars).
const CRED = /(OPENAI|ANTHROPIC|CLAUDE|GEMINI|GROQ|MISTRAL|COHERE|HUGGINGFACE|REPLICATE|AI_GATEWAY).*(KEY|TOKEN|SECRET)/i;
const envNames = process.env.VERCEL || process.env.CI
  ? Object.keys(process.env)
  : fs.readdirSync(root).filter((f) => f.startsWith(".env")).flatMap((f) =>
      fs.readFileSync(path.join(root, f), "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1]).filter(Boolean));
for (const k of envNames) if (CRED.test(k)) problems.push(`env var: ${k}`);

if (problems.length) {
  console.error("✗ No-AI check failed. Dues must not use model SDKs, keys or calls:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`✓ No-AI check passed (${all.size} packages, source and env scanned).`);
