/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { initCommand } from './initCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { SubmitPromptActionReturn, CommandContext } from './types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('initCommand', () => {
  let mockContext: CommandContext;
  const targetDir = '/test/dir';
  const geminiMdPath = path.join(targetDir, 'GEMINI.md');

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          getTargetDir: () => targetDir,
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should inform the user if GEMINI.md already exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = await initCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content:
        'A GEMINI.md file already exists in this directory. No changes were made.',
    });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should create GEMINI.md and submit a prompt if it does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = (await initCommand.action!(
      mockContext,
      '',
    )) as SubmitPromptActionReturn;

    expect(fs.writeFileSync).toHaveBeenCalledWith(geminiMdPath, '', 'utf8');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'info',
        text: 'Empty GEMINI.md created. Now analyzing the project to populate it.',
      },
      expect.any(Number),
    );

    expect(result.type).toBe('submit_prompt');
    expect(result.content).toContain(
      'You are an AI agent that brings the power of Gemini',
    );
  });

  it('should return an error if config is not available', async () => {
    const noConfigContext = createMockCommandContext();
    if (noConfigContext.services) {
      noConfigContext.services.config = null;
    }
    const result = await initCommand.action!(noConfigContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration not available.',
    });
  });
});
