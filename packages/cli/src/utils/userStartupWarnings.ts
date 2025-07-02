/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import * as os from 'os';

type WorkspaceCheckResult = 'IS_HOME' | 'NOT_HOME' | 'CHECK_FAILED';

/**
 * Checks if the current workspace is the user's home directory.
 * @param workspaceRoot - The root path of the workspace to check (defaults to process.cwd())
 * @returns WorkspaceCheckResult - the result of the check
 */
async function checkIfWorkspaceIsHome(
  workspaceRoot: string = process.cwd(),
): Promise<WorkspaceCheckResult> {
  try {
    const [workspaceRealPath, homeRealPath] = await Promise.all([
      fs.realpath(workspaceRoot),
      fs.realpath(os.homedir()),
    ]);

    if (workspaceRealPath === homeRealPath) {
      return 'IS_HOME';
    }
    return 'NOT_HOME';
  } catch (_err: unknown) {
    return 'CHECK_FAILED';
  }
}

/**
 * Gathers all user-facing warnings to be displayed on startup.
 * @param workspaceRoot - The root path of the workspace to check.
 * @returns A promise that resolves to an array of warning strings.
 */
export async function getUserStartupWarnings(
  workspaceRoot?: string,
): Promise<string[]> {
  const warnings: string[] = [];

  // Home directory check
  switch (await checkIfWorkspaceIsHome(workspaceRoot)) {
    case 'IS_HOME':
      warnings.push(
        'You are running Gemini CLI in your home directory. It is recommended to run in a project-specific directory.',
      );
      break;
    case 'CHECK_FAILED':
      warnings.push(
        'Could not verify the current directory due to a file system error.',
      );
      break;
    default:
      break;
  }

  return warnings;
}
