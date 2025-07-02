/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as fs from 'fs/promises';
import * as os from 'os';

vi.mock('fs/promises');
vi.mock('os');

describe.skip('getUserStartupWarnings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return a warning if the workspace is the home directory', async () => {
    const homeDir = '/home/user';
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.spyOn(fs, 'realpath').mockResolvedValue(homeDir);

    const warnings = await getUserStartupWarnings();

    expect(warnings).toEqual([
      'You are running Gemini CLI in your home directory. It is recommended to run in a project-specific directory.',
    ]);
    expect(fs.realpath).toHaveBeenCalledWith(process.cwd());
    expect(fs.realpath).toHaveBeenCalledWith(homeDir);
  });

  it('should return no warnings if the workspace is not the home directory', async () => {
    const homeDir = '/home/user';
    const projectDir = '/home/user/project';
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.spyOn(fs, 'realpath').mockImplementation(async (path) => {
      if (path === process.cwd()) {
        return projectDir;
      }
      if (path === homeDir) {
        return homeDir;
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const warnings = await getUserStartupWarnings();

    expect(warnings).toEqual([]);
  });

  it('should return a warning if checking the directory fails', async () => {
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.spyOn(fs, 'realpath').mockRejectedValue(new Error('Permission denied'));

    const warnings = await getUserStartupWarnings();

    expect(warnings).toEqual([
      'Could not verify the current directory due to a file system error.',
    ]);
  });

  it('should return a warning when provided workspaceRoot is the home directory', async () => {
    const homeDir = '/home/user';
    const workspaceRoot = '/home/user';
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.spyOn(fs, 'realpath').mockResolvedValue(homeDir);

    const warnings = await getUserStartupWarnings(workspaceRoot);

    expect(warnings).toEqual([
      'You are running Gemini CLI in your home directory. It is recommended to run in a project-specific directory.',
    ]);
    expect(fs.realpath).toHaveBeenCalledWith(workspaceRoot);
    expect(fs.realpath).toHaveBeenCalledWith(homeDir);
  });

  it('should return no warnings when provided workspaceRoot is not home', async () => {
    const homeDir = '/home/user';
    const workspaceRoot = '/some/other/dir';
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.spyOn(fs, 'realpath').mockImplementation(async (path) => {
      if (path === workspaceRoot) {
        return workspaceRoot;
      }
      if (path === homeDir) {
        return homeDir;
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const warnings = await getUserStartupWarnings(workspaceRoot);

    expect(warnings).toEqual([]);
  });
});
