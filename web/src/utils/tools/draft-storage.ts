export const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
export function readToolDraft<T>(raw: string | null, validate: (data: unknown) => data is T, now = Date.now()): T | null {
  try { const saved = JSON.parse(raw ?? 'null'); return saved?.version === 1 && Number.isFinite(saved.savedAt) && saved.savedAt <= now && now - saved.savedAt < DRAFT_TTL && validate(saved.data) ? saved.data : null; } catch { return null; }
}
export function serializeToolDraft(data: unknown) { return JSON.stringify({ version: 1, savedAt: Date.now(), data }); }
