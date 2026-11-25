import { describe, expect, it } from 'vitest';
import { formatViolationSummary, selectBlockingViolations } from './a11y-helpers';

const violation = (id: string, impact: string | null | undefined, nodeCount = 1) => ({
  id,
  impact,
  help: `help for ${id}`,
  helpUrl: `https://example.com/${id}`,
  nodes: Array.from({ length: nodeCount }, () => ({})),
});

describe('a11y violation helpers', () => {
  it('filters non-blocking impacts', () => {
    const results = { violations: [violation('minor', 'minor'), violation('moderate', 'moderate')] } as any;
    expect(selectBlockingViolations(results)).toEqual([]);
  });

  it('selects only serious and critical violations', () => {
    const results = {
      violations: [
        violation('minor-rule', 'minor'),
        violation('moderate-rule', 'moderate'),
        violation('serious-rule', 'serious'),
        violation('critical-rule', 'critical'),
      ],
    } as any;
    const blocking = selectBlockingViolations(results);
    expect(blocking.map((v: any) => v.id)).toEqual(['serious-rule', 'critical-rule']);
  });

  it('excludes violations with undefined impact', () => {
    const results = {
      violations: [violation('undefined-rule', undefined), violation('null-rule', null), violation('serious-rule', 'serious')],
    } as any;
    const blocking = selectBlockingViolations(results);
    expect(blocking.map((v: any) => v.id)).toEqual(['serious-rule']);
  });

  it('selects and formats serious violations', () => {
    const results = { violations: [violation('serious-rule', 'serious'), violation('critical-rule', 'critical')] } as any;
    const blocking = selectBlockingViolations(results);
    expect(blocking).toHaveLength(2);
    expect(formatViolationSummary(blocking)).toContain('serious-rule');
    expect(formatViolationSummary(blocking)).toContain('https://example.com/serious-rule');
  });

  it('includes impact, id, help, node count and helpUrl in the summary', () => {
    const results = {
      violations: [violation('serious-rule', 'serious', 3), violation('critical-rule', 'critical', 2)],
    } as any;
    const summary = formatViolationSummary(selectBlockingViolations(results));
    for (const v of results.violations) {
      expect(summary).toContain(v.impact);
      expect(summary).toContain(v.id);
      expect(summary).toContain(v.help);
      expect(summary).toContain(String(v.nodes.length));
      expect(summary).toContain(v.helpUrl);
    }
  });
});
