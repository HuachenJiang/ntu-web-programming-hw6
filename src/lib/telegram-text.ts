function normalizeLatexMath(text: string): string {
  return text
    .replace(/\$\$([^$]+)\$\$/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\\\(([^)]+)\\\)/g, "$1")
    .replace(/\\\[([^\]]+)\\\]/g, "$1")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\tfrac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\log_?\{([^{}]+)\}/g, "log_$1")
    .replace(/\\log_([A-Za-z0-9]+)/g, "log_$1")
    .replace(/\\mathbb\{Q\}/g, "Q")
    .replace(/\\mathbb\{Z\}\^\+/g, "Z+")
    .replace(/\\mathbb\{Z\}/g, "Z")
    .replace(/\\mathbb\{R\}/g, "R")
    .replace(/\\infty/g, "infinity")
    .replace(/\\leq/g, "<=")
    .replace(/\\geq/g, ">=")
    .replace(/\\neq/g, "!=")
    .replace(/\\times/g, "x")
    .replace(/\\cdot/g, "*")
    .replace(/\\in/g, "in")
    .replace(/\\left|\\right/g, "");
}

function normalizeMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (match) =>
      match.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, ""),
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
}

export function normalizeTelegramText(text: string): string {
  return normalizeMarkdown(normalizeLatexMath(text))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
