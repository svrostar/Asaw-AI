import { useState } from "react";
import { Check, Copy, Code2 } from "lucide-react";

interface Segment {
  type: "text" | "code";
  content: string;
  language?: string;
}

function parseCodeSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: raw.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: "code",
      language: match[1] || "luau",
      content: match[2].replace(/\n$/, ""),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < raw.length) {
    segments.push({
      type: "text",
      content: raw.slice(lastIndex),
    });
  }

  return segments;
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[0.85em] text-[#7DD3FC]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const lines = code.split("\n");

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-white/10 bg-[#090C11]">
      <div className="flex items-center justify-between border-b border-white/8 bg-[#101520] px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Code2 className="h-3.5 w-3.5 text-[#00A2FF]" />
          <span className="font-mono">{language}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{lines.length} baris</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#00A2FF] whitespace-nowrap shrink-0"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-400" />
              <span>Salin Kode</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="align-top">
                <td className="w-8 select-none pr-3 text-right text-slate-600 tabular-nums">
                  {i + 1}
                </td>
                <td className="whitespace-pre text-slate-100">{line || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LuauMessageRenderer({ text }: { text: string }) {
  const segments = parseCodeSegments(text);

  return (
    <div className="space-y-2 text-[14.5px] leading-relaxed text-slate-200">
      {segments.map((segment, index) => {
        if (segment.type === "code") {
          return (
            <CodeBlock
              key={index}
              code={segment.content}
              language={segment.language || "luau"}
            />
          );
        }

        const paragraphs = segment.content
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);

        return (
          <div key={index} className="space-y-2">
            {paragraphs.map((paragraph, pIdx) => {
              const lines = paragraph.split("\n");
              const isList = lines.every(
                (l) => /^(\d+\.|-|\*)\s+/.test(l.trim())
              );

              if (isList) {
                return (
                  <ul key={pIdx} className="space-y-1.5 pl-4">
                    {lines.map((line, lIdx) => {
                      const clean = line.trim().replace(/^(\d+\.|-|\*)\s+/, "");
                      const markerMatch = line.trim().match(/^(\d+\.)/);
                      return (
                        <li key={lIdx} className="flex items-start gap-2">
                          <span className="mt-0.5 font-mono text-xs text-[#00A2FF] tabular-nums shrink-0">
                            {markerMatch ? markerMatch[1] : "•"}
                          </span>
                          <span>{renderInlineFormatting(clean)}</span>
                        </li>
                      );
                    })}
                  </ul>
                );
              }

              return (
                <p key={pIdx} className="whitespace-pre-wrap">
                  {renderInlineFormatting(paragraph)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
