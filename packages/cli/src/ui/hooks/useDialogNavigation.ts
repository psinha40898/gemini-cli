/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useReducer, useEffect, useRef, useCallback } from 'react';
import { checkExhaustive } from '@google/gemini-cli-core';

export type FocusSection = 'settings' | 'scope';

export interface DialogNavigationState {
  activeIndex: number;
  scrollOffset: number;
  focusSection: FocusSection;
}

type Action =
  | { type: 'MOVE_UP'; itemCount: number; maxVisible: number }
  | { type: 'MOVE_DOWN'; itemCount: number; maxVisible: number }
  | { type: 'SET_SECTION'; section: FocusSection }
  | { type: 'TOGGLE_SECTION' }
  | {
      type: 'SET_ACTIVE_INDEX';
      index: number;
      maxVisible: number;
      itemCount: number;
    }
  | { type: 'RESET'; activeIndex: number; scrollOffset: number };

function reducer(
  state: DialogNavigationState,
  action: Action,
): DialogNavigationState {
  switch (action.type) {
    case 'MOVE_UP': {
      const newIndex =
        state.activeIndex > 0 ? state.activeIndex - 1 : action.itemCount - 1;
      let newScroll = state.scrollOffset;
      if (newIndex === action.itemCount - 1) {
        newScroll = Math.max(0, action.itemCount - action.maxVisible);
      } else if (newIndex < state.scrollOffset) {
        newScroll = newIndex;
      }
      return { ...state, activeIndex: newIndex, scrollOffset: newScroll };
    }
    case 'MOVE_DOWN': {
      const newIndex =
        state.activeIndex < action.itemCount - 1 ? state.activeIndex + 1 : 0;
      let newScroll = state.scrollOffset;
      if (newIndex === 0) {
        newScroll = 0;
      } else if (newIndex >= state.scrollOffset + action.maxVisible) {
        newScroll = newIndex - action.maxVisible + 1;
      }
      return { ...state, activeIndex: newIndex, scrollOffset: newScroll };
    }
    case 'SET_SECTION':
      return { ...state, focusSection: action.section };
    case 'TOGGLE_SECTION':
      return {
        ...state,
        focusSection: state.focusSection === 'settings' ? 'scope' : 'settings',
      };
    case 'SET_ACTIVE_INDEX': {
      let newScroll = state.scrollOffset;
      if (action.index < state.scrollOffset) {
        newScroll = action.index;
      } else if (action.index >= state.scrollOffset + action.maxVisible) {
        newScroll = action.index - action.maxVisible + 1;
      }
      const maxScroll = Math.max(0, action.itemCount - action.maxVisible);
      newScroll = Math.min(newScroll, maxScroll);
      return { ...state, activeIndex: action.index, scrollOffset: newScroll };
    }
    case 'RESET':
      return {
        ...state,
        activeIndex: action.activeIndex,
        scrollOffset: action.scrollOffset,
      };
    default:
      return checkExhaustive(action);
  }
}

interface UseDialogNavigationOptions {
  /** The current list of items (used for smart reset on change) */
  items: Array<{ key: string }>;
  /** Maximum number of visible items */
  maxVisible: number;
  /** Whether the scope selector is shown (controls focus fallback) */
  showScopeSelector: boolean;
}

export interface DialogNavigationAPI {
  state: DialogNavigationState;
  moveUp: () => void;
  moveDown: () => void;
  setSection: (section: FocusSection) => void;
  toggleSection: () => void;
  setActiveIndex: (index: number) => void;
  reset: (activeIndex: number, scrollOffset: number) => void;
}

export function useDialogNavigation({
  items,
  maxVisible,
  showScopeSelector,
}: UseDialogNavigationOptions): DialogNavigationAPI {
  const [state, dispatch] = useReducer(reducer, {
    activeIndex: 0,
    scrollOffset: 0,
    focusSection: 'settings' as FocusSection,
  });

  const prevItemsRef = useRef(items);

  // Smart reset: preserve focus when items change (e.g., search filter)
  useEffect(() => {
    const prevItems = prevItemsRef.current;
    if (prevItems !== items) {
      const prevActiveItem = prevItems[state.activeIndex];
      if (prevActiveItem) {
        const newIndex = items.findIndex((i) => i.key === prevActiveItem.key);
        if (newIndex !== -1) {
          // Item still exists in the filtered list, keep focus on it
          dispatch({
            type: 'SET_ACTIVE_INDEX',
            index: newIndex,
            maxVisible,
            itemCount: items.length,
          });
        } else {
          // Item was filtered out, reset to the top
          dispatch({ type: 'RESET', activeIndex: 0, scrollOffset: 0 });
        }
      } else {
        dispatch({ type: 'RESET', activeIndex: 0, scrollOffset: 0 });
      }
      prevItemsRef.current = items;
    }
  }, [items, state.activeIndex, maxVisible]);

  // Ensure focus stays on settings when scope selection is hidden
  useEffect(() => {
    if (!showScopeSelector && state.focusSection === 'scope') {
      dispatch({ type: 'SET_SECTION', section: 'settings' });
    }
  }, [showScopeSelector, state.focusSection]);

  const moveUp = useCallback(() => {
    dispatch({ type: 'MOVE_UP', itemCount: items.length, maxVisible });
  }, [items.length, maxVisible]);

  const moveDown = useCallback(() => {
    dispatch({ type: 'MOVE_DOWN', itemCount: items.length, maxVisible });
  }, [items.length, maxVisible]);

  const setSection = useCallback((section: FocusSection) => {
    dispatch({ type: 'SET_SECTION', section });
  }, []);

  const toggleSection = useCallback(() => {
    dispatch({ type: 'TOGGLE_SECTION' });
  }, []);

  const setActiveIndex = useCallback(
    (index: number) => {
      dispatch({
        type: 'SET_ACTIVE_INDEX',
        index,
        maxVisible,
        itemCount: items.length,
      });
    },
    [items.length, maxVisible],
  );

  const reset = useCallback((activeIndex: number, scrollOffset: number) => {
    dispatch({ type: 'RESET', activeIndex, scrollOffset });
  }, []);

  return {
    state,
    moveUp,
    moveDown,
    setSection,
    toggleSection,
    setActiveIndex,
    reset,
  };
}
