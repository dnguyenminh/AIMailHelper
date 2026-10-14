// src/background/handlers/locator.handler.ts — LOCATOR_RESOLVE (TDD §6.1 #6; GĐ3).
// Build prompt locate (temperature 0, maxTokens 512) → chat → parse refId fail-closed (SR-01 L3):
// chỉ chấp nhận refId well-formed (ref_\d+) hoặc null — mọi text khác → null; KHÔNG eval/execute
// chuỗi LLM (BR-16). Element map verify nằm ở CS (semantic-locator deref + SR-08).
import { AppError } from "../../shared/errors";
import { buildChatMessages } from "../../shared/llm/prompts";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { resolveActive } from "../llm-runtime";
import { storage } from "../../shared/storage";
import type { MessageRouter, RpcHandler } from "../router";

const LOCATE_TEMPERATURE = 0; // deterministic (§7.2 TA note — locate 0)
const LOCATE_MAX_TOKENS = 512;
const SNAPSHOT_MAX_CHARS = 25_000; // snapshot ≤ 20K (NFR §10) + biên an toàn; vượt → ERR-15 tooLarge
const QUESTION_MAX_CHARS = 2_000;

export function registerLocatorHandlers(router: MessageRouter): void {
  router.register("LOCATOR_RESOLVE", handleLocatorResolve);
}

interface LocatorPayload {
  functionKey: string;
  question: string;
  snapshot: string;
}

const handleLocatorResolve: RpcHandler = async (payload): Promise<{ refId: string | null }> => {
  const request = parsePayload(payload);
  const active = await resolveActive(); // ERR-11 khi chưa cấu hình — envelope về CS
  await ensureHostPermission(active.config); // BR-05
  const language = (await storage.getGeneral()).uiLanguage;
  const messages = buildChatMessages("locate", language, buildUserContent(request));
  const response = await active.adapter.chat(active.config, messages, {
    temperature: LOCATE_TEMPERATURE,
    maxTokens: LOCATE_MAX_TOKENS
  });
  return { refId: parseRefId(response.text) };
};

function parsePayload(raw: unknown): LocatorPayload {
  const record = (raw ?? {}) as Record<string, unknown>;
  const functionKey = record["functionKey"];
  const question = record["question"];
  const snapshot = record["snapshot"];
  if (typeof functionKey !== "string" || functionKey.length === 0 || functionKey.length > 64) {
    throw badPayload("functionKey");
  }
  if (typeof question !== "string" || question.length > QUESTION_MAX_CHARS) throw badPayload("question");
  if (typeof snapshot !== "string" || snapshot.length === 0) throw badPayload("snapshot");
  if (snapshot.length > SNAPSHOT_MAX_CHARS) {
    throw new AppError("ERR-15", "errors.tooLarge", { field: "snapshot" });
  }
  return { functionKey: functionKey, question: question, snapshot: snapshot };
}

function buildUserContent(request: LocatorPayload): string {
  return "Yêu cầu: " + request.question + "\n\nA11y snapshot (role + label + refId):\n" + request.snapshot;
}

// SR-01 L3 — parse fail-closed: /ref_\d+/ well-formed → trả; chữ null / text lạ / rỗng → null.
export function parseRefId(text: string): string | null {
  const match = /ref_\d+/.exec(text.trim());
  return match ? match[0] : null;
}

function badPayload(field: string): AppError {
  return new AppError("ERR-15", "errors.badRequest", { field: field });
}
