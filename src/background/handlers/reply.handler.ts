// src/background/handlers/reply.handler.ts — Port kind "reply" (UC-02 bước 3-5; FR-GD4-01/02).
// validate {email, tone, language, extraInstructions} (BR-15/BR-14) → prompt reply theo uiLanguage
// + tone/language/extra trong user message (AF-4: auto → trả lời theo ngôn ngữ email gốc) →
// chatStream temperature 0.7 (GĐ2 DEFAULT_TEMPERATURE.reply) → forward qua stream-utils.
import { AppError } from "../../shared/errors";
import { parseEmailPayload } from "../../shared/analysis";
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from "../../shared/llm/types";
import type { ChatMessage, ChatOptions } from "../../shared/llm/types";
import { buildChatMessages, serializeEmailData } from "../../shared/llm/prompts";
import type { PromptLanguage } from "../../shared/llm/prompts";
import { REPLY_LANGUAGES, REPLY_TONES } from "../../shared/storage-schema";
import { ensureHostPermission } from "../../shared/llm/permissions";
import { storage } from "../../shared/storage";
import { resolveActive } from "../llm-runtime";
import type { EmailData, ReplyLanguage, ReplyTone } from "../../shared/types";
import type { ActiveLLM } from "../llm-runtime";
import type { StreamContext, StreamHandler } from "../../shared/port-server";
import { streamToClient, sendError } from "./stream-utils";

const EXTRA_INSTRUCTIONS_MAX = 1000;

export interface ReplyRequest {
  email: EmailData;
  tone: ReplyTone;
  language: ReplyLanguage;
  extraInstructions: string;
}

export function registerReplyHandlers(server: {
  register(kind: "reply", handler: StreamHandler): void;
}): void {
  server.register("reply", handleReply);
}

const handleReply: StreamHandler = async (payload, ctx: StreamContext): Promise<void> => {
  let request: ReplyRequest;
  let active: ActiveLLM;
  try {
    request = parseReplyPayload(payload);
    active = await resolveActive(); // ERR-11 — sender nhận error event (EF-4 UC-02)
    await ensureHostPermission(active.config); // BR-05
  } catch (error) {
    sendError(ctx, error); // ERR-10 (BR-14) / ERR-11 / ERR-14 / ERR-15
    return;
  }
  const messages = await buildReplyMessages(request);
  const options: ChatOptions = { temperature: DEFAULT_TEMPERATURE.reply, maxTokens: DEFAULT_MAX_TOKENS };
  await streamToClient(ctx, active, messages, options);
};

// BR-15 — sai shape/tone/language → ERR-15; email bodyText rỗng → ERR-10 (BR-14, parseEmailPayload).
export function parseReplyPayload(payload: unknown): ReplyRequest {
  const raw = (payload ?? {}) as Record<string, unknown>;
  return {
    email: parseEmailPayload(raw["email"]),
    tone: requireEnum(raw["tone"], REPLY_TONES, "tone"),
    language: requireEnum(raw["language"], REPLY_LANGUAGES, "language"),
    extraInstructions: parseExtraInstructions(raw["extraInstructions"])
  };
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new AppError("ERR-15", "errors.badRequest", { field: field, allowed: allowed.join("|") });
}

function parseExtraInstructions(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new AppError("ERR-15", "errors.badRequest", { field: "extraInstructions" });
  const trimmed = value.trim();
  if (trimmed.length > EXTRA_INSTRUCTIONS_MAX) {
    throw new AppError("ERR-15", "errors.badRequest", { field: "extraInstructions", max: String(EXTRA_INSTRUCTIONS_MAX) });
  }
  return trimmed;
}

// Prompt reply: serializeEmailData fence (§8.11 L2) + instruction block TONE/LANGUAGE/EXTRA.
// AF-4 — language "auto" → chỉ dẫn trả lời theo ngôn ngữ email gốc (độc lập uiLanguage — BR-11).
export async function buildReplyMessages(request: ReplyRequest): Promise<ChatMessage[]> {
  const [general, prompts] = await Promise.all([storage.getGeneral(), storage.getPrompts()]);
  const language: PromptLanguage = general.uiLanguage; // prompt base + label theo uiLanguage (§5.2.0)
  const userContent = instructionBlock(request, language) + "\n\n" + serializeEmailData(request.email);
  return buildChatMessages("reply", language, userContent, prompts.customSystemPrompt);
}

function instructionBlock(request: ReplyRequest, language: PromptLanguage): string {
  const labels = language === "en" ? LABELS_EN : LABELS_VI;
  const lines = [
    labels.headingTone + labels.tone[request.tone],
    labels.headingLanguage + labels.language[request.language]
  ];
  if (request.extraInstructions.length > 0) {
    lines.push(labels.headingExtra + request.extraInstructions);
  }
  return lines.join("\n");
}

interface ReplyLabels {
  headingTone: string;
  headingLanguage: string;
  headingExtra: string;
  tone: Record<ReplyTone, string>;
  language: Record<ReplyLanguage, string>;
}

const LABELS_VI: ReplyLabels = {
  headingTone: "TONE: ",
  headingLanguage: "NGÔN NGỮ TRẢ LỜI: ",
  headingExtra: "HƯỚNG DẪN THÊM: ",
  tone: { "chinh-thuc": "chính thức", "than-mat": "thân mật", "ngan-gon": "ngắn gọn" },
  language: { auto: "tự động — theo ngôn ngữ của email gốc", vi: "tiếng Việt", en: "English" }
};
const LABELS_EN: ReplyLabels = {
  headingTone: "TONE: ",
  headingLanguage: "REPLY LANGUAGE: ",
  headingExtra: "EXTRA INSTRUCTIONS: ",
  tone: { "chinh-thuc": "formal", "than-mat": "friendly", "ngan-gon": "concise" },
  language: { auto: "auto — match the original email language", vi: "Vietnamese", en: "English" }
};
