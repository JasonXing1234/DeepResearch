// Shared parser for user-supplied company list files (TXT/CSV/TSV), used by
// both the /simple flow and the /sustainability project uploads so the two
// surfaces stay in sync.

const HEADER_RE = /^(company|name|companies|organization|org|customer_name)$/i;

/**
 * Parse a TXT file: one company per non-blank, non-comment line.
 * Parse a CSV/TSV file: take the first column of each row, skip header rows
 * that look like column titles (e.g. "Company", "Name").
 */
export function parseCompanyFile(text: string, isCsv: boolean): string[] {
  const lines = text.split(/\r?\n/);

  return lines
    .map((line) => {
      const cell = isCsv ? line.split(/[,\t]/)[0] : line;
      return cell.trim().replace(/^["']|["']$/g, '');
    })
    .filter((name) => name.length > 0 && !name.startsWith('#') && !HEADER_RE.test(name));
}
