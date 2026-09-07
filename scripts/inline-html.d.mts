export const PORTABLE_CSP: string;

export interface InlineHtmlInput {
  readonly html: string;
  readonly css: string;
  readonly js: string;
  readonly portableCsp?: string;
}

export function inlineHtml(input: InlineHtmlInput): string;

export function assertPortable(html: string): void;
