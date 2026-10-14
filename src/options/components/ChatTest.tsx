// src/options/components/ChatTest.tsx — chat test streaming qua Port "aimh:stream" (GĐ2; TDD §11 Done).
// PortClient (heartbeat 20s từ GĐ1) → kind "chat-test" → SW resolve provider active → adapter.chatStream.
// System message = prompt tùy chỉnh (nếu có) + anti-injection clause — DR-01 L1 áp dụng cả chat test.
import { useEffect, useRef, useState } from "react";
import { t } from "../../shared/i18n";
import { useUiLanguage } from "../../shared/i18n/react";
import { getUiLanguage } from "../../shared/i18n";
import { PortClient } from "../../shared/port-client";
import type { PortEvent } from "../../shared/messaging";
import { systemPrompt } from "../../shared/llm/prompts";
import type { ConfigData } from "../useConfigData";

interface ChatState {
  output: string;
  phase: "idle" | "streaming" | "done" | "failed";
  error: string | null;
}

export function ChatTest(props: { config: ConfigData }): JSX.Element {
  useUiLanguage(); // re-render theo uiLanguage (UC-08)
  const prompts = props.config.data?.prompts ?? null;
  const hasProvider = props.config.data !== null && props.config.data.providers[props.config.data.activeProvider].config !== null;
  const [input, setInput] = useState("");
  const [state, setState] = useState<ChatState>({ output: "", phase: "idle", error: null });
  const clientRef = useRef<PortClient | null>(null);

  useEffect(() => {
    const client = new PortClient();
    clientRef.current = client;
    return () => client.disconnect();
  }, []);

  const submit = (): void => {
    const text = input.trim();
    if (text.length === 0 || !hasProvider) return;
    setState({ output: "", phase: "streaming", error: null });
    // §5.3.2 — payload {messages}; system = custom prompt + anti-injection clause (DR-01 L1)
    const messages = [
      { role: "system" as const, content: systemPrompt("analyze", getUiLanguage(), prompts?.customSystemPrompt ?? null) },
      { role: "user" as const, content: text }
    ];
    clientRef.current?.request("chat-test", { messages: messages }, onEvent);
  };

  const onEvent = (event: PortEvent): void => {
    if (event.type === "chunk") {
      setState((prev) => ({ ...prev, output: prev.output + event.delta }));
      return;
    }
    if (event.type === "done") {
      setState((prev) => ({ ...prev, phase: "done" }));
      return;
    }
    if (event.type === "error") {
      // error mang i18nKey + params (BR-08) — render theo uiLanguage; detail đã redact (SR-03)
      setState((prev) => ({ ...prev, phase: "failed", error: t(event.i18nKey, event.params ?? {}) + detailOf(event.params) }));
    }
  };

  const stop = (): void => {
    clientRef.current?.disconnect(); // hủy stream — reconnect tạo port mới ở lần send sau
    setState((prev) => ({ ...prev, phase: prev.phase === "streaming" ? "done" : prev.phase }));
  };

  const streaming = state.phase === "streaming";

  return (
    <div className="chat-test">
      <p className="note">{t("options.chat.hint")}</p>
      {!hasProvider && <p className="warning">{t("options.chat.needConfig")}</p>}
      <textarea
        rows={2}
        value={input}
        placeholder={t("options.chat.placeholder")}
        onChange={(event) => setInput(event.target.value)}
      />
      <div className="chat-actions">
        <button type="button" disabled={streaming || !hasProvider || input.trim().length === 0} onClick={submit}>
          {t("options.chat.submit")}
        </button>
        <button type="button" disabled={!streaming} onClick={stop}>
          {t("options.chat.stop")}
        </button>
      </div>
      <pre className="chat-output" aria-live="polite">{state.output}</pre>
      {state.error !== null && <p className="warning" role="alert">{state.error}</p>}
    </div>
  );
}

function detailOf(params: Record<string, string> | undefined): string {
  const detail = params?.["detail"];
  return detail ? " — " + detail : "";
}
