import AsciiMathParser from "asciimath2tex";

let parser: AsciiMathParser | null = null;

/** Formulas with these get the full "display" size, so fractions and integrals are not squashed inside a sentence. */
const BIG = /\\(?:frac|int|oint|sum|prod|lim)\b/;

/**
 * Turns quick, typed maths such as d^2/dx^2 or sqrt(x)/2 into LaTeX.
 * Anything that already looks like LaTeX (it has a backslash or curly brackets) is left exactly as written.
 * A typed formula with a fraction, integral, sum, product or limit is shown at full size.
 */
export function typedToLatex(src: string): string {
  if (/[\\{}]/.test(src)) return src;
  try {
    parser ??= new AsciiMathParser();
    const out = parser.parse(src).trim();
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