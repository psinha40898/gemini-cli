/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { privacyCommand } from './privacyCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('privacyCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return a dialog action to open the privacy dialog', () => {
    if (!privacyCommand.action) {
      throw new Error('The privacy command must have an action.');
    }

    const result = privacyCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'privacy',
    });
  });

  it('should have the correct name and description', () => {
    expect(privacyCommand.name).toBe('privacy');
    expect(privacyCommand.description).toBe('Display the privacy notice');
  });
});
