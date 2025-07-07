/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { glob } from 'glob';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

const GEMINI_DIR = '.gemini';
const COMMANDS_DIR = 'commands';

export interface CustomCommand {
  command: string;
  description: string;
  file: string;
}


async function findCommandFiles(dir: string): Promise<string[]> {
  const commandsPath = path.join(dir, COMMANDS_DIR);
  try {
    const stat = await fs.stat(commandsPath);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch (_e) {
    return [];
  }

  return glob('**/*.md', {
    cwd: commandsPath,
    nodir: true,
    absolute: true,
  });
}

async function parseCommandFile(
  prefix: string,
  file: string,
): Promise<CustomCommand | undefined> {
  const commandName = path
    .basename(file, '.md')
    .replace(/ /g, '-')
    .toLowerCase();
  const command = `/${prefix}:${commandName}`;

  const content = await fs.readFile(file, 'utf-8');
  const frontmatterMatch = content.match(/^---\n(.*?)\n---/s);

  let description = `A custom command for ${commandName}`;
  if (frontmatterMatch) {
    // Simple regex to extract description from frontmatter
    // Format: description: "some text" or description: 'some text' or description: some text
    const descMatch = frontmatterMatch[1].match(/^\s*description\s*:\s*(["']?)(.*?)\1\s*$/m);
    if (descMatch?.[2]) {
      description = descMatch[2];
    }
  }

  return { command, description, file };
}

export async function discoverCustomCommands(): Promise<CustomCommand[]> {
  const userCommandsDir = path.join(os.homedir(), GEMINI_DIR);
  const projectCommandsDir = path.join(process.cwd(), GEMINI_DIR);

  const userCommandFiles = await findCommandFiles(userCommandsDir);
  const projectCommandFiles = await findCommandFiles(projectCommandsDir);

  const userCommands = await Promise.all(
    userCommandFiles.map((file) => parseCommandFile('user', file)),
  );
  const projectCommands = await Promise.all(
    projectCommandFiles.map((file) => parseCommandFile('project', file)),
  );

  return [...userCommands, ...projectCommands].filter(
    (c): c is CustomCommand => !!c,
  );
}
