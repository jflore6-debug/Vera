// Bullets are rendered as pure CSS decoration (see .flor-bullet-line), never
// baked into the stored text. Older saved content may still carry a literal
// leading "•" from before that fix (editing used to capture the visual
// prefix into the real text); strip it defensively so those projects
// self-heal instead of showing doubled bullets forever.
export function stripLeadingBulletGlyph(line: string): string {
  return line.replace(/^•\s*/, '');
}
