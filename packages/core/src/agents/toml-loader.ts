/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import TOML from '@iarna/toml';
import * as fs from 'node:fs/promises';
import { type Dirent } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { AgentDefinition } from './types.js';
import {
  isValidToolName,
  DELEGATE_TO_AGENT_TOOL_NAME,
} from '../tools/tool-names.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DTO for TOML parsing - represents the raw structure of the TOML file.
 */
interface TomlBaseAgentDefinition {
  name: string;
  display_name?: string;
}

/**
 * Supported input types for TOML-defined agent inputs.
 */
type TomlInputType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'integer'
  | 'string[]'
  | 'number[]';

/**
 * Defines a single input parameter for a TOML agent.
 */
interface TomlInputDefinition {
  type: TomlInputType;
  description: string;
  required?: boolean;
}

/**
 * Defines the output configuration for a TOML agent.
 * Uses JSON Schema format for the schema definition.
 */
interface TomlOutputDefinition {
  name: string;
  description: string;
  schema?: JsonSchemaObject;
}

/**
 * Represents a JSON Schema object definition.
 * This is a subset of JSON Schema sufficient for agent output definitions.
 */
interface JsonSchemaObject {
  type: 'object' | 'string' | 'number' | 'boolean' | 'integer' | 'array';
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
}

/**
 * Represents a property within a JSON Schema object.
 */
interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'integer' | 'array' | 'object';
  description?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface TomlLocalAgentDefinition extends TomlBaseAgentDefinition {
  kind: 'local';
  description: string;
  tools?: string[];
  inputs?: Record<string, TomlInputDefinition>;
  output?: TomlOutputDefinition;
  prompts: {
    system_prompt: string;
    query?: string;
  };
  model?: {
    model?: string;
    temperature?: number;
    thinking_budget?: number;
  };
  run?: {
    max_turns?: number;
    timeout_mins?: number;
  };
}

interface TomlRemoteAgentDefinition extends TomlBaseAgentDefinition {
  description?: string;
  kind: 'remote';
  agent_card_url: string;
}

type TomlAgentDefinition = TomlLocalAgentDefinition | TomlRemoteAgentDefinition;

/**
 * Error thrown when an agent definition is invalid or cannot be loaded.
 */
export class AgentLoadError extends Error {
  constructor(
    public filePath: string,
    message: string,
  ) {
    super(`Failed to load agent from ${filePath}: ${message}`);
    this.name = 'AgentLoadError';
  }
}

/**
 * Result of loading agents from a directory.
 */
export interface AgentLoadResult {
  agents: AgentDefinition[];
  errors: AgentLoadError[];
}

const nameSchema = z
  .string()
  .regex(/^[a-z0-9-_]+$/, 'Name must be a valid slug');

const inputTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'integer',
  'string[]',
  'number[]',
]);

const inputDefinitionSchema = z.object({
  type: inputTypeSchema,
  description: z.string().min(1),
  required: z.boolean().optional().default(false),
});

// JSON Schema property schema (recursive)
const jsonSchemaPropertySchema: z.ZodType<JsonSchemaProperty> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'integer', 'array', 'object']),
    description: z.string().optional(),
    items: jsonSchemaPropertySchema.optional(),
    properties: z.record(jsonSchemaPropertySchema).optional(),
    required: z.array(z.string()).optional(),
  }),
);

const jsonSchemaObjectSchema = z.object({
  type: z.enum(['object', 'string', 'number', 'boolean', 'integer', 'array']),
  description: z.string().optional(),
  properties: z.record(jsonSchemaPropertySchema).optional(),
  required: z.array(z.string()).optional(),
  items: jsonSchemaPropertySchema.optional(),
});

const outputDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  schema: jsonSchemaObjectSchema.optional(),
});

const localAgentSchema = z
  .object({
    kind: z.literal('local').optional().default('local'),
    name: nameSchema,
    description: z.string().min(1),
    display_name: z.string().optional(),
    tools: z
      .array(
        z.string().refine((val) => isValidToolName(val), {
          message: 'Invalid tool name',
        }),
      )
      .optional(),
    inputs: z.record(inputDefinitionSchema).optional(),
    output: outputDefinitionSchema.optional(),
    prompts: z.object({
      system_prompt: z.string().min(1),
      query: z.string().optional(),
    }),
    model: z
      .object({
        model: z.string().optional(),
        temperature: z.number().optional(),
        thinking_budget: z.number().int().optional(),
      })
      .optional(),
    run: z
      .object({
        max_turns: z.number().int().positive().optional(),
        timeout_mins: z.number().int().positive().optional(),
      })
      .optional(),
  })
  .strict();

const remoteAgentSchema = z
  .object({
    kind: z.literal('remote').optional().default('remote'),
    name: nameSchema,
    description: z.string().optional(),
    display_name: z.string().optional(),
    agent_card_url: z.string().url(),
  })
  .strict();

const remoteAgentsConfigSchema = z
  .object({
    remote_agents: z.array(remoteAgentSchema),
  })
  .strict();

// Use a Zod union to automatically discriminate between local and remote
// agent types. This is more robust than manually checking the 'kind' field,
// as it correctly handles cases where 'kind' is omitted by relying on
// the presence of unique fields like `agent_card_url` or `prompts`.
const agentUnionOptions = [
  { schema: localAgentSchema, label: 'Local Agent' },
  { schema: remoteAgentSchema, label: 'Remote Agent' },
] as const;

const singleAgentSchema = z.union([
  agentUnionOptions[0].schema,
  agentUnionOptions[1].schema,
]);

function formatZodError(error: z.ZodError, context: string): string {
  const issues = error.issues
    .map((i) => {
      // Handle union errors specifically to give better context
      if (i.code === z.ZodIssueCode.invalid_union) {
        return i.unionErrors
          .map((unionError, index) => {
            const label =
              agentUnionOptions[index]?.label ?? `Agent type #${index + 1}`;
            const unionIssues = unionError.issues
              .map((u) => `${u.path.join('.')}: ${u.message}`)
              .join(', ');
            return `(${label}) ${unionIssues}`;
          })
          .join('\n');
      }
      return `${i.path.join('.')}: ${i.message}`;
    })
    .join('\n');
  return `${context}:\n${issues}`;
}

/**
 * Parses and validates an agent TOML file. Returns a validated array of RemoteAgentDefinitions or a single LocalAgentDefinition.
 *
 * @param filePath Path to the TOML file.
 * @returns An array of parsed and validated TomlAgentDefinitions.
 * @throws AgentLoadError if parsing or validation fails.
 */
export async function parseAgentToml(
  filePath: string,
): Promise<TomlAgentDefinition[]> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new AgentLoadError(
      filePath,
      `Could not read file: ${(error as Error).message}`,
    );
  }

  let raw: unknown;
  try {
    raw = TOML.parse(content);
  } catch (error) {
    throw new AgentLoadError(
      filePath,
      `TOML parsing failed: ${(error as Error).message}`,
    );
  }

  // Check for `remote_agents` array
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'remote_agents' in (raw as Record<string, unknown>)
  ) {
    const result = remoteAgentsConfigSchema.safeParse(raw);
    if (!result.success) {
      throw new AgentLoadError(
        filePath,
        `Validation failed: ${formatZodError(result.error, 'Remote Agents Config')}`,
      );
    }
    return result.data.remote_agents as TomlAgentDefinition[];
  }

  // Single Agent Logic
  const result = singleAgentSchema.safeParse(raw);

  if (!result.success) {
    throw new AgentLoadError(
      filePath,
      `Validation failed: ${formatZodError(result.error, 'Agent Definition')}`,
    );
  }

  const toml = result.data as TomlAgentDefinition;

  // Prevent sub-agents from delegating to other agents (to prevent recursion/complexity)
  if ('tools' in toml && toml.tools?.includes(DELEGATE_TO_AGENT_TOOL_NAME)) {
    throw new AgentLoadError(
      filePath,
      `Validation failed: tools list cannot include '${DELEGATE_TO_AGENT_TOOL_NAME}'. Sub-agents cannot delegate to other agents.`,
    );
  }

  return [toml];
}

/**
 * Converts a JSON Schema property to a Zod schema.
 * Handles nested objects and arrays recursively.
 */
function jsonSchemaPropertyToZod(prop: JsonSchemaProperty): z.ZodTypeAny {
  switch (prop.type) {
    case 'string':
      return prop.description
        ? z.string().describe(prop.description)
        : z.string();
    case 'number':
      return prop.description
        ? z.number().describe(prop.description)
        : z.number();
    case 'integer':
      return prop.description
        ? z.number().int().describe(prop.description)
        : z.number().int();
    case 'boolean':
      return prop.description
        ? z.boolean().describe(prop.description)
        : z.boolean();
    case 'array': {
      const itemSchema = prop.items
        ? jsonSchemaPropertyToZod(prop.items)
        : z.unknown();
      const arraySchema = z.array(itemSchema);
      return prop.description
        ? arraySchema.describe(prop.description)
        : arraySchema;
    }
    case 'object': {
      if (!prop.properties) {
        return prop.description
          ? z.record(z.unknown()).describe(prop.description)
          : z.record(z.unknown());
      }
      const shape: Record<string, z.ZodTypeAny> = {};
      const requiredFields = new Set(prop.required ?? []);
      for (const [key, value] of Object.entries(prop.properties)) {
        const fieldSchema = jsonSchemaPropertyToZod(value);
        shape[key] = requiredFields.has(key)
          ? fieldSchema
          : fieldSchema.optional();
      }
      const objSchema = z.object(shape);
      return prop.description
        ? objSchema.describe(prop.description)
        : objSchema;
    }
    default:
      return z.unknown();
  }
}

/**
 * Converts a JSON Schema object to a Zod schema.
 * This is used to convert TOML-defined output schemas to Zod for validation.
 */
function jsonSchemaToZod(schema: JsonSchemaObject): z.ZodTypeAny {
  switch (schema.type) {
    case 'string':
      return schema.description
        ? z.string().describe(schema.description)
        : z.string();
    case 'number':
      return schema.description
        ? z.number().describe(schema.description)
        : z.number();
    case 'integer':
      return schema.description
        ? z.number().int().describe(schema.description)
        : z.number().int();
    case 'boolean':
      return schema.description
        ? z.boolean().describe(schema.description)
        : z.boolean();
    case 'array': {
      const itemSchema = schema.items
        ? jsonSchemaPropertyToZod(schema.items)
        : z.unknown();
      const arraySchema = z.array(itemSchema);
      return schema.description
        ? arraySchema.describe(schema.description)
        : arraySchema;
    }
    case 'object': {
      if (!schema.properties) {
        return schema.description
          ? z.record(z.unknown()).describe(schema.description)
          : z.record(z.unknown());
      }
      const shape: Record<string, z.ZodTypeAny> = {};
      const requiredFields = new Set(schema.required ?? []);
      for (const [key, value] of Object.entries(schema.properties)) {
        const fieldSchema = jsonSchemaPropertyToZod(value);
        shape[key] = requiredFields.has(key)
          ? fieldSchema
          : fieldSchema.optional();
      }
      const objSchema = z.object(shape);
      return schema.description
        ? objSchema.describe(schema.description)
        : objSchema;
    }
    default:
      return z.unknown();
  }
}

/**
 * Builds the inputConfig from TOML inputs, with fallback to default 'query' input.
 */
function buildInputConfig(
  inputs?: Record<string, TomlInputDefinition>,
): AgentDefinition['inputConfig'] {
  if (!inputs || Object.keys(inputs).length === 0) {
    // Default fallback: single optional 'query' input
    return {
      inputs: {
        query: {
          type: 'string',
          description: 'The task for the agent.',
          required: false,
        },
      },
    };
  }

  const result: AgentDefinition['inputConfig'] = { inputs: {} };
  for (const [key, def] of Object.entries(inputs)) {
    result.inputs[key] = {
      type: def.type,
      description: def.description,
      required: def.required ?? false,
    };
  }
  return result;
}

/**
 * Converts a TomlAgentDefinition DTO to the internal AgentDefinition structure.
 *
 * @param toml The parsed TOML definition.
 * @returns The internal AgentDefinition.
 */
export function tomlToAgentDefinition(
  toml: TomlAgentDefinition,
): AgentDefinition {
  // Build inputConfig from TOML inputs (with fallback)
  const inputConfig = buildInputConfig(
    toml.kind === 'local' ? toml.inputs : undefined,
  );

  if (toml.kind === 'remote') {
    return {
      kind: 'remote',
      name: toml.name,
      description: toml.description || '(Loading description...)',
      displayName: toml.display_name,
      agentCardUrl: toml.agent_card_url,
      inputConfig,
    };
  }

  // If a model is specified, use it. Otherwise, inherit
  const modelName = toml.model?.model || 'inherit';

  // Build outputConfig from TOML output definition
  // We use a type assertion here because the schema is dynamically built from JSON Schema
  // and TypeScript cannot infer the specific Zod type at compile time.
  let outputConfig: AgentDefinition['outputConfig'] | undefined;
  if (toml.output) {
    const schema = toml.output.schema
      ? jsonSchemaToZod(toml.output.schema)
      : z.string();
    outputConfig = {
      outputName: toml.output.name,
      description: toml.output.description,
      schema: schema as z.ZodUnknown,
    };
  }

  return {
    kind: 'local',
    name: toml.name,
    description: toml.description,
    displayName: toml.display_name,
    promptConfig: {
      systemPrompt: toml.prompts.system_prompt,
      query: toml.prompts.query,
    },
    modelConfig: {
      model: modelName,
      temp: toml.model?.temperature ?? 1,
      top_p: 0.95,
      thinkingBudget: toml.model?.thinking_budget,
    },
    runConfig: {
      max_turns: toml.run?.max_turns,
      max_time_minutes: toml.run?.timeout_mins || 5,
    },
    toolConfig: toml.tools
      ? {
          tools: toml.tools,
        }
      : undefined,
    inputConfig,
    outputConfig,
  };
}

/**
 * Loads all agents from a specific directory.
 * Ignores non-TOML files and files starting with _.
 *
 * @param dir Directory path to scan.
 * @returns Object containing successfully loaded agents and any errors.
 */
export async function loadAgentsFromDirectory(
  dir: string,
): Promise<AgentLoadResult> {
  const result: AgentLoadResult = {
    agents: [],
    errors: [],
  };

  let dirEntries: Dirent[];
  try {
    dirEntries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    // If directory doesn't exist, just return empty
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return result;
    }
    result.errors.push(
      new AgentLoadError(
        dir,
        `Could not list directory: ${(error as Error).message}`,
      ),
    );
    return result;
  }

  const files = dirEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.toml') &&
        !entry.name.startsWith('_'),
    )
    .map((entry) => entry.name);

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const tomls = await parseAgentToml(filePath);
      for (const toml of tomls) {
        const agent = tomlToAgentDefinition(toml);
        result.agents.push(agent);
      }
    } catch (error) {
      if (error instanceof AgentLoadError) {
        result.errors.push(error);
      } else {
        result.errors.push(
          new AgentLoadError(
            filePath,
            `Unexpected error: ${(error as Error).message}`,
          ),
        );
      }
    }
  }

  return result;
}

/**
 * Returns the path to the bundled default agents directory.
 */
export function getBundledAgentsDir(): string {
  return path.join(__dirname, 'defaults');
}

/**
 * Loads all bundled default agents that ship with the CLI.
 * These are loaded from the defaults/ directory adjacent to this file.
 *
 * @returns Object containing successfully loaded agents and any errors.
 */
export async function loadBundledAgents(): Promise<AgentLoadResult> {
  return loadAgentsFromDirectory(getBundledAgentsDir());
}

/**
 * Loads a specific bundled agent by name.
 *
 * @param name The name of the bundled agent (without .toml extension).
 * @returns The agent definition, or undefined if not found.
 */
export async function loadBundledAgent(
  name: string,
): Promise<AgentDefinition | undefined> {
  const filePath = path.join(getBundledAgentsDir(), `${name}.toml`);
  try {
    const tomls = await parseAgentToml(filePath);
    if (tomls.length > 0) {
      return tomlToAgentDefinition(tomls[0]);
    }
  } catch {
    // Agent not found or invalid
  }
  return undefined;
}
