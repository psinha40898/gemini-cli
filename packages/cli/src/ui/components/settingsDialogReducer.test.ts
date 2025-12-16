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
import { getDialogSettingKeys } from '../../utils/settingsUtils.js';

describe('settingsDialogReducer', () => {
  let initialState: SettingsDialogState;

  beforeEach(() => {
    initialState = createInitialState();
  });

  describe('createInitialState', () => {
    it('should create valid initial state', () => {
      expect(initialState.focusSection).toBe('settings');
      expect(initialState.selectedScope).toBe(SettingScope.User);
      expect(initialState.activeSettingIndex).toBe(0);
      expect(initialState.scrollOffset).toBe(0);
      expect(initialState.searchQuery).toBe('');
      expect(initialState.filteredKeys).toEqual(getDialogSettingKeys());
      expect(initialState.restartDirtyKeys).toEqual(new Set());
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

  describe('MARK_RESTART_DIRTY', () => {
    it('should add key to restartDirtyKeys', () => {
      const action: SettingsDialogAction = {
        type: 'MARK_RESTART_DIRTY',
        key: 'test.setting',
      };
      const result = settingsDialogReducer(initialState, action);
      expect(result.restartDirtyKeys.size).toBe(1);
      expect(result.restartDirtyKeys.has('test.setting')).toBe(true);
    });

    it('should not duplicate existing key', () => {
      const state = {
        ...initialState,
        restartDirtyKeys: new Set(['test.setting']),
      };
      const action: SettingsDialogAction = {
        type: 'MARK_RESTART_DIRTY',
        key: 'test.setting',
      };
      const result = settingsDialogReducer(state, action);
      expect(result.restartDirtyKeys.size).toBe(1);
      // Should return same state reference when key already exists
      expect(result).toBe(state);
    });

    it('should add multiple different keys', () => {
      let result = initialState;

      const action1: SettingsDialogAction = {
        type: 'MARK_RESTART_DIRTY',
        key: 'setting1',
      };
      result = settingsDialogReducer(result, action1);

      const action2: SettingsDialogAction = {
        type: 'MARK_RESTART_DIRTY',
        key: 'setting2',
      };
      result = settingsDialogReducer(result, action2);

      expect(result.restartDirtyKeys.size).toBe(2);
      expect(result.restartDirtyKeys.has('setting1')).toBe(true);
      expect(result.restartDirtyKeys.has('setting2')).toBe(true);
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
        restartDirtyKeys: new Set(['setting1']),
      };
      const action: SettingsDialogAction = {
        type: 'MARK_RESTART_DIRTY',
        key: 'setting2',
      };
      const result = settingsDialogReducer(state, action);
      expect(result.restartDirtyKeys).not.toBe(state.restartDirtyKeys);
      expect(state.restartDirtyKeys.size).toBe(1);
      expect(result.restartDirtyKeys.size).toBe(2);
    });
  });
});
