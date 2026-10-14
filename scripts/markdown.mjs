// A small, strict Markdown renderer for the two product documents the site republishes
// (PRIVACY.md and docs/app-store/support.md). It supports only what those documents use:
// headings, paragraphs, bullet and numbered lists, tables, **bold**, `code` and links.
// Anything else stays plain escaped text. Links are resolved by the caller (`link`), so a
// relative link in the product repository can become a site page or a GitHub URL.

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline Markdown → HTML. `link(href)` returns the href to use, or throws. */
export function renderInline(text, link) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m;
    if ((m = rest.match(/^`([^`]+)`/))) {
      out += `<code>${escapeHtml(m[1])}</code>`;
    } else if ((m = rest.match(/^\*\*(.+?)\*\*/))) {
      out += `<strong>${renderInline(m[1], link)}</strong>`;
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      out += `<a href="${escapeHtml(link(m[2]))}">${renderInline(m[1], link)}</a>`;
    } else {
      m = rest.match(/^[^`*[]+|^[\s\S]/);
      out += escapeHtml(m[0]);
    }
    i += m[0].length;
  }
  return out;
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/**
 * Block Markdown → HTML. Headings keep their level (# → h1, ## → h2). Tables are wrapped in a
 * scrollable, labelled region so they never widen the page on a phone.
 */
export function renderMarkdown(source, { link }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let lastHeading = '';
  let i = 0;
  const inline = (t) => renderInline(t, link);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.+)$/))) {
      const level = m[1].length;
      lastHeading = m[2].replace(/[*`]/g, '');
      html.push(`<h${level}>${inline(m[2])}</h${level}>`);
      i += 1;
    } else if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      if (rows.length < 2 || !/^[\s|:-]+$/.test(rows[1])) throw new Error(`表格格式不正确：${rows[0]}`);
      const head = cells(rows[0]);
      const align = cells(rows[1]).map((c) => (/^-+:$/.test(c) ? ' class="num"' : ''));
      const body = rows.slice(2).map((r) => cells(r));
      if (body.some((r) => r.length !== head.length)) throw new Error(`表格列数不一致：${rows[0]}`);
      html.push(
        `<div class="legal__table" role="region" tabindex="0" aria-label="${escapeHtml(lastHeading)}">`,
        '<table>',
        `<thead><tr>${head.map((c, k) => `<th scope="col"${align[k]}>${inline(c)}</th>`).join('')}</tr></thead>`,
        `<tbody>${body.map((r) => `<tr>${r.map((c, k) => `<td${align[k]}>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`,
        '</table>',
        '</div>',
      );
    } else if (/^(?:- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const marker = ordered ? /^\d+\. / : /^- /;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) {
        let item = lines[i++].replace(marker, '');
        // Indented continuation lines belong to the same item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item += ` ${lines[i++].trim()}`;
        items.push(`<li>${inline(item)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.join('')}</${tag}>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*\||- |\d+\. )/.test(lines[i])) para.push(lines[i++].trim());
      html.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return html.join('\n');
}

/** Resolves a relative link inside the product repository against the document's own path. */
export function resolveRepoPath(docPath, href) {
  const parts = docPath.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (seg === '..') {
      if (!parts.length) throw new Error(`链接超出仓库：${href}`);
      parts.pop();
    } else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}
