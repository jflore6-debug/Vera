import { useStore } from 'zustand';
import { useDeckStore } from '../store/deckStore';
import type { Deck } from '../lib/types';

function summarize(deck: Partial<Deck> | undefined): string {
  const slideCount = deck?.slides?.length ?? 0;
  return `${slideCount} slide${slideCount === 1 ? '' : 's'}`;
}

export function HistoryPanel() {
  const { pastStates, futureStates, undo, redo, clear } = useStore(useDeckStore.temporal);
  const currentDeck = useDeckStore((s) => s.deck);

  const entries = [
    ...pastStates.map((p, i) => ({
      key: `past-${i}`,
      label: `Edit ${i + 1}`,
      summary: summarize(p.deck),
      kind: 'past' as const,
      stepsBack: pastStates.length - i,
    })),
    { key: 'current', label: `Now`, summary: summarize(currentDeck), kind: 'current' as const, stepsBack: 0 },
    ...futureStates
      .slice()
      .reverse()
      .map((f, i) => ({
        key: `future-${i}`,
        label: `Redo ${i + 1}`,
        summary: summarize(f.deck),
        kind: 'future' as const,
        stepsForward: futureStates.length - i,
      })),
  ];

  return (
    <div className="flor-panel">
      <div className="flor-panel__header">
        <h3>History</h3>
        <div className="flor-history__controls">
          <button className="flor-btn flor-btn--sm" disabled={pastStates.length === 0} onClick={() => undo()}>
            ↶ Undo
          </button>
          <button className="flor-btn flor-btn--sm" disabled={futureStates.length === 0} onClick={() => redo()}>
            ↷ Redo
          </button>
        </div>
      </div>
      <p className="flor-empty">Every edit is tracked automatically. Jump to any point below.</p>
      <div className="flor-history-list">
        {entries.map((entry) => (
          <button
            key={entry.key}
            className={`flor-history-list__item flor-history-list__item--${entry.kind}`}
            onClick={() => {
              if (entry.kind === 'past') undo((entry as { stepsBack: number }).stepsBack);
              if (entry.kind === 'future') redo((entry as { stepsForward: number }).stepsForward);
            }}
          >
            <span className="flor-history-list__dot" />
            <span className="flor-history-list__label">{entry.label}</span>
            <span className="flor-history-list__summary">{entry.summary}</span>
          </button>
        ))}
      </div>
      {pastStates.length > 0 && (
        <button className="flor-btn flor-btn--ghost flor-btn--sm" onClick={() => clear()}>
          Clear history
        </button>
      )}
    </div>
  );
}
