/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from '@google/genai';
import { BaseTool, ToolResult, Icon } from './tools.js';
import { Planner as _Planner, PlanEntry, PlanPriority } from '../core/planner.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

type ReadPlanParams = Record<string, never>;

interface WritePlanParams {
  operation: 'add' | 'update' | 'delete' | 'clear';
  // if add
  content?: string;
  priority?: PlanPriority;
  // if update/delete
  id?: string;
  patch?: Partial<Omit<PlanEntry, 'id' | 'createdAt'>>;
}



export class ReadPlanTool extends BaseTool<ReadPlanParams, ToolResult> {
  static readonly Name = 'read_plan';
  private readonly config: Config;

  constructor(config: Config) {
    super(
      ReadPlanTool.Name,
      'ReadPlan',
      'Returns the current session plan as JSON array.',
      Icon.LightBulb,
      { type: Type.OBJECT, properties: {} },
      false,
      false,
    );
    this.config = config;
  }

  getDescription(_: ReadPlanParams): string {
    return 'Show the current session plan';
  }

  validateToolParams(_params: ReadPlanParams): string | null {
    return null;
  }

  async shouldConfirmExecute(_params: ReadPlanParams): Promise<false> {
    return false;
  }

  toolLocations(_params: ReadPlanParams) {
    return [];
  }

  async execute(_: ReadPlanParams): Promise<ToolResult> {
    const planner = this.config.getPlanner();
    await planner.initialize();
    const plan = await planner.list();
    
    // Format the plan items for display
    const formattedPlan = plan.map(item => {
      const priority = item.priority ? ` (${item.priority})` : '';
      const status = item.status !== 'pending' ? ` [${item.status}]` : '';
      return `- ${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}${priority}${status}`;
    }).join('\n');
    
    const summary = `Plan (${plan.length} items):\n${formattedPlan}`;
    
    return {
      llmContent: JSON.stringify(plan, null, 2), // Keep full JSON for LLM
      returnDisplay: summary, // Show formatted summary to user
    };
  }
}

export type WritePlanOp =
  | { type: 'add'; content: string; priority?: PlanPriority }
  | { type: 'update'; id: string; patch: Partial<Omit<PlanEntry, 'id' | 'createdAt'>> }
  | { type: 'delete'; id: string }
  | { type: 'clear' };

export interface WritePlanBatchParams {
  ops: WritePlanOp[];
}

export class WritePlanTool extends BaseTool<WritePlanBatchParams, ToolResult> {
  static readonly Name = 'write_plan';
  private readonly config: Config;

  constructor(config: Config) {
    super(
      WritePlanTool.Name,
      'WritePlan',
      'Adds, updates, deletes, or clears multiple items in the session plan in a single operation.\n' +
      'For add operations: {type: "add", content: string, priority?: "high"|"medium"|"low"}\n' +
      'For update operations: {type: "update", id: string, patch: {content?: string, priority?: "high"|"medium"|"low"}}\n' +
      'For delete operations: {type: "delete", id: string}\n' +
      'For clear operations: {type: "clear"}',
      Icon.Pencil,
      {
        type: Type.OBJECT,
        properties: {
          ops: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, description: 'Operation type: "add", "update", "delete", or "clear"' },
                content: { type: Type.STRING, description: 'Content for add operation' },
                priority: { 
                  type: Type.STRING, 
                  enum: ['high', 'medium', 'low'],
                  description: 'Priority: "high", "medium", or "low"' 
                },
                id: { type: Type.STRING, description: 'ID of the item to update/delete' },
                patch: {
                  type: Type.OBJECT,
                  description: 'Patch object for update operation',
                  properties: {
                    content: { type: Type.STRING },
                    priority: { 
                      type: Type.STRING,
                      enum: ['high', 'medium', 'low']
                    }
                  }
                }
              },
              required: ['type']
            }
          }
        },
        required: ['ops']
      },
      false,
      false,
    );
    this.config = config;
  }

  getDescription(params: WritePlanBatchParams): string {
    if (!params.ops || !Array.isArray(params.ops) || params.ops.length === 0) {
      return 'No operations in plan';
    }

    // Start with a newline after "WritePlan"
    return '\n' + params.ops.map((op: WritePlanOp) => {
      if (!op || typeof op !== 'object') return '? Invalid operation';
      
      switch (op.type) {
        case 'add':
          const priority = op.priority ? ` (${op.priority})` : '';
          return `+ ${op.content.substring(0, 50)}${op.content.length > 50 ? '...' : ''}${priority}`;
        case 'update':
          const updated = [];
          if ('patch' in op && op.patch) {
            if ('content' in op.patch && op.patch.content) updated.push('content');
            if ('priority' in op.patch && op.patch.priority) updated.push(`priority=${op.patch.priority}`);
          }
          return `✏️  ${op.id}: ${updated.join(', ')}`;
        case 'delete':
          return `✕ ${op.id} (delete)`;
        case 'clear':
          return '🗑️  Clear all items';
        default:
          return `? ${(op as any).type || 'unknown'} (unknown operation)`;
      }
    }).join('\n');
  }

  validateToolParams(params: WritePlanBatchParams): string | null {
    // First, log the raw params for debugging
    console.debug('Plan operation params:', JSON.stringify(params, null, 2));

    if (!params || typeof params !== 'object') {
      return 'Parameters must be an object with an "ops" array';
    }

    if (!Array.isArray(params.ops)) {
      return 'The "ops" parameter must be an array of operations';
    }

    for (const [index, op] of params.ops.entries()) {
      if (!op || typeof op !== 'object') {
        return `Operation at index ${index} must be an object`;
      }

      // Ensure type is present and valid
      if (!('type' in op) || typeof op.type !== 'string') {
        return `Operation at index ${index} must have a "type" property`;
      }

      const opType = op.type;
      if (!['add', 'update', 'delete', 'clear'].includes(opType)) {
        return `Invalid operation type "${opType}" at index ${index}. Must be one of: add, update, delete, clear`;
      }

      // Validate operation-specific requirements
      try {
        switch (opType) {
          case 'add':
            if (typeof op.content !== 'string' || op.content.trim() === '') {
              return `Add operation at index ${index} must include a non-empty "content" string`;
            }
            if (op.priority && !['high', 'medium', 'low'].includes(op.priority)) {
              return `Invalid priority "${op.priority}" in add operation at index ${index}. Must be one of: high, medium, low`;
            }
            break;

          case 'update':
            if (typeof op.id !== 'string' || op.id.trim() === '') {
              return `Update operation at index ${index} must include a valid "id" string`;
            }
            if (!op.patch || typeof op.patch !== 'object') {
              return `Update operation at index ${index} must include a "patch" object`;
            }
            if (op.patch.priority && !['high', 'medium', 'low'].includes(op.patch.priority)) {
              return `Invalid priority "${op.patch.priority}" in update operation at index ${index}. Must be one of: high, medium, low`;
            }
            break;

          case 'delete':
            if (typeof op.id !== 'string' || op.id.trim() === '') {
              return `Delete operation at index ${index} must include a valid "id" string`;
            }
            break;

          case 'clear':
            // No additional validation needed
            break;
        }
      } catch (error) {
        console.error('Error validating operation:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return `Error validating operation at index ${index}: ${errorMessage}`;
      }
    }

    return null;
  }

  async shouldConfirmExecute(_: WritePlanBatchParams): Promise<false> {
    return false;
  }

  toolLocations(_: WritePlanBatchParams) {
    return [];
  }

  async execute(params: WritePlanBatchParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return { 
        llmContent: `Error: ${validationError}`, 
        returnDisplay: validationError 
      };
    }

    const planner = this.config.getPlanner();
    await planner.initialize();
    
    const results = [];
    let cleared = false;

    for (const op of params.ops) {
      try {
        switch (op.type) {
          case 'add': {
            const result = await planner.add(
              op.content,
              op.priority ?? 'medium'
            );
            results.push({ type: 'add', id: result.id, content: result.content });
            break;
          }
          case 'update': {
            const result = await planner.update(op.id, op.patch || {});
            if (result) {
              results.push({ type: 'update', id: result.id, ...op.patch });
            } else {
              results.push({ type: 'error', op: 'update', error: `Failed to update item ${op.id}` });
            }
            break;
          }
          case 'delete': {
            await planner.delete(op.id);
            results.push({ type: 'delete', id: op.id });
            break;
          }
          case 'clear': {
            if (!cleared) {  // Only clear once even if multiple clear ops
              await planner.clear();
              cleared = true;
            }
            results.push({ type: 'clear' });
            break;
          }
        }
      } catch (error) {
        results.push({ 
          type: 'error', 
          op: op.type, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    return {
      llmContent: JSON.stringify(results, null, 2),
      returnDisplay: `Applied ${results.length} plan operations`
    };
  }
}

export class WritePlanItemTool extends BaseTool<WritePlanParams, ToolResult> {
  static readonly Name = 'write_plan_item';
  private readonly config: Config;

  constructor(config: Config) {
    super(
      WritePlanItemTool.Name,
      'WritePlanItem',
      'Adds, updates, deletes, or clears items in the session plan.',
      Icon.Pencil,
      {
        type: Type.OBJECT,
        required: ['operation'],
        properties: {
          operation: { type: Type.STRING, enum: ['add', 'update', 'delete', 'clear'] },
          content: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          id: { type: Type.STRING },
          patch: { type: Type.OBJECT },
        },
      },
      false,
      false,
    );
    this.config = config;
  }

  getDescription(params: WritePlanParams): string {
    switch (params.operation) {
      case 'add':
        return 'Add plan item';
      case 'update':
        return 'Update plan item';
      case 'delete':
        return 'Delete plan item';
      case 'clear':
        return 'Clear entire plan';
      default:
        return 'Modify plan';
    }
  }

  validateToolParams(params: WritePlanParams): string | null {
    const errs = SchemaValidator.validate(this.schema.parameters, params);
    if (errs) return errs;

    const { operation } = params;
    if (operation === 'add' && !params.content) return 'content required for add';
    if ((operation === 'update' || operation === 'delete') && !params.id) return 'id required';
    return null;
  }

  async shouldConfirmExecute(_: WritePlanParams): Promise<false> {
    return false;
  }

  toolLocations(_: WritePlanParams) {
    return [];
  }

  async execute(params: WritePlanParams): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return { llmContent: `Error: ${validationError}`, returnDisplay: validationError };
    }

    const planner = this.config.getPlanner();
    await planner.initialize();
    
    switch (params.operation) {
      case 'add': {
        if (!params.content) {
          throw new Error('Content is required for add operation');
        }
        const newEntry = await planner.add(
          params.content,
          params.priority || 'medium',
        );
        return {
          llmContent: JSON.stringify([newEntry], null, 2),
          returnDisplay: params.content,
        } as ToolResult;
      }
      case 'update': {
        if (!params.id) {
          throw new Error('ID is required for update operation');
        }
        const updatedEntry = await planner.update(params.id, params.patch || {});
        return {
          llmContent: JSON.stringify([updatedEntry], null, 2),
          returnDisplay: params.content || `Updated item ${params.id}`,
        } as ToolResult;
      }
      case 'delete': {
        if (!params.id) {
          throw new Error('ID is required for delete operation');
        }
        await planner.delete(params.id);
        const plan = await planner.list();
        return {
          llmContent: JSON.stringify(plan, null, 2),
          returnDisplay: `Deleted item ${params.id}`,
        } as ToolResult;
      }
      case 'clear': {
        await planner.clear();
        return {
          llmContent: '[]',
          returnDisplay: 'Plan cleared',
        } as ToolResult;
      }
      default: {
        // This should never happen because of TypeScript's type checking,
        // but we'll handle it defensively
        const _exhaustiveCheck: never = params.operation;
        return {
          llmContent: `Error: Unknown operation: ${_exhaustiveCheck}`,
          returnDisplay: `Error: Unknown operation`,
        };
      }
    }

    // This line is unreachable due to early returns in all cases
    throw new Error('Unexpected operation type');
  }
}
