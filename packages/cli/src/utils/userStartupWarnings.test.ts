/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PathLike } from 'node:fs';

vi.mock('os', () => ({
  default: {
    homedir: vi.fn(),
  },
  homedir: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    realpath: vi
      .fn()
      .mockImplementation((path: PathLike) => Promise.resolve(path.toString())),
  },
}));

import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as os from 'os';
import fs from 'fs/promises';

describe('getUserStartupWarnings', () => {
  const homeDir = '/home/user';

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.mocked(fs.realpath).mockImplementation(async (path: PathLike) =>
      path.toString(),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return a warning when running in home directory', async () => {
    vi.mocked(fs.realpath)
      .mockResolvedValueOnce(homeDir)  // workspace path resolves to home
      .mockResolvedValueOnce(homeDir); // home path

    const warnings = await getUserStartupWarnings();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('home directory');
    expect(fs.realpath).toHaveBeenNthCalledWith(1, process.cwd());
    expect(fs.realpath).toHaveBeenNthCalledWith(2, homeDir);
  });

  it('should not return a warning when running in a project directory', async () => {
    // Mock both calls explicitly
    vi.mocked(fs.realpath)
      .mockResolvedValueOnce('/some/project/path')  // workspace path
      .mockResolvedValueOnce('/home/user');         // home path
      
    const warnings = await getUserStartupWarnings();
    
    expect(warnings).toHaveLength(0);
    expect(fs.realpath).toHaveBeenNthCalledWith(1, process.cwd());
    expect(fs.realpath).toHaveBeenNthCalledWith(2, '/home/user');
  });
  it('should handle errors when checking directory', async () => {
    vi.mocked(fs.realpath)
      .mockRejectedValueOnce(new Error('FS error'))  // workspace path fails
      .mockResolvedValueOnce(homeDir);               // home path still succeeds

    const warnings = await getUserStartupWarnings();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Could not verify');
    expect(fs.realpath).toHaveBeenNthCalledWith(1, process.cwd());
    expect(fs.realpath).toHaveBeenNthCalledWith(2, homeDir);
  });

  it('should not return a warning when workspaceRoot is provided and not home', async () => {
    vi.mocked(fs.realpath)
      .mockResolvedValueOnce('/some/project/path')  // workspace path
      .mockResolvedValueOnce(homeDir);              // home path

    const warnings = await getUserStartupWarnings('/some/project/path');

    expect(warnings).toHaveLength(0);
    expect(fs.realpath).toHaveBeenNthCalledWith(1, '/some/project/path');
    expect(fs.realpath).toHaveBeenNthCalledWith(2, homeDir);
  });

  it('should return a warning when workspaceRoot is home', async () => {
    vi.mocked(fs.realpath)
      .mockResolvedValueOnce(homeDir)  // workspace path (home)
      .mockResolvedValueOnce(homeDir); // home path

    const warnings = await getUserStartupWarnings(homeDir);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('home directory');
    expect(fs.realpath).toHaveBeenNthCalledWith(1, homeDir);
    expect(fs.realpath).toHaveBeenNthCalledWith(2, homeDir);
  });

  it('should handle errors when checking provided workspaceRoot', async () => {
    vi.mocked(fs.realpath)
      .mockRejectedValueOnce(new Error('FS error'))  // workspace path fails
      .mockResolvedValueOnce(homeDir);               // home path still succeeds

    const warnings = await getUserStartupWarnings('/invalid/path');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Could not verify');
    expect(fs.realpath).toHaveBeenNthCalledWith(1, '/invalid/path');
    expect(fs.realpath).toHaveBeenNthCalledWith(2, homeDir);
  });
});
