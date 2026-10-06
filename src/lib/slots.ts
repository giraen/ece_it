/** `{R}` slots in a wording. A brace right after a letter, digit, _, ^, } or \\ is LaTeX (X_{L}, \\text{R}) and is left alone. */
export const SLOT = /(?<![A-Za-z0-9_^}\\])\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function slotsIn(stem: string): string[] {
  return Array.from(stem.matchAll(SLOT), (m) => m[1]);
}