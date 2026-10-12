// Byte-range parsing for the production Worker (worker/index.mjs); kept apart so the Worker's
// entry module exports only its fetch handler.

/**
 * Parses a Range header for a file of `size` bytes.
 * Returns null (serve the whole file), { start, end } (inclusive), or 'unsatisfiable'.
 */
export function parseRange(header, size) {
  const m = /^\s*bytes\s*=\s*(.*)$/i.exec(header ?? '');
  if (!m) return null; // no range, or a unit other than bytes: ignore it
  const specs = m[1].split(',');
  // Several ranges would need a multipart reply; the whole file is a valid answer instead.
  if (specs.length > 1) return null;
  const spec = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(specs[0]);
  if (!spec || (spec[1] === '' && spec[2] === '')) return 'unsatisfiable';
  if (spec[1] === '') {
    // Suffix: the last N bytes.
    const length = Number(spec[2]);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(spec[1]);
  const end = spec[2] === '' ? size - 1 : Math.min(Number(spec[2]), size - 1);
  if (start >= size || (spec[2] !== '' && Number(spec[2]) < start)) return 'unsatisfiable';
  return { start, end };
}
