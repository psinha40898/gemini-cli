/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { cpSlice, cpLen, stripUnsafeCharacters } from '../utils/textUtils.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { Key } from '../hooks/useKeypress.js';

export interface InlineEditorState {
  editingKey: string | null;
  buffer: string;
  cursorPos: number;
  cursorVisible: boolean;
}

export interface InlineEditorAPI {
  state: InlineEditorState;
  startEditing: (key: string, initialValue: string) => void;
  commitEdit: () => void;
  cancelEdit: () => void;
  /**
   * Handle a keypress while in edit mode.
   * Returns true if the key was consumed by the editor.
   */
  handleKey: (
    key: Key,
    type: 'string' | 'number' | 'boolean' | 'enum',
  ) => boolean;
}

export function useInlineEditor(): InlineEditorAPI {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [buffer, setBuffer] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Cursor blink effect
  useEffect(() => {
    if (!editingKey) return;
    setCursorVisible(true);
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 500);
    return () => clearInterval(interval);
  }, [editingKey]);

  const startEditing = useCallback((key: string, initialValue: string) => {
    setEditingKey(key);
    setBuffer(initialValue);
    setCursorPos(cpLen(initialValue));
    setCursorVisible(true);
  }, []);

  const clearEditState = useCallback(() => {
    setEditingKey(null);
    setBuffer('');
    setCursorPos(0);
  }, []);

  const commitEdit = clearEditState;

  const cancelEdit = clearEditState;

  const handleKey = useCallback(
    (key: Key, type: 'string' | 'number' | 'boolean' | 'enum'): boolean => {
      if (!editingKey) return false;

      // Navigation within edit buffer
      if (keyMatchers[Command.MOVE_LEFT](key)) {
        setCursorPos((p) => Math.max(0, p - 1));
        return true;
      }
      if (keyMatchers[Command.MOVE_RIGHT](key)) {
        setCursorPos((p) => Math.min(cpLen(buffer), p + 1));
        return true;
      }
      if (keyMatchers[Command.HOME](key)) {
        setCursorPos(0);
        return true;
      }
      if (keyMatchers[Command.END](key)) {
        setCursorPos(cpLen(buffer));
        return true;
      }

      // Backspace
      if (keyMatchers[Command.DELETE_CHAR_LEFT](key)) {
        if (cursorPos > 0) {
          setBuffer((b) => {
            const before = cpSlice(b, 0, cursorPos - 1);
            const after = cpSlice(b, cursorPos);
            return before + after;
          });
          setCursorPos((p) => p - 1);
        }
        return true;
      }

      // Delete
      if (keyMatchers[Command.DELETE_CHAR_RIGHT](key)) {
        if (cursorPos < cpLen(buffer)) {
          setBuffer((b) => {
            const before = cpSlice(b, 0, cursorPos);
            const after = cpSlice(b, cursorPos + 1);
            return before + after;
          });
        }
        return true;
      }

      // Character input
      let ch = key.sequence;
      let isValidChar = false;
      if (type === 'number') {
        isValidChar = /[0-9\-+.]/.test(ch);
      } else {
        isValidChar = ch.length === 1 && ch.charCodeAt(0) >= 32;
        // Sanitize string input to prevent unsafe characters
        ch = stripUnsafeCharacters(ch);
      }

      if (isValidChar && ch.length > 0) {
        setBuffer((b) => {
          const before = cpSlice(b, 0, cursorPos);
          const after = cpSlice(b, cursorPos);
          return before + ch + after;
        });
        setCursorPos((p) => p + 1);
        return true;
      }

      return false;
    },
    [editingKey, buffer, cursorPos],
  );

  return {
    state: { editingKey, buffer, cursorPos, cursorVisible },
    startEditing,
    commitEdit,
    cancelEdit,
    handleKey,
  };
}
