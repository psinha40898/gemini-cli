/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadableSettingScope } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { getDialogSettingKeys } from '../../utils/settingsUtils.js';
import { checkExhaustive } from '../../utils/checks.js';

// ============================================================================
// Types
// ============================================================================

export interface SettingsDialogState {
  // Navigation
  focusSection: 'settings' | 'scope';
  selectedScope: LoadableSettingScope;
  activeSettingIndex: number;
  scrollOffset: number;

  // Search
  searchQuery: string;
  filteredKeys: string[];

  // Tracks restart-required settings that have been modified this session.
  // Once a restart-required key is changed, it stays in this set until restart.
  // All settings (including restart-required) are saved immediately on change.
  restartDirtyKeys: Set<string>;
}

export type SettingsDialogAction =
  // Navigation
  | { type: 'SET_FOCUS'; section: 'settings' | 'scope' }
  | { type: 'TOGGLE_FOCUS' }
  | { type: 'SET_SCOPE'; scope: LoadableSettingScope }
  | {
      type: 'NAVIGATE';
      direction: 'up' | 'down';
      itemCount: number;
      maxVisible: number;
    }

  // Search
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_FILTERED_KEYS'; keys: string[] }

  // Restart-required tracking
  | { type: 'MARK_RESTART_DIRTY'; key: string };

// ============================================================================
// Initial State Factory
// ============================================================================

export function createInitialState(): SettingsDialogState {
  return {
    focusSection: 'settings',
    selectedScope: SettingScope.User,
    activeSettingIndex: 0,
    scrollOffset: 0,
    searchQuery: '',
    filteredKeys: getDialogSettingKeys(),
    restartDirtyKeys: new Set(),
  };
}

// ============================================================================
// Reducer
// ============================================================================

export function settingsDialogReducer(
  state: SettingsDialogState,
  action: SettingsDialogAction,
): SettingsDialogState {
  switch (action.type) {
    case 'SET_FOCUS':
      return { ...state, focusSection: action.section };

    case 'TOGGLE_FOCUS':
      return {
        ...state,
        focusSection: state.focusSection === 'settings' ? 'scope' : 'settings',
      };

    case 'SET_SCOPE':
      return { ...state, selectedScope: action.scope };

    case 'NAVIGATE': {
      const { direction, itemCount, maxVisible } = action;
      let newIndex: number;
      let newScrollOffset = state.scrollOffset;

      if (direction === 'up') {
        newIndex =
          state.activeSettingIndex > 0
            ? state.activeSettingIndex - 1
            : itemCount - 1;

        // Adjust scroll for wrap-around
        if (newIndex === itemCount - 1) {
          newScrollOffset = Math.max(0, itemCount - maxVisible);
        } else if (newIndex < state.scrollOffset) {
          newScrollOffset = newIndex;
        }
      } else {
        newIndex =
          state.activeSettingIndex < itemCount - 1
            ? state.activeSettingIndex + 1
            : 0;

        // Adjust scroll for wrap-around
        if (newIndex === 0) {
          newScrollOffset = 0;
        } else if (newIndex >= state.scrollOffset + maxVisible) {
          newScrollOffset = newIndex - maxVisible + 1;
        }
      }

      return {
        ...state,
        activeSettingIndex: newIndex,
        scrollOffset: newScrollOffset,
      };
    }

    case 'SET_SEARCH_QUERY':
      // Guard: prevent unnecessary re-renders if query unchanged
      if (state.searchQuery === action.query) return state;
      return {
        ...state,
        searchQuery: action.query,
      };

    case 'SET_FILTERED_KEYS': {
      // Guard: prevent unnecessary re-renders if keys unchanged
      const keysUnchanged =
        action.keys.length === state.filteredKeys.length &&
        action.keys.every((k, i) => k === state.filteredKeys[i]);
      if (keysUnchanged) return state;
      return {
        ...state,
        filteredKeys: action.keys,
        activeSettingIndex: 0,
        scrollOffset: 0,
      };
    }

    case 'MARK_RESTART_DIRTY': {
      if (state.restartDirtyKeys.has(action.key)) return state;
      const next = new Set(state.restartDirtyKeys);
      next.add(action.key);
      return { ...state, restartDirtyKeys: next };
    }

    default:
      checkExhaustive(action);
  }
}
