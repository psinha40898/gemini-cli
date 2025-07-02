/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import os from 'os';
import { join as pathJoin } from 'node:path';
import { getErrorMessage } from '@google/gemini-cli-core';

const warningsFilePath = pathJoin(os.tmpdir(), 'gemini-cli-warnings.txt');

export async function getStartupWarnings(): Promise<string[]> {
  const warnings: string[] = [];

  // Check for home directory usage
  try {
    const workspaceRoot = process.cwd();
    const [workspaceRealPath, homeRealPath] = await Promise.all([
      fs.realpath(workspaceRoot),
      fs.realpath(os.homedir()),
    ]);

    if (workspaceRealPath === homeRealPath) {
      warnings.push(
        'You are running Gemini CLI in your home directory. For a better experience, launch it in a project directory instead.',
      );
    }
  } catch (err: unknown) {
    console.error('Error checking workspace root:', err);
  }

  try {
    await fs.access(warningsFilePath); // Check if file exists
    const warningsContent = await fs.readFile(warningsFilePath, 'utf-8');
    const fileWarnings = warningsContent
      .split('\n')
      .filter((line) => line.trim() !== '');
    warnings.push(...fileWarnings);
    try {
      await fs.unlink(warningsFilePath);
    } catch {
      warnings.push('Warning: Could not delete temporary warnings file.');
    }
    return warnings;
  } catch (err: unknown) {
    // If fs.access throws, it means the file doesn't exist or is not accessible.
    // This is not an error in the context of fetching warnings, so return empty.
    // Only return an error message if it's not a "file not found" type error.
    // However, the original logic returned an error message for any fs.existsSync failure.
    // To maintain closer parity while making it async, we'll check the error code.
    // ENOENT is "Error NO ENTry" (file not found).
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return warnings; // File not found, return any existing warnings.
    }
    // For other errors (permissions, etc.), return the error message.
    warnings.push(
      `Error checking/reading warnings file: ${getErrorMessage(err)}`,
    );
    return warnings;
  }
}
