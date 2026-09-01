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

// Number(el.getAttribute(name)) || fallback is a trap: a legitimate "0"
// attribute value is falsy as a *number*, so `||` would wrongly replace it
// with fallback. Check attribute presence (as a string) first instead.
function numAttr(el: Element | null, name: string, fallback: number): number {
  const raw = el?.getAttribute(name);
  return raw !== null && raw !== undefined && raw !== '' ? Number(raw) : fallback;
}

function firstDirectChild(parent: Element | null, tag: string): Element | null {
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tag) return child;
  }
  return null;
}

function relTarget(relsXml: string | undefined, typeSuffix: string): string | null {
  if (!relsXml) return null;
  const doc = parseXml(relsXml);
  for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
    if ((r.getAttribute('Type') ?? '').endsWith(typeSuffix)) return r.getAttribute('Target');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Theme / scheme color resolution
// ---------------------------------------------------------------------------

type ThemeColors = Record<string, string>; // dk1,lt1,dk2,lt2,accent1..6,hlink,folHlink -> hex (no '#')
type ClrMap = Record<string, string>; // bg1/tx1/bg2/tx2/accent1../hlink/folHlink -> theme slot name

function parseTheme(themeXml: string | undefined): ThemeColors {
  const colors: ThemeColors = {};
  if (!themeXml) return colors;
  const doc = parseXml(themeXml);
  const scheme = doc.getElementsByTagName('a:clrScheme')[0];
  if (!scheme) return colors;
  for (const slot of Array.from(scheme.children)) {
    const name = slot.tagName.replace('a:', '');
    const srgb = slot.getElementsByTagName('a:srgbClr')[0];
    const sys = slot.getElementsByTagName('a:sysClr')[0];
    const val = srgb?.getAttribute('val') ?? sys?.getAttribute('lastClr');
    if (val) colors[name] = val.toUpperCase();
  }
  return colors;
}

function parseClrMap(masterXml: string | undefined): ClrMap {
  const map: ClrMap = {};
  if (!masterXml) return map;
  const doc = parseXml(masterXml);
  const clrMap = doc.getElementsByTagName('p:clrMap')[0];
  if (!clrMap) return map;
  for (const attr of Array.from(clrMap.attributes)) {
    map[attr.name] = attr.value;
  }
  return map;
}

interface ColorContext {
  theme: ThemeColors;
  clrMap: ClrMap;
}

// Resolves a <a:srgbClr>/<a:schemeClr>/<a:sysClr> found as a descendant of
// `container` (e.g. a <a:solidFill> or <a:ln>) to a "#RRGGBB" string.
function resolveColorIn(container: Element | null, ctx: ColorContext): string | null {
  if (!container) return null;
  const srgb = container.getElementsByTagName('a:srgbClr')[0];
  if (srgb) {
    const val = srgb.getAttribute('val');
    if (val) return `#${val}`;
  }
  const sys = container.getElementsByTagName('a:sysClr')[0];
  if (sys) {
    const val = sys.getAttribute('lastClr');
    if (val) return `#${val}`;
  }
  const scheme = container.getElementsByTagName('a:schemeClr')[0];
  if (scheme) {
    const slot = scheme.getAttribute('val');
    if (slot) {
      const mapped = ctx.clrMap[slot] ?? slot; // accent1..6/hlink/folHlink map to themselves
      const hex = ctx.theme[mapped];
      if (hex) return `#${hex}`;
    }
  }
  return null;
}

// Fill color for a shape/run: looks for a direct-child <a:solidFill>, falling
// back to the first stop of a <a:gradFill> as an approximation (Flor doesn't
// model gradients).
function findFillColor(container: Element | null, ctx: ColorContext): string | null {
  const solid = firstDirectChild(container, 'a:solidFill');
  if (solid) {
    const c = resolveColorIn(solid, ctx);
    if (c) return c;
  }
  const grad = firstDirectChild(container, 'a:gradFill');
  if (grad) {
    const firstStop = grad.getElementsByTagName('a:gs')[0];
    const c = resolveColorIn(firstStop, ctx);
    if (c) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geometry: EMU <-> percent, and group (p:grpSp) child-space transforms
// ---------------------------------------------------------------------------

// Maps a shape's own reported off/ext (in whatever local coordinate space it
// was authored in) to the slide's top-level EMU space: X = a*x + e, and
// extents (which are vectors, not points) scale by a/d with no offset.
interface Affine {
  a: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Affine = { a: 1, d: 1, e: 0, f: 0 };

function composeGroupTransform(
  parent: Affine,
  groupOff: { x: number; y: number },
  groupExt: { cx: number; cy: number },
  chOff: { x: number; y: number },
  chExt: { cx: number; cy: number }
): Affine {
  const scaleX = chExt.cx !== 0 ? groupExt.cx / chExt.cx : 1;
  const scaleY = chExt.cy !== 0 ? groupExt.cy / chExt.cy : 1;
  const a = parent.a * scaleX;
  const d = parent.d * scaleY;
  const e = parent.a * groupOff.x + parent.e - a * chOff.x;
  const f = parent.d * groupOff.y + parent.f - d * chOff.y;
  return { a, d, e, f };
}

interface EmuBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

// Reads an off/ext/rot xfrm element and maps it through `transform` into
// top-level slide EMU space. Returns null if there's no xfrm at all (caller
// decides the fallback, e.g. placeholder inheritance) as opposed to it just
// having a zero position.
function readXfrmElement(xfrm: Element | null, transform: Affine): EmuBox | null {
  if (!xfrm) return null;
  const off = firstDirectChild(xfrm, 'a:off');
  const ext = firstDirectChild(xfrm, 'a:ext');
  const xEmu = off?.getAttribute('x') ? Number(off.getAttribute('x')) : 0;
  const yEmu = off?.getAttribute('y') ? Number(off.getAttribute('y')) : 0;
  const wEmu = ext?.getAttribute('cx') ? Number(ext.getAttribute('cx')) : 0;
  const hEmu = ext?.getAttribute('cy') ? Number(ext.getAttribute('cy')) : 0;
  const rotAttr = xfrm.getAttribute('rot');
  const rot = rotAttr ? Math.round((Number(rotAttr) / 60000) * 10) / 10 : 0;

  return {
    x: transform.a * xEmu + transform.e,
    y: transform.d * yEmu + transform.f,
    w: transform.a * wEmu,
    h: transform.d * hEmu,
    rot,
  };
}

// Convenience: find the xfrm by tag name under `parent` first (spPr/grpSpPr
// use <a:xfrm>, but p:graphicFrame uses <p:xfrm> directly), then read it.
function readXfrm(parent: Element | null, xfrmTag: string, transform: Affine): EmuBox | null {
  return readXfrmElement(firstDirectChild(parent, xfrmTag), transform);
}

function emuBoxToPercent(box: EmuBox, slideWEmu: number, slideHEmu: number) {
  return {
    x: (box.x / slideWEmu) * 100,
    y: (box.y / slideHEmu) * 100,
    w: (box.w / slideWEmu) * 100,
    h: (box.h / slideHEmu) * 100,
    rot: box.rot,
  };
}

// ---------------------------------------------------------------------------
// Placeholder (p:ph) position/size inheritance: slide -> layout -> master
// ---------------------------------------------------------------------------

interface PlaceholderRef {
  type: string | null;
  idx: string | null;
}

function getPlaceholderRef(sp: Element): PlaceholderRef | null {
  const ph = sp.getElementsByTagName('p:ph')[0];
  if (!ph) return null;
  return { type: ph.getAttribute('type'), idx: ph.getAttribute('idx') };
}

interface PlaceholderIndex {
  byIdx: Map<string, EmuBox>;
  byType: Map<string, EmuBox>;
}

function indexPlaceholders(spTree: Element | null): PlaceholderIndex {
  const byIdx = new Map<string, EmuBox>();
  const byType = new Map<string, EmuBox>();
  if (!spTree) return { byIdx, byType };
  for (const child of Array.from(spTree.children)) {
    if (child.tagName !== 'p:sp') continue;
    const spPr = firstDirectChild(child, 'p:spPr');
    const box = readXfrm(spPr, 'a:xfrm', IDENTITY);
    if (!box) continue;
    const ref = getPlaceholderRef(child);
    if (!ref) continue;
    if (ref.idx) byIdx.set(ref.idx, box);
    if (ref.type) byType.set(ref.type, box);
  }
  return { byIdx, byType };
}

function resolvePlaceholderBox(ref: PlaceholderRef, ...indexes: PlaceholderIndex[]): EmuBox | null {
  for (const idx of indexes) {
    if (ref.idx && idx.byIdx.has(ref.idx)) return idx.byIdx.get(ref.idx)!;
  }
  for (const idx of indexes) {
    if (ref.type && idx.byType.has(ref.type)) return idx.byType.get(ref.type)!;
    // "title"/"ctrTitle" are both title-shaped; let either satisfy the other.
    if (ref.type === 'ctrTitle' && idx.byType.has('title')) return idx.byType.get('title')!;
    if (ref.type === 'title' && idx.byType.has('ctrTitle')) return idx.byType.get('ctrTitle')!;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

function extractText(sp: Element, bodyTag: string): { text: string; bullet: boolean } {
  const txBody = sp.getElementsByTagName(bodyTag)[0];
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
function extractRunStyle(sp: Element, bodyTag: string, ctx: ColorContext): RunStyle {
  const defaults: RunStyle = { fontSize: 18, bold: false, italic: false, color: '#1f2430' };
  const txBody = sp.getElementsByTagName(bodyTag)[0];
  if (!txBody) return defaults;
  const rPr = txBody.getElementsByTagName('a:r')[0]?.getElementsByTagName('a:rPr')[0] ?? txBody.getElementsByTagName('a:endParaRPr')[0];
  if (!rPr) return defaults;

  const szAttr = rPr.getAttribute('sz');
  const fontSize = szAttr ? Math.round(Number(szAttr)) / 100 : defaults.fontSize;
  const bold = rPr.getAttribute('b') === '1';
  const italic = rPr.getAttribute('i') === '1';
  const typeface = rPr.getElementsByTagName('a:latin')[0]?.getAttribute('typeface') ?? undefined;
  const color = findFillColor(rPr, ctx) ?? defaults.color;

  return {
    fontSize: fontSize > 0 ? fontSize : defaults.fontSize,
    bold,
    italic,
    fontFamily: typeface,
    color,
  };
}

// Paragraph/body properties are always in the drawingml (a:) namespace,
// regardless of whether the enclosing text body is <p:txBody> (shapes) or
// <a:txBody> (table cells) — so no bodyTag parameter is needed here.
function extractAlign(sp: Element): 'left' | 'center' | 'right' {
  const algn = sp.getElementsByTagName('a:pPr')[0]?.getAttribute('algn');
  if (algn === 'ctr') return 'center';
  if (algn === 'r') return 'right';
  return 'left';
}

function extractVerticalAlign(sp: Element): 'top' | 'middle' | 'bottom' {
  const anchor = sp.getElementsByTagName('a:bodyPr')[0]?.getAttribute('anchor');
  if (anchor === 'ctr') return 'middle';
  if (anchor === 'b') return 'bottom';
  return 'top';
}

// ---------------------------------------------------------------------------
// Shape fill/stroke/geometry
// ---------------------------------------------------------------------------

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

function extractShapeGeometry(spPr: Element | null, ctx: ColorContext): { shape: ShapeKind; fill: string; stroke?: string } {
  const prst = spPr?.getElementsByTagName('a:prstGeom')[0]?.getAttribute('prst') ?? 'rect';
  const shape = GEOM_TO_SHAPE[prst] ?? 'rect';

  // OOXML default (absent a p:style/a:fillRef, which we don't resolve): a
  // shape with no explicit <a:solidFill>/<a:gradFill> or <a:noFill> renders
  // unfilled, not some arbitrary color.
  const fill = findFillColor(spPr, ctx) ?? 'transparent';

  const ln = firstDirectChild(spPr, 'a:ln');
  const lnHasNoFill = !!firstDirectChild(ln, 'a:noFill');
  const stroke = lnHasNoFill ? undefined : (findFillColor(ln, ctx) ?? undefined);

  return { shape, fill, stroke };
}

// ---------------------------------------------------------------------------
// Table import: approximate as a grid of bordered rects + text
// ---------------------------------------------------------------------------

function importTable(graphicFrame: Element, transform: Affine, slideWEmu: number, slideHEmu: number, ctx: ColorContext): SlideElement[] {
  const frameBox = readXfrm(graphicFrame, 'p:xfrm', transform);
  const tbl = graphicFrame.getElementsByTagName('a:tbl')[0];
  if (!frameBox || !tbl) return [];

  const colWidths = Array.from(tbl.getElementsByTagName('a:gridCol')).map((c) => numAttr(c, 'w', 0));
  const rows = Array.from(tbl.getElementsByTagName('a:tr'));
  const rowHeights = rows.map((r) => numAttr(r, 'h', 0));
  const totalW = colWidths.reduce((a, b) => a + b, 0) || 1;
  const totalH = rowHeights.reduce((a, b) => a + b, 0) || 1;

  const elements: SlideElement[] = [];
  let yEmu = 0;
  rows.forEach((row, ri) => {
    let xEmu = 0;
    const cells = Array.from(row.getElementsByTagName('a:tc'));
    cells.forEach((cell, ci) => {
      const colW = colWidths[ci] ?? totalW / cells.length;
      const rowH = rowHeights[ri] ?? totalH / rows.length;
      const cellX = frameBox.x + (xEmu / totalW) * frameBox.w;
      const cellY = frameBox.y + (yEmu / totalH) * frameBox.h;
      const cellW = (colW / totalW) * frameBox.w;
      const cellH = (rowH / totalH) * frameBox.h;

      const tcPr = firstDirectChild(cell, 'a:tcPr');
      const cellFill = findFillColor(tcPr, ctx) ?? '#ffffff';

      elements.push({
        id: uuid(),
        type: 'shape',
        x: (cellX / slideWEmu) * 100,
        y: (cellY / slideHEmu) * 100,
        w: (cellW / slideWEmu) * 100,
        h: (cellH / slideHEmu) * 100,
        shape: 'rect',
        fill: cellFill,
        stroke: '#d8d8d2',
      });

      const { text } = extractText(cell, 'a:txBody');
      if (text.trim()) {
        const style = extractRunStyle(cell, 'a:txBody', ctx);
        elements.push({
          id: uuid(),
          type: 'text',
          x: (cellX / slideWEmu) * 100,
          y: (cellY / slideHEmu) * 100,
          w: (cellW / slideWEmu) * 100,
          h: (cellH / slideHEmu) * 100,
          content: text,
          fontSize: Math.min(style.fontSize, 16),
          color: style.color,
          align: extractAlign(cell),
          verticalAlign: 'middle',
          bold: style.bold,
          italic: style.italic,
          fontFamily: style.fontFamily,
        });
      }
      xEmu += colW;
    });
    yEmu += rowHeights[ri] ?? 0;
  });

  return elements;
}

// ---------------------------------------------------------------------------
// Recursive shape-tree walk (handles nested p:grpSp)
// ---------------------------------------------------------------------------

interface WalkContext {
  zip: JSZip;
  slidePath: string;
  rels: Record<string, string>;
  slideWEmu: number;
  slideHEmu: number;
  colorCtx: ColorContext;
  placeholderIndexes: PlaceholderIndex[];
}

async function walkTree(nodes: Element[], transform: Affine, ctx: WalkContext): Promise<SlideElement[]> {
  const elements: SlideElement[] = [];

  for (const child of nodes) {
    if (child.tagName === 'p:grpSp') {
      const grpSpPr = firstDirectChild(child, 'p:grpSpPr');
      const xfrm = firstDirectChild(grpSpPr, 'a:xfrm');
      const off = firstDirectChild(xfrm, 'a:off');
      const ext = firstDirectChild(xfrm, 'a:ext');
      const chOff = firstDirectChild(xfrm, 'a:chOff');
      const chExt = firstDirectChild(xfrm, 'a:chExt');
      const groupOff = { x: numAttr(off, 'x', 0), y: numAttr(off, 'y', 0) };
      const groupExt = { cx: numAttr(ext, 'cx', 1), cy: numAttr(ext, 'cy', 1) };
      const groupChOff = { x: numAttr(chOff, 'x', groupOff.x), y: numAttr(chOff, 'y', groupOff.y) };
      const groupChExt = { cx: numAttr(chExt, 'cx', groupExt.cx), cy: numAttr(chExt, 'cy', groupExt.cy) };
      const childTransform = composeGroupTransform(transform, groupOff, groupExt, groupChOff, groupChExt);
      const nested = Array.from(child.children).filter((c) => ['p:sp', 'p:pic', 'p:grpSp', 'p:graphicFrame', 'p:cxnSp'].includes(c.tagName));
      elements.push(...(await walkTree(nested, childTransform, ctx)));
      continue;
    }

    if (child.tagName === 'p:graphicFrame') {
      const isTable = !!child.getElementsByTagName('a:tbl')[0];
      if (isTable) {
        elements.push(...importTable(child, transform, ctx.slideWEmu, ctx.slideHEmu, ctx.colorCtx));
      }
      continue;
    }

    if (child.tagName === 'p:sp' || child.tagName === 'p:cxnSp') {
      const spPr = firstDirectChild(child, 'p:spPr');
      const ref = getPlaceholderRef(child);
      let box = readXfrm(spPr, 'a:xfrm', transform);
      if (!box && ref) {
        const inherited = resolvePlaceholderBox(ref, ...ctx.placeholderIndexes);
        if (inherited) box = inherited; // placeholder boxes are already top-level EMU
      }
      if (!box) {
        box = { x: 0, y: ctx.slideHEmu * 0.4, w: ctx.slideWEmu * 0.3, h: ctx.slideHEmu * 0.2, rot: 0 };
      }
      const pct = emuBoxToPercent(box, ctx.slideWEmu, ctx.slideHEmu);
      const { text, bullet } = extractText(child, 'p:txBody');

      if (text.trim()) {
        const style = extractRunStyle(child, 'p:txBody', ctx.colorCtx);
        elements.push({
          id: uuid(),
          type: 'text',
          x: pct.x,
          y: pct.y,
          w: pct.w,
          h: pct.h,
          rotation: pct.rot || undefined,
          content: text,
          fontSize: style.fontSize,
          color: style.color,
          align: extractAlign(child),
          verticalAlign: extractVerticalAlign(child),
          bold: style.bold,
          italic: style.italic,
          fontFamily: style.fontFamily,
          bullet,
        });
      } else if (child.tagName === 'p:sp') {
        const geo = extractShapeGeometry(spPr, ctx.colorCtx);
        if (geo.fill === 'transparent' && !geo.stroke) continue;
        // A "line" shape has no area — its color lives on the stroke
        // (a:ln), but Flor renders/exports a line using `fill`.
        const fill = geo.shape === 'line' ? (geo.stroke ?? geo.fill) : geo.fill;
        elements.push({
          id: uuid(),
          type: 'shape',
          x: pct.x,
          y: pct.y,
          w: pct.w,
          h: Math.max(pct.h, 0.3),
          rotation: pct.rot || undefined,
          shape: geo.shape,
          fill,
          stroke: geo.stroke,
        });
      }
      continue;
    }

    if (child.tagName === 'p:pic') {
      const spPr = firstDirectChild(child, 'p:spPr');
      const box = readXfrm(spPr, 'a:xfrm', transform);
      if (!box) continue;
      const pct = emuBoxToPercent(box, ctx.slideWEmu, ctx.slideHEmu);
      const blip = child.getElementsByTagName('a:blip')[0];
      const rId =
        blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
        blip?.getAttribute('r:embed');
      const target = rId ? ctx.rels[rId] : null;
      if (!target) continue;
      const mediaPath = resolvePath(ctx.slidePath, target);
      const dataUrl = await fileToDataUrl(ctx.zip, mediaPath);
      if (!dataUrl) continue;
      elements.push({
        id: uuid(),
        type: 'image',
        x: pct.x,
        y: pct.y,
        w: pct.w,
        h: pct.h,
        rotation: pct.rot || undefined,
        src: dataUrl,
      });
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

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

  // Cache theme/master/layout parsing per path — many slides share the same
  // layout/master/theme, and re-parsing per slide would be wasteful.
  const layoutCache = new Map<string, { placeholders: PlaceholderIndex; colorCtx: ColorContext }>();

  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath)?.async('text');
    if (!slideXml) continue;
    const slideDoc = parseXml(slideXml);

    const relsPath = resolvePath(slidePath, `_rels/${slidePath.split('/').pop()}.rels`);
    const relsXml = await zip.file(relsPath)?.async('text');
    const rels = relsXml ? readRels(relsXml) : {};

    let layoutPlaceholders: PlaceholderIndex = { byIdx: new Map(), byType: new Map() };
    let masterPlaceholders: PlaceholderIndex = { byIdx: new Map(), byType: new Map() };
    let colorCtx: ColorContext = { theme: {}, clrMap: {} };

    const layoutRelTarget = relTarget(relsXml, '/slideLayout');
    const layoutPath = layoutRelTarget ? resolvePath(slidePath, layoutRelTarget) : null;

    if (layoutPath) {
      const cached = layoutCache.get(layoutPath);
      if (cached) {
        colorCtx = cached.colorCtx;
        layoutPlaceholders = cached.placeholders;
      } else {
        const layoutXml = await zip.file(layoutPath)?.async('text');
        if (layoutXml) {
          const layoutDoc = parseXml(layoutXml);
          layoutPlaceholders = indexPlaceholders(layoutDoc.getElementsByTagName('p:spTree')[0] ?? null);

          const layoutRelsPath = resolvePath(layoutPath, `_rels/${layoutPath.split('/').pop()}.rels`);
          const layoutRelsXml = await zip.file(layoutRelsPath)?.async('text');
          const masterRelTarget = relTarget(layoutRelsXml, '/slideMaster');
          const masterPath = masterRelTarget ? resolvePath(layoutPath, masterRelTarget) : null;

          if (masterPath) {
            const masterXml = await zip.file(masterPath)?.async('text');
            if (masterXml) {
              const masterDoc = parseXml(masterXml);
              masterPlaceholders = indexPlaceholders(masterDoc.getElementsByTagName('p:spTree')[0] ?? null);
              const clrMap = parseClrMap(masterXml);

              const masterRelsPath = resolvePath(masterPath, `_rels/${masterPath.split('/').pop()}.rels`);
              const masterRelsXml = await zip.file(masterRelsPath)?.async('text');
              const themeRelTarget = relTarget(masterRelsXml, '/theme');
              const themePath = themeRelTarget ? resolvePath(masterPath, themeRelTarget) : null;
              const themeXml = themePath ? await zip.file(themePath)?.async('text') : undefined;
              colorCtx = { theme: parseTheme(themeXml), clrMap };
            }
          }
          layoutCache.set(layoutPath, { colorCtx, placeholders: layoutPlaceholders });
        }
      }
    }

    const spTree = slideDoc.getElementsByTagName('p:spTree')[0];
    const topNodes = spTree
      ? Array.from(spTree.children).filter((c) => ['p:sp', 'p:pic', 'p:grpSp', 'p:graphicFrame', 'p:cxnSp'].includes(c.tagName))
      : [];

    const walkCtx: WalkContext = {
      zip,
      slidePath,
      rels,
      slideWEmu,
      slideHEmu,
      colorCtx,
      placeholderIndexes: [layoutPlaceholders, masterPlaceholders],
    };
    const elements = await walkTree(topNodes, IDENTITY, walkCtx);

    let background = '#ffffff';
    const bg = slideDoc.getElementsByTagName('p:bg')[0];
    const bgPr = bg ? firstDirectChild(bg, 'p:bgPr') : null;
    const bgColor = bgPr ? findFillColor(bgPr, colorCtx) : null;
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
