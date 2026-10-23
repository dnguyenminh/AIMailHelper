// src/shared/messaging.ts — RPC envelope (một-lần) + Port protocol types (TDD §4.2/§6.1).
// PortClient tách ở port-client.ts, PortServer ở port-server.ts (TDD §4.1 bổ sung — file ≤ 200 dòng).
import { AppError } from "./errors";
import type { ErrCode } from "./errors";
import type { ChatMessage } from "./llm/types";
import type { EmailData, ReplyDraft, TriageItem } from "./types";
export type RpcKind =
  | "CONFIG_GET"
  | "CONFIG_SET"
  | "KEY_STORAGE_SET"
  | "TEST_CONNECTION"
  | "LIST_MODELS"
  | "LOCATOR_RESOLVE"
  | "VISION_CAPTURE"
  | "VISION_LOCATE"
  | "QUEUE_LIST"
  | "QUEUE_UPDATE"
  | "GET_RUNTIME_STATE"
  | "DEBUGGER_SCROLL"
  | "DEBUGGER_DETACH"
  | "ATTACHMENT_CAPTURE_START"
  | "ATTACHMENT_CAPTURE_COLLECT"
  | "ATTACHMENT_EXTRACT"
  | "ATTACHMENT_READ_PREVIEW"
  | "ATTACHMENT_READ_PREVIEW_IMAGES"
  | "PREVIEW_IFRAME_PROBE"
  | "ATTACHMENT_VISION_TEXT"
  | "COPIL_PANEL_READ"
  | "COPIL_CHIP_CLICK"
  | "COPIL_PANEL_STRUCTURE"
  | "COPIL_PANEL_HTML"
  | "COPIL_INPUT_HOVER"
  | "COPIL_INPUT_CLICK";

export const RPC_KINDS: readonly RpcKind[] = [
  "CONFIG_GET",
  "CONFIG_SET",
  "KEY_STORAGE_SET",
  "TEST_CONNECTION",
  "LIST_MODELS",
  "LOCATOR_RESOLVE",
  "VISION_CAPTURE",
  "VISION_LOCATE",
  "QUEUE_LIST",
  "QUEUE_UPDATE",
  "GET_RUNTIME_STATE",
  "DEBUGGER_SCROLL",
  "DEBUGGER_DETACH",
  "ATTACHMENT_CAPTURE_START",
  "ATTACHMENT_CAPTURE_COLLECT",
  "ATTACHMENT_EXTRACT",
  "ATTACHMENT_READ_PREVIEW",
  "ATTACHMENT_READ_PREVIEW_IMAGES",
  "PREVIEW_IFRAME_PROBE",
  "ATTACHMENT_VISION_TEXT",
  "COPIL_PANEL_READ",
  "COPIL_CHIP_CLICK",
  "COPIL_PANEL_STRUCTURE",
  "COPIL_PANEL_HTML",
  "COPIL_INPUT_HOVER",
  "COPIL_INPUT_CLICK"
];

export function isRpcKind(value: unknown): value is RpcKind {
  return typeof value === "string" && (RPC_KINDS as readonly string[]).includes(value);
}

export interface RpcRequest {
  kind: RpcKind;
  requestId: string;
  payload: unknown;
}

export interface RpcErrorPayload {
  code: ErrCode;
  i18nKey: string;
  params?: Record<string, string>;
}

export type RpcResponse<T> =
  | { requestId: string; ok: true; data: T }
  | { requestId: string; ok: false; error: RpcErrorPayload };

// Port "aimh:stream" — CS → SW (TDD §4.2/§6.2 — payload typed theo kind).
export interface StreamRequestPayloads {
  "analyze": { email: EmailData };
  "reply": { email: EmailData; tone: ReplyDraft["tone"]; language: ReplyDraft["language"]; extraInstructions?: string };
  "triage-batch": { items: TriageItem[] };
  "chat-test": { messages: ChatMessage[] };
}

// UAT 18/10 — trusted-scroll qua chrome.debugger (SPIKE §7.1): OWA chỉ nhận input isTrusted.
// Payload scroll: tọa độ điểm cuộn (tâm list) + bước wheel + số gesture — SW validate chặt.
export interface DebuggerScrollPayload {
  x: number;
  y: number;
  deltaY: number;
  times: number;
}

export type StreamRequestKind = keyof StreamRequestPayloads;

export type PortRequest =
  | { type: "request"; requestId: string; kind: StreamRequestKind; payload: StreamRequestPayloads[StreamRequestKind] }
  | { type: "cancel"; requestId: string }
  | { type: "ping" };

// Port "aimh:stream" — SW → CS (TDD §4.2/§6.2; error mang i18nKey, KHÔNG chứa key/body — BR-08).
export type PortEvent =
  | { type: "accepted"; requestId: string }
  | { type: "chunk"; requestId: string; seq: number; delta: string }
  | { type: "done"; requestId: string; finishReason?: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; requestId: string; code: ErrCode; i18nKey: string; params?: Record<string, string>; retryable: boolean; httpStatus?: number }
  | { type: "progress"; requestId: string; done: number; total: number; failed: number };

export const STREAM_PORT_NAME = "aimh:stream";

let rpcCounter = 0;

// §6.2 #1 — requestId: prefix + timestamp + counter, unique per stream/request.
export function nextRequestId(prefix: "rpc" | "req"): string {
  rpcCounter += 1;
  return prefix + "_" + Date.now() + "_" + rpcCounter;
}

export function toAppError(payload: RpcErrorPayload): AppError {
  return new AppError(payload.code, payload.i18nKey, payload.params, false, undefined);
}

// §3.4 — sendMessage bọc chrome.runtime.sendMessage: sinh requestId, parse envelope, ném AppError.
// uat91 — chrome.runtime CHẾT khi extension được Tải lại trong khi tab đang mở →
// "Extension context invalidated" → chuyển thành ERR-17 (panel hiện yêu cầu F5) thay vì lỗi thô.
export async function sendMessage<T>(kind: RpcKind, payload: unknown = {}): Promise<T> {
  const request: RpcRequest = { kind: kind, requestId: nextRequestId("rpc"), payload: payload };
  let response: RpcResponse<T> | undefined;
  try {
    response = (await chrome.runtime.sendMessage(request)) as RpcResponse<T> | undefined;
  } catch (error) {
    if (/extension context invalidated/i.test(String(error instanceof Error ? error.message : error))) {
      throw new AppError("ERR-17", "errors.reloadRequired", undefined, true);
    }
    throw error instanceof Error ? error : new AppError("ERR-15", "errors.badRequest");
  }
  if (!response || typeof response !== "object" || !("ok" in response)) {
    const lastError = chrome.runtime.lastError;
    if (lastError !== undefined && /extension context invalidated/i.test(String(lastError.message))) {
      throw new AppError("ERR-17", "errors.reloadRequired", undefined, true);
    }
    throw new AppError("ERR-15", "errors.badRequest");
  }
  if (response.ok) return response.data;
  throw toAppError(response.error);
}
