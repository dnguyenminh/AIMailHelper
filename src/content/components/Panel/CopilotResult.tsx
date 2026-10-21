// src/content/components/Panel/CopilotResult.tsx — GĐ-B 20/10: lời Copilot TRẢ NGUYÊN VĂN.
// 21/10 uat60 — có cây MdNode (sanitized từ outerHTML lượt cuối) → render React giữ 100%
// heading/bullet/link của chat (SR-10: React element, KHÔNG innerHTML). Thiếu cây → pre raw.
import { t } from "../../../shared/i18n";
import type { MdNode } from "../../../shared/copilot-format";
import type { ReactNode } from "react";

function renderInline(children: MdNode[] | undefined, keyPrefix: string): ReactNode[] {
  return (children ?? []).map((n, i) => renderNode(n, keyPrefix + "-" + String(i)));
}

function renderNode(n: MdNode, key: string): ReactNode {
  switch (n.tag) {
    case "text":
      return n.text;
    case "br":
      return <br key={key} />;
    case "h":
      return <div key={key} className={"aimh-md-h aimh-md-h" + String(n.level ?? 3)}>{renderInline(n.children, key)}</div>;
    case "p":
      return <div key={key} className="aimh-md-p">{renderInline(n.children, key)}</div>;
    case "ul":
    case "ol":
      return <ul key={key} className={n.tag === "ol" ? "aimh-md-ol" : "aimh-md-ul"}>
        {(n.children ?? []).map((li, i) => <li key={key + "-" + String(i)}>{renderInline(li.children, key + "-" + String(i))}</li>)}
      </ul>;
    case "li": // lẻ (không nằm trong ul) — render như paragraph
      return <div key={key} className="aimh-md-p">{renderInline(n.children, key)}</div>;
    case "strong":
      return <strong key={key}>{renderInline(n.children, key)}</strong>;
    case "em":
      return <em key={key}>{renderInline(n.children, key)}</em>;
    case "code":
      return <code key={key} className="aimh-md-code">{renderInline(n.children, key)}</code>;
    case "pre":
      return <pre key={key} className="aimh-md-pre">{renderInline(n.children, key)}</pre>;
    case "blockquote":
      return <blockquote key={key} className="aimh-md-quote">{renderInline(n.children, key)}</blockquote>;
    case "a":
      return <a key={key} href={n.href} target="_blank" rel="noreferrer noopener" className="aimh-md-a">{renderInline(n.children, key)}</a>;
    case "table":
      return <div key={key} className="aimh-md-tablewrap">{renderTable(n.children ?? [], key)}</div>;
    case "tr":
    case "td":
      return null; // chỉ hợp lệ bên trong renderTable
    default:
      return null;
  }
}

// table → bảng đơn giản: mỗi tr một hàng, mỗi td một ô (text inline).
function renderTable(rows: MdNode[], key: string): ReactNode {
  return <table className="aimh-md-table"><tbody>
    {rows.map((r, ri) => (
      <tr key={key + "-r" + String(ri)}>
        {(r.children ?? []).map((cell, ci) => (
          <td key={key + "-r" + String(ri) + "-" + String(ci)}>{renderInline(cell.children, key + "-" + String(ri) + "-" + String(ci))}</td>
        ))}
      </tr>
    ))}
  </tbody></table>;
}

export function CopilotResult({ raw, md }: { raw: string; md?: MdNode[] }) {
  return (
    <div className="aimh-copilot-result">
      <p className="aimh-note">{t("panel.analyze.copilotSource")}</p>
      {md !== undefined && md.length > 0
        ? <div className="aimh-md">{md.map((n, i) => renderNode(n, String(i)))}</div>
        : <pre className="aimh-stream">{raw}</pre>}
    </div>
  );
}
