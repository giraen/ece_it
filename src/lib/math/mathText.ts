import AsciiMathParser from "asciimath2tex";

let parser: AsciiMathParser | null = null;

/** Formulas with these get the full "display" size, so fractions and integrals are not squashed inside a sentence. */
const BIG = /\\(?:frac|int|oint|sum|prod|lim)(?![a-zA-Z])/;

/** Index of the bracket that closes the one at `open`, or -1. */
function closeAt(s: string, open: number, a: string, b: string): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === a) depth++;
    else if (s[i] === b && --depth === 0) return i;
  }
  return -1;
}

/** Rewrites \frac{a}{b} as typed (a)/(b), so it can sit beside other typed maths such as sqrt(x). Gives up quietly if it cannot. */
function flattenFractions(src: string): string {
  let s = src;
  // x^{2} and x_{n} become x^(2) and x_(n)
  for (let guard = 0; guard < 50 && /[\^_]\{[^{}]*\}/.test(s); guard++) s = s.replace(/([\^_])\{([^{}]*)\}/g, "$1($2)");
  const re = /\\d?frac\s*\{/;
  for (let guard = 0; guard < 100; guard++) {
    const m = re.exec(s);
    if (!m) return s;
    const aOpen = m.index + m[0].length - 1;
    const aClose = closeAt(s, aOpen, "{", "}");
    if (aClose < 0) return src;
    const gap = s.slice(aClose + 1).search(/\S/);
    const bOpen = gap < 0 ? -1 : aClose + 1 + gap;
    if (bOpen < 0 || s[bOpen] !== "{") return src;
    const bClose = closeAt(s, bOpen, "{", "}");
    if (bClose < 0) return src;
    s = `${s.slice(0, m.index)} (${s.slice(aOpen + 1, aClose)})/(${s.slice(bOpen + 1, bClose)}) ${s.slice(bClose + 1)}`;
  }
  return src;
}

/** In a formula written as LaTeX, still understands sqrt(x) and root(3)(x), which LaTeX itself does not. */
function rawLatex(src: string): string {
  let s = src;
  const re = /(?<![\\A-Za-z])(sqrt|root)\(/;
  for (let guard = 0; guard < 50; guard++) {
    const m = re.exec(s);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    const close = closeAt(s, open, "(", ")");
    if (close < 0) break;
    const inner = s.slice(open + 1, close);
    if (m[1] === "sqrt") {
      s = `${s.slice(0, m.index)}\\sqrt{${inner}}${s.slice(close + 1)}`;
      continue;
    }
    if (s[close + 1] !== "(") break;
    const close2 = closeAt(s, close + 1, "(", ")");
    if (close2 < 0) break;
    s = `${s.slice(0, m.index)}\\sqrt[${inner}]{${s.slice(close + 2, close2)}}${s.slice(close2 + 1)}`;
  }
  return s;
}

/**
 * Turns quick, typed maths such as d^2/dx^2 or sqrt(x)/2 into LaTeX.
 * \frac{a}{b} may be mixed in with typed maths. A formula that is otherwise already LaTeX (it still has a backslash
 * or curly brackets) is left as written, apart from sqrt( ) and root( )( ).
 * A typed formula with a fraction, integral, sum, product or limit is shown at full size.
 */
export function typedToLatex(src: string): string {
  const flat = flattenFractions(src);
  if (/[\\{}]/.test(flat)) return rawLatex(src);
  try {
    parser ??= new AsciiMathParser();
    const out = parser.parse(flat).trim();
    if (!out) return src;
    return BIG.test(out) ? `\\displaystyle ${out}` : out;
  } catch {
    return src;
  }
}

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

const MATH = ["language-math", "math-inline", "math-display"];

function walk(node: HastNode): void {
  const cls = node.properties?.className;
  if (node.type === "element" && Array.isArray(cls) && cls.some((c) => MATH.includes(String(c)))) {
    for (const child of node.children ?? []) {
      if (child.type === "text" && typeof child.value === "string") child.value = typedToLatex(child.value);
    }
    return;
  }
  node.children?.forEach(walk);
}

/** A rehype plugin that runs before KaTeX, so $d^2/dx^2$ works as well as $\frac{d^2}{dx^2}$. */
export function rehypeTypedMath() {
  return (tree: HastNode) => walk(tree);
}