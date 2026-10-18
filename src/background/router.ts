// src/background/router.ts — MessageRouter: handler map RpcKind → Handler (TDD §2.4/§4.4).
// Router + Registry pattern: thêm RPC kind mới không sửa dispatch; error envelope thống nhất (§6.1).
// Handler ném AppError → error envelope; lỗi lạ → ERR-15 + console.error (KHÔNG crash SW, KHÔNG log key — BR-08).
import { AppError, DEFAULT_ERROR_I18N } from "../shared/errors";
import type { ErrCode } from "../shared/errors";
import { isRpcKind } from "../shared/messaging";
import type { RpcKind, RpcRequest, RpcResponse } from "../shared/messaging";

// Handler nhận (payload, sender) — sender bắt buộc cho DEBUGGER_* (tab thật của CS, KHÔNG tin
// tabId từ payload — SR-12 security). Handler cũ chỉ nhận payload vẫn tương thích (tham số ít hơn).
export type RpcHandler = (payload: unknown, sender?: chrome.runtime.MessageSender) => Promise<unknown>;

export class MessageRouter {
  private handlers = new Map<RpcKind, RpcHandler>();

  register(kind: RpcKind, handler: RpcHandler): void {
    this.handlers.set(kind, handler);
  }

  async handle(message: unknown, sender?: chrome.runtime.MessageSender): Promise<RpcResponse<unknown>> {
    const request = parseRequest(message);
    if (!request) return errorEnvelope("", { code: "ERR-15", i18nKey: DEFAULT_ERROR_I18N["ERR-15"] });
    try {
      const handler = this.handlers.get(request.kind);
      if (!handler) {
        throw new AppError("ERR-15", "errors.notImplemented", { kind: request.kind });
      }
      const data = await handler(request.payload, sender);
      return { requestId: request.requestId, ok: true, data: data };
    } catch (error) {
      return this.toErrorEnvelope(request, error);
    }
  }

  private toErrorEnvelope(request: RpcRequest, error: unknown): RpcResponse<unknown> {
    if (error instanceof AppError) {
      return errorEnvelope(request.requestId, {
        code: error.code,
        i18nKey: error.i18nKey,
        params: error.params
      });
    }
    console.error("[AIMH][router] unexpected error in " + request.kind, error); // KHÔNG log payload (BR-08)
    return errorEnvelope(request.requestId, { code: "ERR-15", i18nKey: DEFAULT_ERROR_I18N["ERR-15"] });
  }

  // MV3: listener đăng ký đồng bộ; trả true để giữ kênh mở cho sendResponse bất đồng bộ.
  listen(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void this.handle(message, sender).then(sendResponse);
      return true;
    });
  }
}

function parseRequest(message: unknown): RpcRequest | null {
  if (!message || typeof message !== "object") return null;
  const candidate = message as Partial<RpcRequest>;
  if (!isRpcKind(candidate.kind) || typeof candidate.requestId !== "string") return null;
  return { kind: candidate.kind, requestId: candidate.requestId, payload: candidate.payload };
}

interface RpcErrorEnvelope {
  code: ErrCode;
  i18nKey: string;
  params?: Record<string, string>;
}

function errorEnvelope(requestId: string, error: RpcErrorEnvelope): RpcResponse<unknown> {
  return { requestId: requestId, ok: false, error: error };
}
