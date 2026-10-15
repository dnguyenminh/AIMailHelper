// src/content/owa-adapter/reader.test.ts — FR-GD3-02 + BR-14 + AF-1: đọc subject/sender/to/cc/body,
// thread context khi conversation, messageId chain; bodyText rỗng → ERR-10 KHÔNG gọi LLM (fetch 0 lần);
// không thấy vùng đọc → ERR-06.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../shared/errors";
import { detectView } from "./detector";
import { readEmail } from "./reader";

function el(tag: string, attrs: Record<string, string>, text?: string): HTMLElement {
  const element = document.createElement(tag);
  for (const key of Object.keys(attrs)) element.setAttribute(key, attrs[key] as string);
  if (text !== undefined) element.textContent = text;
  return element;
}

function buildReadingFixture(bodyText: string): void {
  document.body.textContent = "";
  const main = el("div", { role: "main" });
  const message = el("div", { "aria-label": "Message body", "data-itemid": "AAMk-native-1" });
  message.appendChild(el("h1", { role: "heading" }, "Đề xuất hợp đồng 2026"));
  message.appendChild(el("span", { "aria-label": "From: An Nguyễn <an@congty.vn>" }, "An"));
  message.appendChild(el("span", { "aria-label": "To: Bình <binh@congty.vn>, Chi <chi@congty.vn>" }, ""));
  message.appendChild(el("span", { "aria-label": "Cc: Dũng <dung@congty.vn>" }, ""));
  message.appendChild(el("div", { "aria-label": "Message body" }, bodyText));
  main.appendChild(message);
  document.body.appendChild(main);
}

const locateOk = async (): Promise<Element | null> => document.querySelector('[role="main"]');

beforeEach(() => {
  document.body.textContent = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("reader — FR-GD3-02 (đọc EmailData qua locate)", () => {
  it("đọc đủ subject/sender/to/cc/bodyText + messageId S1 + detectedView", async () => {
    buildReadingFixture("Kính gửi anh Bình,\nChúng tôi đề xuất ký hợp đồng.   Vui lòng xem  file đính kèm.\nTrân trọng.");
    const email = await readEmail(locateOk, detectView());
    expect(email.subject).toBe("Đề xuất hợp đồng 2026");
    expect(email.sender).toEqual({ name: "An Nguyễn", email: "an@congty.vn" });
    expect(email.to).toEqual([
      { name: "Bình", email: "binh@congty.vn" },
      { name: "Chi", email: "chi@congty.vn" }
    ]);
    expect(email.cc).toEqual([{ name: "Dũng", email: "dung@congty.vn" }]);
    // SR-10 normalize: bỏ tag, gộp whitespace, giữ xuống dòng đoạn
    expect(email.bodyText).toBe("Kính gửi anh Bình,\nChúng tôi đề xuất ký hợp đồng. Vui lòng xem file đính kèm.\nTrân trọng.");
    expect(email.messageId).toBe("AAMk-native-1");
    expect(email.detectedView).toBe("reading-pane");
  });

  it("BR-14: bodyText rỗng → ERR-10 và KHÔNG gọi LLM (fetch 0 lần)", async () => {
    buildReadingFixture("   ");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const promise = readEmail(locateOk, detectView());
    await expect(promise).rejects.toMatchObject({ code: "ERR-10", i18nKey: "errors.emptyEmail" });
    expect(fetchSpy).not.toHaveBeenCalled(); // gate ở reader — không cho gọi LLM payload rỗng
  });

  it("messageId: S1 không có → S2 href AAMk; không có cả hai → synthetic (provenance synthetic)", async () => {
    buildReadingFixture("Nội dung đầy đủ");
    (document.querySelector('[data-itemid]') as HTMLElement).removeAttribute("data-itemid");
    const link = el("a", { href: "https://outlook.office.com/deeplink?itemID=AAMkABCDEFGH1234567890IJKLmnopQR+ST==" });
    (document.querySelector('[role="main"] [aria-label*="Message" i]') as HTMLElement).appendChild(link);
    expect((await readEmail(locateOk, detectView())).messageId).toContain("AAMk");
    link.remove();
    const synthetic = await readEmail(locateOk, detectView());
    expect(synthetic.messageId).toMatch(/^synthetic:[0-9a-f]{16}$/);
  });

  it("AF-1: conversation → threadContext từ các message block TRƯỚC (cũ nhất trước)", async () => {
    document.body.textContent = "";
    const conversation = el("div", { "data-conversation": "true" });
    const first = el("div", { "aria-label": "Message body" });
    first.append(el("h2", {}, "Thư 1"), el("span", { "aria-label": "From: An <an@x.vn>" }, ""), el("div", { "aria-label": "body" }, "Nội dung thư nhất"));
    const second = el("div", { "aria-label": "Message body" });
    second.append(el("h2", {}, "Re: Thư 1"), el("span", { "aria-label": "From: Bình <b@x.vn>" }, ""), el("div", { "aria-label": "body" }, "Trả lời thư nhất với nội dung hiện tại đầy đủ"));
    conversation.append(first, second);
    document.body.appendChild(conversation);
    const email = await readEmail(locateOk, detectView());
    expect(email.detectedView).toBe("conversation");
    expect(email.threadContext).toHaveLength(1); // chỉ message TRƯỚC — không chứa thư hiện tại
    expect(email.threadContext?.[0]?.subject).toBe("Thư 1");
    expect(email.threadContext?.[0]?.from).toBe("An <an@x.vn>");
    expect(email.threadContext?.[0]?.excerpt).toContain("Nội dung thư nhất");
    expect(JSON.stringify(email.threadContext)).not.toContain("Trả lời thư nhất"); // thư hiện tại không lọt
  });

  it("không thấy vùng đọc (T1+T2 fail) → ERR-06 (EF-3); container từ view ưu tiên trước locate", async () => {
    await expect(readEmail(async () => null, { view: "unknown", container: null })).rejects.toBeInstanceOf(AppError);
    try {
      await readEmail(async () => null, { view: "unknown", container: null });
    } catch (error) {
      expect((error as AppError).code).toBe("ERR-06");
    }
    document.body.appendChild(el("div", { "aria-label": "Message body" }, "Nội dung từ container đủ dài để đọc bình thường"));
    const fromContainer = await readEmail(async () => null, detectView());
    expect(fromContainer.bodyText.length).toBeGreaterThan(0);
  });
});

