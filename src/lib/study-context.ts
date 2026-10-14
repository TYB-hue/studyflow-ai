// Keep input small enough for free provider tiers while covering every original page.
export function studyContext(chunks: { page: number; content: string }[], budget = 6000) {
  const grouped = new Map<number, string[]>();
  for (const chunk of chunks) {
    const texts = grouped.get(chunk.page) || [];
    texts.push(chunk.content);
    grouped.set(chunk.page, texts);
  }
  const pages = [...grouped.entries()].map(([page, texts]) => ({
    page,
    text: texts.reduce((all, next) => {
      // Processing uses a 200-character overlap within each page.
      return all
        ? all + (all.slice(-200) === next.slice(0, 200) ? next.slice(200) : '\n' + next)
        : next;
    }, ''),
  }));
  const full = pages.map((p) => `[Page ${p.page}] ${p.text}`).join('\n');
  if (full.length <= budget) return { material: full, sampled: false, pages: pages.length };
  const perPage = Math.max(10, Math.floor((budget - pages.length * 22) / pages.length));
  const material = pages
    .map((p) => {
      if (p.text.length <= perPage) return `[Page ${p.page}] ${p.text}`;
      const sentences = p.text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const eligible = sentences.filter((t) => t.length <= perPage);
      if (eligible.length) {
        let excerpt = eligible[(p.page - 1) % eligible.length];
        for (const sentence of eligible) {
          if (sentence !== excerpt && excerpt.length + sentence.length + 1 <= perPage)
            excerpt += ' ' + sentence;
        }
        return `[Page ${p.page}] ${excerpt}`;
      }
      // Use one continuous passage, never a mix of severed sentence fragments.
      const passage = p.text.slice(0, perPage);
      const boundary = passage.lastIndexOf(' ');
      return `[Page ${p.page}] ${boundary > perPage / 2 ? passage.slice(0, boundary) : passage}`;
    })
    .join('\n');
  return { material, sampled: true, pages: pages.length };
}
