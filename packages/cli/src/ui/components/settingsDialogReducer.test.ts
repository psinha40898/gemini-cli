/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  settingsDialogReducer,
  createInitialState,
  type SettingsDialogState,
  type SettingsDialogAction,
} from './settingsDialogReducer.js';
import { SettingScope } from '../../config/settings.js';
import type { Settings } from '../../config/settingsSchema.js';
import { getDialogSettingKeys } from '../../utils/settingsUtils.js';

// Mock merged settings for testing
const mockMergedSettings: Settings = {} as Settings;

describe('settingsDialogReducer', () => {
  let initialState: SettingsDialogState;

  beforeEach(() => {
    initialState = createInitialState(mockMergedSettings);
  });

  describe('createInitialState', () => {
    it('should create valid initial state', () => {
      expect(initialState.focusSection).toBe('settings');
      expect(initialState.selectedScope).toBe(SettingScope.User);
      expect(initialState.activeSettingIndex).toBe(0);
      expect(initialState.scrollOffset).toBe(0);
      expect(initialState.searchQuery).toBe('');
      expect(initialState.filteredKeys).toEqual(getDialogSettingKeys());
      expect(initialState.restartRequiredChangedKeys).toEqual(new Set());
      expect(initialState.restartRequiredInitialSettings).toBeInstanceOf(Map);
    });
  });

  describe('SET_FOCUS', () => {
    it('should set focus section to settings', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'settings',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe('settings');
    });

    it('should set focus section to scope', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'scope',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe('scope');
    });

    it('should not modify other state properties', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'scope',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.selectedScope).toBe(initialState.selectedScope);
      expect(result.activeSettingIndex).toBe(initialState.activeSettingIndex);
      expect(result.scrollOffset).toBe(initialState.scrollOffset);
    });
  });

  describe('TOGGLE_FOCUS', () => {
    it('should toggle from settings to scope', () => {
      const action: SettingsDialogAction = { type: 'TOGGLE_FOCUS' };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe('scope');
    });

    it('should toggle from scope to settings', () => {
      const stateWithScopeFocus = {
        ...initialState,
        focusSection: 'scope' as const,
      };
      const action: SettingsDialogAction = { type: 'TOGGLE_FOCUS' };
      const result = settingsDialogReducer(stateWithScopeFocus, action);
      expect(result.focusSection).toBe('settings');
    });
  });

  describe('SET_SCOPE', () => {
    it('should set selected scope', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SCOPE',
        scope: SettingScope.System,
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.selectedScope).toBe(SettingScope.System);
    });

    it('should not modify other state properties', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SCOPE',
        scope: SettingScope.Workspace,
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.focusSection).toBe(initialState.focusSection);
      expect(result.activeSettingIndex).toBe(initialState.activeSettingIndex);
    });
  });

  describe('NAVIGATE', () => {
    describe('up direction', () => {
      it('should move up when not at first item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 5,
          scrollOffset: 2,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'up',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(4);
        expect(result.scrollOffset).toBe(2);
      });

      it('should wrap to last item when at first item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 0,
          scrollOffset: 0,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'up',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(9);
        expect(result.scrollOffset).toBe(5);
      });

      it('should adjust scroll when moving up beyond visible area', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 2,
          scrollOffset: 3,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'up',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(1);
        expect(result.scrollOffset).toBe(1);
      });
    });

    describe('down direction', () => {
      it('should move down when not at last item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 3,
          scrollOffset: 0,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'down',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(4);
        expect(result.scrollOffset).toBe(0);
      });

      it('should wrap to first item when at last item', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 9,
          scrollOffset: 5,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'down',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(0);
        expect(result.scrollOffset).toBe(0);
      });

      it('should adjust scroll when moving down beyond visible area', () => {
        const state = {
          ...initialState,
          activeSettingIndex: 6,
          scrollOffset: 2,
        };
        const action: SettingsDialogAction = {
          type: 'NAVIGATE',
          direction: 'down',
          itemCount: 10,
          maxVisible: 5,
        };
        const result = settingsDialogReducer(state, action);
        expect(result.activeSettingIndex).toBe(7);
        expect(result.scrollOffset).toBe(3);
      });
    });
  });

  describe('SET_SEARCH_QUERY', () => {
    it('should set search query', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SEARCH_QUERY',
        query: 'vim mode',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.searchQuery).toBe('vim mode');
    });

    it('should handle empty query', () => {
      const action: SettingsDialogAction = {
        type: 'SET_SEARCH_QUERY',
        query: '',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.searchQuery).toBe('');
    });
  });

  describe('SET_FILTERED_KEYS', () => {
    it('should set filtered keys and reset navigation', () => {
      const keys = ['setting1', 'setting2', 'setting3'];
      const state = {
        ...initialState,
        activeSettingIndex: 5,
        scrollOffset: 3,
      };
      const action: SettingsDialogAction = {
        type: 'SET_FILTERED_KEYS',
        keys,
      };
      const result = settingsDialogReducer(state, action);
      expect(result.filteredKeys).toEqual(keys);
      expect(result.activeSettingIndex).toBe(0);
      expect(result.scrollOffset).toBe(0);
    });

    it('should handle empty keys array', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FILTERED_KEYS',
        keys: [],
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.filteredKeys).toEqual([]);
      expect(result.activeSettingIndex).toBe(0);
      expect(result.scrollOffset).toBe(0);
    });
  });

  describe('UPDATE_RESTART_DIRTY', () => {
    it('should add key to restartRequiredChangedKeys when value differs from original', () => {
      const state = {
        ...initialState,
        restartRequiredInitialSettings: new Map([['test.setting', 'original']]),
      };
      const action: SettingsDialogAction = {
        type: 'UPDATE_RESTART_DIRTY',
        key: 'test.setting',
        newValue: 'changed',
      };
      const result = settingsDialogReducer(state, action);
      expect(result.restartRequiredChangedKeys.size).toBe(1);
      expect(result.restartRequiredChangedKeys.has('test.setting')).toBe(true);
    });

    it('should remove key from restartRequiredChangedKeys when value matches original', () => {
      const state = {
        ...initialState,
        restartRequiredChangedKeys: new Set(['test.setting']),
        restartRequiredInitialSettings: new Map([['test.setting', 'original']]),
      };
      const action: SettingsDialogAction = {
        type: 'UPDATE_RESTART_DIRTY',
        key: 'test.setting',
        newValue: 'original',
      };
      const result = settingsDialogReducer(state, action);
      expect(result.restartRequiredChangedKeys.size).toBe(0);
      expect(result.restartRequiredChangedKeys.has('test.setting')).toBe(false);
    });

    it('should return same state when dirty status unchanged (still dirty)', () => {
      const state = {
        ...initialState,
        restartRequiredChangedKeys: new Set(['test.setting']),
        restartRequiredInitialSettings: new Map([['test.setting', 'original']]),
      };
      const action: SettingsDialogAction = {
        type: 'UPDATE_RESTART_DIRTY',
        key: 'test.setting',
        newValue: 'still-changed',
      };
      const result = settingsDialogReducer(state, action);
      expect(result).toBe(state);
    });

    it('should return same state when dirty status unchanged (still clean)', () => {
      const state = {
        ...initialState,
        restartRequiredInitialSettings: new Map([['test.setting', 'original']]),
      };
      const action: SettingsDialogAction = {
        type: 'UPDATE_RESTART_DIRTY',
        key: 'test.setting',
        newValue: 'original',
      };
      const result = settingsDialogReducer(state, action);
      expect(result).toBe(state);
    });

    it('should handle multiple keys independently', () => {
      const state = {
        ...initialState,
        restartRequiredChangedKeys: new Set(['setting1']),
        restartRequiredInitialSettings: new Map([
          ['setting1', 'orig1'],
          ['setting2', 'orig2'],
        ]),
      };

      // Add setting2 as dirty
      const action1: SettingsDialogAction = {
        type: 'UPDATE_RESTART_DIRTY',
        key: 'setting2',
        newValue: 'changed2',
      };
      let result = settingsDialogReducer(state, action1);
      expect(result.restartRequiredChangedKeys.size).toBe(2);

      // Revert setting1 to original
      const action2: SettingsDialogAction = {
        type: 'UPDATE_RESTART_DIRTY',
        key: 'setting1',
        newValue: 'orig1',
      };
      result = settingsDialogReducer(result, action2);
      expect(result.restartRequiredChangedKeys.size).toBe(1);
      expect(result.restartRequiredChangedKeys.has('setting1')).toBe(false);
      expect(result.restartRequiredChangedKeys.has('setting2')).toBe(true);
    });
  });

  describe('unknown action type', () => {
    it('should throw for unknown action (exhaustive check)', () => {
      const unknownAction = {
        type: 'UNKNOWN_ACTION',
      } as unknown as SettingsDialogAction;
      expect(() =>
        settingsDialogReducer(initialState, unknownAction),
      ).toThrow();
    });
  });

  describe('state immutability', () => {
    it('should not mutate the original state', () => {
      const action: SettingsDialogAction = {
        type: 'SET_FOCUS',
        section: 'scope',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result).not.toBe(initialState);
      expect(initialState.focusSection).toBe('settings');
    });

    it('should create new state objects for nested updates', () => {
      const state = {
        ...initialState,
        restartRequiredChangedKeys: new Set(['setting1']),
        restartRequiredInitialSettings: new Map([
          ['setting1', 'orig1'],
          ['setting2', 'orig2'],
        ]),
      };
      const action: SettingsDialogAction = {
        type: 'UPDATE_RESTART_DIRTY',
        key: 'setting2',
        newValue: 'changed2',
      };
      const result = settingsDialogReducer(state, action);
      expect(result.restartRequiredChangedKeys).not.toBe(
        state.restartRequiredChangedKeys,
      );
      expect(state.restartRequiredChangedKeys.size).toBe(1);
      expect(result.restartRequiredChangedKeys.size).toBe(2);
    });
  });
});
