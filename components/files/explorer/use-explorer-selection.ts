import { useCallback, useEffect, useMemo, useState } from "react";

import type { EntryKey } from "@/components/files/explorer/model";

type SelectionState = { selected: ReadonlySet<EntryKey>; anchor: EntryKey | null; focus: EntryKey | null };

const EMPTY: SelectionState = { selected: new Set(), anchor: null, focus: null };

function rangeBetween(ordered: EntryKey[], from: EntryKey | null, to: EntryKey) {
  const end = ordered.indexOf(to);
  const start = from ? ordered.indexOf(from) : -1;
  if (end < 0) return [];
  if (start < 0) return [to];
  const [low, high] = start <= end ? [start, end] : [end, start];
  return ordered.slice(low, high + 1);
}

/**
 * Seleção no estilo Explorer sobre a lista visível ordenada:
 * clique = só ele; Ctrl/Cmd = alterna; Shift = intervalo desde a âncora;
 * setas movem o foco (Shift estende).
 */
export function useExplorerSelection(orderedKeys: EntryKey[]) {
  const [state, setState] = useState<SelectionState>(EMPTY);

  // Itens que saíram da lista (navegou/filtrou/excluiu) deixam a seleção.
  useEffect(() => {
    setState((current) => {
      if (current.selected.size === 0 && !current.focus) return current;
      const visible = new Set(orderedKeys);
      const selected = new Set(Array.from(current.selected).filter((key) => visible.has(key)));
      const focus = current.focus && visible.has(current.focus) ? current.focus : null;
      const anchor = current.anchor && visible.has(current.anchor) ? current.anchor : null;
      if (selected.size === current.selected.size && focus === current.focus && anchor === current.anchor) return current;
      return { selected, focus, anchor };
    });
  }, [orderedKeys]);

  const click = useCallback(
    (key: EntryKey, modifiers: { ctrl?: boolean; shift?: boolean } = {}) => {
      setState((current) => {
        if (modifiers.shift) {
          const range = rangeBetween(orderedKeys, current.anchor ?? current.focus, key);
          const selected = modifiers.ctrl ? new Set([...current.selected, ...range]) : new Set(range);
          return { selected, anchor: current.anchor ?? key, focus: key };
        }
        if (modifiers.ctrl) {
          const selected = new Set(current.selected);
          if (selected.has(key)) selected.delete(key);
          else selected.add(key);
          return { selected, anchor: key, focus: key };
        }
        return { selected: new Set([key]), anchor: key, focus: key };
      });
    },
    [orderedKeys]
  );

  /** Clique direito: mantém a seleção se o item já faz parte dela. */
  const ensureSelected = useCallback((key: EntryKey) => {
    setState((current) =>
      current.selected.has(key) ? { ...current, focus: key } : { selected: new Set([key]), anchor: key, focus: key }
    );
  }, []);

  const toggle = useCallback((key: EntryKey) => {
    setState((current) => {
      const selected = new Set(current.selected);
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { selected, anchor: key, focus: key };
    });
  }, []);

  const selectKeys = useCallback((keys: EntryKey[]) => {
    setState({ selected: new Set(keys), anchor: keys[0] ?? null, focus: keys[keys.length - 1] ?? null });
  }, []);

  const selectAll = useCallback(() => {
    setState((current) => ({ selected: new Set(orderedKeys), anchor: orderedKeys[0] ?? null, focus: current.focus }));
  }, [orderedKeys]);

  const clear = useCallback(() => setState(EMPTY), []);

  const moveFocus = useCallback(
    (delta: number, extend: boolean) => {
      setState((current) => {
        if (orderedKeys.length === 0) return current;
        const at = current.focus ? orderedKeys.indexOf(current.focus) : -1;
        const nextIndex = at < 0 ? (delta > 0 ? 0 : orderedKeys.length - 1) : Math.max(0, Math.min(orderedKeys.length - 1, at + delta));
        const key = orderedKeys[nextIndex];
        if (extend) {
          const anchor = current.anchor ?? current.focus ?? key;
          return { selected: new Set(rangeBetween(orderedKeys, anchor, key)), anchor, focus: key };
        }
        return { selected: new Set([key]), anchor: key, focus: key };
      });
    },
    [orderedKeys]
  );

  const selectedKeys = useMemo(
    () => orderedKeys.filter((key) => state.selected.has(key)),
    [orderedKeys, state.selected]
  );

  return {
    selected: state.selected,
    selectedKeys,
    focus: state.focus,
    click,
    ensureSelected,
    toggle,
    selectKeys,
    selectAll,
    clear,
    moveFocus
  };
}
