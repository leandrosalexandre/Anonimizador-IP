import { describe, expect, it } from 'vitest';
import { CSP, CSP_DIRECTIVES } from '../csp.ts';

describe('Content Security Policy (SPEC 2.3)', () => {
  it('restringe tudo à própria origem', () => {
    expect(CSP_DIRECTIVES['default-src']).toBe("'self'");
    expect(CSP_DIRECTIVES['connect-src']).toBe("'self'");
    expect(CSP_DIRECTIVES['img-src']).toBe("'self' blob: data:");
    expect(CSP_DIRECTIVES['worker-src']).toBe("'self' blob:");
  });

  it('não permite eval nem scripts inline', () => {
    expect(CSP).not.toMatch(/'unsafe-eval'/);
    expect(CSP).not.toMatch(/'unsafe-inline'/);
    expect(CSP_DIRECTIVES['script-src']).toBe("'self' 'wasm-unsafe-eval'");
  });

  it('não menciona nenhuma origem externa', () => {
    expect(CSP).not.toMatch(/https?:|\*/);
  });
});
