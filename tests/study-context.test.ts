import { describe, it, expect } from 'vitest';
import { studyContext } from '@/lib/study-context';
describe('bounded study context', () => {
  it('keeps meaningful complete sentences when sampling long pages', () => {
    const text =
      'Negation reverses the truth value. Disjunction is true when at least one proposition is true. ';
    const result = studyContext(
      Array.from({ length: 65 }, (_, i) => ({ page: i + 1, content: text.repeat(20) })),
    );
    expect(result.material).toContain('Negation reverses the truth value.');
    expect(result.material).toContain('Disjunction is true when at least one proposition is true.');
  });
  it('keeps small sources complete', () => {
    expect(studyContext([{ page: 4, content: 'ATP' }])).toEqual({
      material: '[Page 4] ATP',
      sampled: false,
      pages: 1,
    });
  });
  it('covers every page of a long lecture within the request budget', () => {
    const result = studyContext(
      Array.from({ length: 70 }, (_, i) => ({ page: i + 1, content: 'A'.repeat(1500) })),
    );
    expect(result.material.length).toBeLessThanOrEqual(6000);
    expect(result.sampled).toBe(true);
    for (let i = 1; i <= 70; i++) expect(result.material).toContain(`[Page ${i}]`);
  });
  it('removes overlap instead of duplicating it in prompts', () => {
    const one = 'a'.repeat(1600) + 'b'.repeat(200);
    const two = 'b'.repeat(200) + 'c'.repeat(700);
    expect(
      studyContext([
        { page: 1, content: one },
        { page: 1, content: two },
      ]).material,
    ).toBe('[Page 1] ' + one + 'c'.repeat(700));
  });
});
