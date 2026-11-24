import fs from 'node:fs/promises';
import path from 'node:path';

export async function extractText(filePath: string, kind: 'pdf' | 'docx'): Promise<string> {
  const buf = await fs.readFile(filePath);
  if (kind === 'pdf') {
    // pdf-parse default export
    const pdfParse = (await import('pdf-parse')).default as any;
    const data = await pdfParse(buf);
    return String(data.text || '').trim();
  }
  const mammoth = await import('mammoth');
  const res = await (mammoth as any).extractRawText({ buffer: buf });
  return String(res.value || '').trim();
}