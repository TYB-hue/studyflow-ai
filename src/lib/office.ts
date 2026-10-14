import 'server-only';
import yauzl from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ApiError } from '@/lib/api';
import { MAX_TEXT_CHARS } from '@/lib/core';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_EXPANDED = 40 * 1024 * 1024;
const MAX_XML = 8 * 1024 * 1024;
export async function extractOffice(bytes: Buffer, mime: string) {
  const entries = await new Promise<Map<string, string>>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) {
        reject(new ApiError('This Office file is damaged or is not a valid DOCX/PPTX.'));
        return;
      }
      const texts = new Map<string, string>();
      let expanded = 0;
      let count = 0;
      let failed = false;
      const stop = (error: unknown) => {
        if (!failed) {
          failed = true;
          zip.close();
          reject(error);
        }
      };
      zip.on('error', stop);
      zip.on('end', () => {
        if (!failed) resolve(texts);
      });
      zip.on('entry', (entry: yauzl.Entry) => {
        if (++count > 3000 || (expanded += entry.uncompressedSize) > MAX_EXPANDED) {
          stop(
            new ApiError('Office file expands beyond the safe processing limit. Export it as PDF.'),
          );
          return;
        }
        if (entry.generalPurposeBitFlag & 1) {
          stop(new ApiError('Password-protected Office files are not supported.'));
          return;
        }
        const wanted =
          entry.fileName === '[Content_Types].xml' ||
          (mime === DOCX_MIME
            ? entry.fileName === 'word/document.xml'
            : /^ppt\/slides\/slide\d+\.xml$/.test(entry.fileName));
        if (!wanted) {
          zip.readEntry();
          return;
        }
        if (entry.uncompressedSize > MAX_XML) {
          stop(new ApiError('An Office XML section is too large. Export it as PDF.'));
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            stop(new ApiError('Unable to read this Office file.'));
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          stream.on('error', stop);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_XML) {
              stream.destroy();
              stop(new ApiError('Office content is too large.'));
            } else chunks.push(chunk);
          });
          stream.on('end', () => {
            if (!failed) {
              texts.set(entry.fileName, Buffer.concat(chunks).toString('utf8'));
              zip.readEntry();
            }
          });
        });
      });
      zip.readEntry();
    });
  });
  if (!entries.has('[Content_Types].xml'))
    throw new ApiError('This ZIP archive is not an Office document.');
  const names =
    mime === DOCX_MIME
      ? ['word/document.xml']
      : [...entries.keys()]
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]));
  if (!names.length || names.some((n) => !entries.has(n)))
    throw new ApiError('The file content does not match its DOCX/PPTX extension.');
  const pages = names
    .map((name) => ({
      page: mime === DOCX_MIME ? 1 : Number(name.match(/slide(\d+)/)![1]),
      text: xmlText(entries.get(name)!),
    }))
    .filter((p) => p.text);
  if (!pages.length)
    throw new ApiError(
      'No readable text was found. For image-only slides or diagrams, export as PDF.',
    );
  if (pages.length > 80 || pages.reduce((sum, p) => sum + p.text.length, 0) > MAX_TEXT_CHARS)
    throw new ApiError('The extracted material is too long. Split it into smaller documents.');
  return pages;
}
function xmlText(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new ApiError('Unsafe or malformed Office XML.');
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: true,
    processEntities: true,
    trimValues: false,
    parseTagValue: false,
  });
  const output: string[] = [];
  function walk(nodes: unknown, inText = false) {
    if (Array.isArray(nodes)) {
      for (const node of nodes) walk(node, inText);
      return;
    }
    if (!nodes || typeof nodes !== 'object') return;
    for (const [tag, value] of Object.entries(nodes)) {
      if (tag === '#text') {
        if (inText) output.push(String(value));
      } else {
        walk(value, tag === 'w:t' || tag === 'a:t' || inText);
        if (['w:p', 'a:p', 'w:br', 'a:br'].includes(tag)) output.push('\n');
      }
    }
  }
  walk(parser.parse(xml));
  return output
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
