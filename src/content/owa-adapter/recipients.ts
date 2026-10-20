// src/content/owa-adapter/recipients.ts — sender/recipients parse (tách khỏi reader 20/10 — file ≤200 dòng).
// Header row qua aria-label prefix (EN/VN) — structural attribute, không đoán theo text (SR-10 — chỉ đọc).
export type Recipient = { name: string; email: string };

const FROM_PATTERN = /^(From|Từ)\b/i;
const TO_PATTERN = /^(To|Đến)\b/i;
const CC_PATTERN = /^Cc\b/i;

// "An <an@x.com>" → {name:"An",email:"an@x.com"}; bare email → {name:"",email}; chỉ text → name.
export function parsePerson(raw: string): Recipient | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  const angled = /^([^<>]*?)\s*<([^<>@]+@[^<>@]+)>\s*$/.exec(value);
  if (angled && angled[1] !== undefined && angled[2] !== undefined) {
    return { name: angled[1].trim(), email: angled[2].trim() };
  }
  const bare = /([^\s,;<>"@]+@[^\s,;<>"@]+\.[^\s,;<>"@]+)/.exec(value);
  if (bare && bare[1] !== undefined) return { name: value.replace(bare[1], "").trim(), email: bare[1] };
  return { name: value, email: "" };
}

export function readSender(container: Element): Recipient {
  const fromRaw = labeledValues(container, FROM_PATTERN)[0] ?? "";
  return parsePerson(fromRaw) ?? { name: "", email: "" };
}

// Thread context (AF-1) — chuỗi "From: ..." nguyên vẹn của từng message block.
export function readFromLine(container: Element): string {
  return labeledValues(container, FROM_PATTERN)[0] ?? "";
}

export function readRecipients(container: Element, kind: "to" | "cc"): Recipient[] {
  const result: Recipient[] = [];
  for (const raw of labeledValues(container, kind === "to" ? TO_PATTERN : CC_PATTERN)) {
    for (const part of raw.split(/[,;]/)) {
      const person = parsePerson(part.trim());
      if (person) result.push(person);
    }
  }
  return result;
}

function labeledValues(container: Element, pattern: RegExp): string[] {
  const values: string[] = [];
  for (const el of container.querySelectorAll("[aria-label]")) {
    const label = el.getAttribute("aria-label") ?? "";
    if (!pattern.test(label)) continue;
    const sep = label.indexOf(":");
    values.push(sep >= 0 ? label.slice(sep + 1).trim() : label.replace(/^\S+\s*/, "").trim());
  }
  return values;
}
