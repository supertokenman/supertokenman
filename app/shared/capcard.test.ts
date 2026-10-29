import { describe, it, expect } from 'vitest';
import { capCard, CAP_TOOLS, estTokens } from './capcard';

describe('capCard', () => {
  it('fits the size budget', () => {
    const s = capCard();
    expect(s.length).toBeLessThanOrEqual(1200);
    expect(estTokens(s)).toBeLessThanOrEqual(300);
  });

  it('names every default tool', () => {
    const s = capCard();
    for (const t of CAP_TOOLS) expect(s).toContain(t);
  });

  it('drops lines for filtered-out tools', () => {
    const s = capCard({ tools: ['mcp__stm__manual', 'mcp__stm__link'] });
    expect(s).toContain('mcp__stm__manual');
    expect(s).toContain('mcp__stm__link');
    expect(s).not.toContain('mcp__stm__team_plan');
    expect(s).not.toContain('mcp__stm__team_provision');
    expect(s).not.toContain('mcp__stm__loop_start');
    expect(s).not.toContain('mcp__stm__trigger_create');
  });

  it('contains no emoji', () => {
    expect(/\p{Extended_Pictographic}/u.test(capCard())).toBe(false);
  });
});
