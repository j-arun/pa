const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

function renderInlineMarkdown(line: string): string {
  return line
    .split(
      /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|(?<!\w)_[^_\n]+_(?!\w)|!\[[^\]]*\]\((?:https?:\/\/|mailto:)[^\s)]+\)|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))/g,
    )
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
        return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      }
      if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
        return `<del>${escapeHtml(part.slice(2, -2))}</del>`;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
        return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      }
      const image = part.match(/^!\[([^\]]*)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/);
      if (image) {
        const label = image[1] ? renderInlineMarkdown(image[1]) : 'View image';
        return `<a href="${escapeHtml(image[2])}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
      const link = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/);
      if (link) {
        return `<a href="${escapeHtml(link[2])}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(link[1])}</a>`;
      }
      return escapeHtml(part);
    })
    .join('');
}

export function renderMarkdownToHtml(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => {
      if (segment.startsWith('```') && segment.endsWith('```')) {
        const lines = segment.slice(3, -3).split('\n');
        const language = (lines[0] || '').trim();
        const code = (language ? lines.slice(1) : lines).join('\n').trim();
        const languageHtml = language
          ? `<div class="code-language">${escapeHtml(language)}</div>`
          : '';
        return `<div class="code-block">${languageHtml}<pre><code>${escapeHtml(code)}</code></pre></div>`;
      }

      const blocks = segment
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

      return blocks
        .map((block) => {
          const lines = block.split('\n');
          const isUnorderedList = lines.every((line) => /^\s*[-*]\s+/.test(line));
          const isOrderedList = lines.every((line) => /^\s*\d+\.\s+/.test(line));
          const tableSeparator = lines[1]
            ?.trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim());
          const isTable =
            lines.length >= 2 &&
            lines[0].includes('|') &&
            Boolean(tableSeparator?.length) &&
            tableSeparator.every((cell) => /^:?-{3,}:?$/.test(cell));

          if (isUnorderedList) {
            return `<ul>${lines
              .map((line) => `<li>${renderInlineMarkdown(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
              .join('')}</ul>`;
          }

          if (isOrderedList) {
            return `<ol>${lines
              .map((line) => `<li>${renderInlineMarkdown(line.replace(/^\s*\d+\.\s+/, ''))}</li>`)
              .join('')}</ol>`;
          }

          if (isTable && tableSeparator) {
            const cells = (line: string) =>
              line
                .trim()
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map((cell) => cell.trim());
            const alignments = tableSeparator.map((cell) =>
              cell.startsWith(':') && cell.endsWith(':')
                ? 'center'
                : cell.endsWith(':')
                  ? 'right'
                  : cell.startsWith(':')
                    ? 'left'
                    : '',
            );
            const header = `<thead><tr>${cells(lines[0])
              .map(
                (cell, index) =>
                  `<th${alignments[index] ? ` style="text-align:${alignments[index]}"` : ''}>${renderInlineMarkdown(cell)}</th>`,
              )
              .join('')}</tr></thead>`;
            const body = lines
              .slice(2)
              .map(
                (line) =>
                  `<tr>${cells(line)
                    .map(
                      (cell, index) =>
                        `<td${alignments[index] ? ` style="text-align:${alignments[index]}"` : ''}>${renderInlineMarkdown(cell)}</td>`,
                    )
                    .join('')}</tr>`,
              )
              .join('');
            return `<div class="table-wrap"><table>${header}<tbody>${body}</tbody></table></div>`;
          }

          if (
            lines.length === 1 &&
            /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(lines[0])
          ) {
            return '<hr>';
          }

          if (lines.every((line) => /^\s{0,3}>/.test(line))) {
            const quotedText = lines
              .map((line) => line.replace(/^\s{0,3}>\s?/, ''))
              .join('\n');
            return `<blockquote>${renderMarkdownToHtml(quotedText)}</blockquote>`;
          }

          if (lines.length === 1) {
            const heading = lines[0].match(/^\s{0,3}(#{1,6})\s+(.+)$/);
            if (heading) {
              const level = Math.min(6, heading[1].length + 2);
              return `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`;
            }
          }

          return `<p>${lines.map(renderInlineMarkdown).join('<br>')}</p>`;
        })
        .join('\n');
    })
    .join('\n');
}
