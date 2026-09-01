import JSZip from 'jszip';
import { v4 as uuid } from 'uuid';
import type { Deck, Slide, SlideElement, ShapeKind } from './types';
import { makeDeck } from './factory';

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function mimeFromExt(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

async function fileToDataUrl(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  const base64 = await file.async('base64');
  return `data:${mimeFromExt(path)};base64,${base64}`;
}

function readRels(xml: string): Record<string, string> {
  const doc = parseXml(xml);
  const map: Record<string, string> = {};
  Array.from(doc.getElementsByTagName('Relationship')).forEach((r) => {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (id && target) map[id] = target;
  });
  return map;
}

function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative.slice(1);
  const baseParts = base.split('/').slice(0, -1);
  const relParts = relative.split('/');
  for (const part of relParts) {
    if (part === '..') baseParts.pop();
    else if (part === '.') continue;
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

function xfrmBox(spPr: Element | null, slideWEmu: number, slideHEmu: number) {
  const xfrm = spPr?.getElementsByTagName('a:xfrm')[0] ?? null;
  const off = xfrm?.getElementsByTagName('a:off')[0] ?? null;
  const ext = xfrm?.getElementsByTagName('a:ext')[0] ?? null;
  const xEmu = off?.getAttribute('x') ? Number(off.getAttribute('x')) : 0;
  const yEmu = off?.getAttribute('y') ? Number(off.getAttribute('y')) : 0;
  const wEmu = ext?.getAttribute('cx') ? Number(ext.getAttribute('cx')) : slideWEmu * 0.3;
  const hEmu = ext?.getAttribute('cy') ? Number(ext.getAttribute('cy')) : slideHEmu * 0.2;
  return {
    x: (xEmu / slideWEmu) * 100,
    y: (yEmu / slideHEmu) * 100,
    w: (wEmu / slideWEmu) * 100,
    h: (hEmu / slideHEmu) * 100,
  };
}

function extractText(sp: Element): { text: string; bullet: boolean } {
  const txBody = sp.getElementsByTagName('p:txBody')[0];
  if (!txBody) return { text: '', bullet: false };
  const paragraphs = Array.from(txBody.getElementsByTagName('a:p'));
  let bullet = false;
  const lines = paragraphs.map((p) => {
    if (p.getElementsByTagName('a:buChar').length || p.getElementsByTagName('a:buAutoNum').length) {
      bullet = true;
    }
    const runs = Array.from(p.getElementsByTagName('a:t'));
    return runs.map((r) => r.textContent ?? '').join('');
  });
  return { text: lines.join('\n'), bullet };
}

// Direct-child solidFill lookup (not a descendant search), so we don't
// accidentally pick up a color that belongs to a run, a line, or a shadow.
function directChildColor(parent: Element | null, childTag: string): string | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child.tagName === childTag) {
      const srgb = child.getElementsByTagName('a:srgbClr')[0];
      const val = srgb?.getAttribute('val');
      return val ? `#${val}` : null;
    }
  }
  return null;
}

function firstDirectChild(parent: Element | null, tag: string): Element | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tag) return child;
  }
  return null;
}

interface RunStyle {
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fontFamily?: string;
  color: string;
}

// Styling comes from the first run in the shape's text body (paragraph and
// run-level formatting can vary per-run, but Flor's text elements only
// carry one style, so we take the lead run as representative).
function extractRunStyle(sp: Element): RunStyle {
  const defaults: RunStyle = { fontSize: 18, bold: false, italic: false, color: '#1f2430' };
  const txBody = sp.getElementsByTagName('p:txBody')[0];
  if (!txBody) return defaults;
  const rPr = txBody.getElementsByTagName('a:r')[0]?.getElementsByTagName('a:rPr')[0] ?? txBody.getElementsByTagName('a:endParaRPr')[0];
  if (!rPr) return defaults;

  const szAttr = rPr.getAttribute('sz');
  const fontSize = szAttr ? Math.round(Number(szAttr)) / 100 : defaults.fontSize;
  const bold = rPr.getAttribute('b') === '1';
  const italic = rPr.getAttribute('i') === '1';
  const typeface = rPr.getElementsByTagName('a:latin')[0]?.getAttribute('typeface') ?? undefined;
  const color = directChildColor(rPr, 'a:solidFill') ?? defaults.color;

  return {
    fontSize: fontSize > 0 ? fontSize : defaults.fontSize,
    bold,
    italic,
    fontFamily: typeface,
    color,
  };
}

function extractAlign(sp: Element): 'left' | 'center' | 'right' {
  const algn = sp.getElementsByTagName('a:pPr')[0]?.getAttribute('algn');
  if (algn === 'ctr') return 'center';
  if (algn === 'r') return 'right';
  return 'left';
}

const GEOM_TO_SHAPE: Record<string, ShapeKind> = {
  rect: 'rect',
  roundRect: 'roundRect',
  round2SameRect: 'roundRect',
  round2DiagRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  line: 'line',
  straightConnector1: 'line',
  bentConnector2: 'line',
  bentConnector3: 'line',
};

function extractShapeGeometry(spPr: Element | null): { shape: ShapeKind; fill: string; stroke?: string } {
  const prst = spPr?.getElementsByTagName('a:prstGeom')[0]?.getAttribute('prst') ?? 'rect';
  const shape = GEOM_TO_SHAPE[prst] ?? 'rect';

  // OOXML default (absent a p:style/a:fillRef, which we don't resolve): a
  // shape with no explicit <a:solidFill> or <a:noFill> renders unfilled,
  // not some arbitrary color.
  const explicitFill = directChildColor(spPr, 'a:solidFill');
  const fill = explicitFill ?? 'transparent';

  const ln = firstDirectChild(spPr, 'a:ln');
  const lnHasNoFill = !!firstDirectChild(ln, 'a:noFill');
  const stroke = lnHasNoFill ? undefined : (directChildColor(ln, 'a:solidFill') ?? undefined);

  return { shape, fill, stroke };
}

export async function importPptxFile(file: File): Promise<Deck> {
  const zip = await JSZip.loadAsync(file);

  const presentationXml = await zip.file('ppt/presentation.xml')?.async('text');
  if (!presentationXml) throw new Error('Not a valid .pptx file (missing presentation.xml)');
  const presDoc = parseXml(presentationXml);
  const sldSz = presDoc.getElementsByTagName('p:sldSz')[0];
  const slideWEmu = Number(sldSz?.getAttribute('cx')) || 12192000;
  const slideHEmu = Number(sldSz?.getAttribute('cy')) || 6858000;

  const presRelsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
  const presRels = presRelsXml ? readRels(presRelsXml) : {};

  const sldIds = Array.from(presDoc.getElementsByTagName('p:sldId'));
  const slidePaths = sldIds
    .map((sldId) => {
      const rId = sldId.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sldId.getAttribute('r:id');
      if (!rId) return null;
      const target = presRels[rId];
      return target ? resolvePath('ppt/presentation.xml', target) : null;
    })
    .filter((p): p is string => !!p);

  const slides: Slide[] = [];

  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath)?.async('text');
    if (!slideXml) continue;
    const slideDoc = parseXml(slideXml);

    const relsPath = resolvePath(slidePath, `_rels/${slidePath.split('/').pop()}.rels`);
    const relsXml = await zip.file(relsPath)?.async('text');
    const rels = relsXml ? readRels(relsXml) : {};

    const elements: SlideElement[] = [];
    const spTree = slideDoc.getElementsByTagName('p:spTree')[0];
    if (spTree) {
      for (const child of Array.from(spTree.children)) {
        if (child.tagName === 'p:sp') {
          const spPr = child.getElementsByTagName('p:spPr')[0] ?? null;
          const box = xfrmBox(spPr, slideWEmu, slideHEmu);
          const { text, bullet } = extractText(child);
          if (text.trim()) {
            const style = extractRunStyle(child);
            elements.push({
              id: uuid(),
              type: 'text',
              x: box.x,
              y: box.y,
              w: box.w,
              h: box.h,
              content: text,
              fontSize: style.fontSize,
              color: style.color,
              align: extractAlign(child),
              bold: style.bold,
              italic: style.italic,
              fontFamily: style.fontFamily,
              bullet,
            });
          } else {
            // No text: this is a decorative shape (divider, card background,
            // accent box). Reconstruct it so the slide keeps its visual
            // structure instead of just losing the shape entirely.
            const geo = extractShapeGeometry(spPr);
            if (geo.fill === 'transparent' && !geo.stroke) continue;
            // A "line" shape has no area — its color lives on the stroke
            // (a:ln), but Flor renders/exports a line using `fill`. Use the
            // stroke color as the line's fill so it's actually visible.
            const fill = geo.shape === 'line' ? (geo.stroke ?? geo.fill) : geo.fill;
            elements.push({
              id: uuid(),
              type: 'shape',
              x: box.x,
              y: box.y,
              w: box.w,
              h: Math.max(box.h, 0.3),
              shape: geo.shape,
              fill,
              stroke: geo.stroke,
            });
          }
        } else if (child.tagName === 'p:pic') {
          const spPr = child.getElementsByTagName('p:spPr')[0] ?? null;
          const box = xfrmBox(spPr, slideWEmu, slideHEmu);
          const blip = child.getElementsByTagName('a:blip')[0];
          const rId =
            blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
            blip?.getAttribute('r:embed');
          const target = rId ? rels[rId] : null;
          if (!target) continue;
          const mediaPath = resolvePath(slidePath, target);
          const dataUrl = await fileToDataUrl(zip, mediaPath);
          if (!dataUrl) continue;
          elements.push({
            id: uuid(),
            type: 'image',
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            src: dataUrl,
          });
        }
      }
    }

    let background = '#ffffff';
    const bg = slideDoc.getElementsByTagName('p:bg')[0];
    const bgPr = bg ? firstDirectChild(bg, 'p:bgPr') : null;
    const bgColor = bgPr ? directChildColor(bgPr, 'a:solidFill') : null;
    if (bgColor) background = bgColor;

    slides.push({ id: uuid(), background, elements });
  }

  const name = file.name.replace(/\.pptx$/i, '') || 'Imported presentation';
  if (slides.length === 0) {
    const fallback = makeDeck(name);
    return fallback;
  }

  const now = Date.now();
  return { id: uuid(), name, slides, createdAt: now, updatedAt: now };
}
