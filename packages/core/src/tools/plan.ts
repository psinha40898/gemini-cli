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
    const json = JSON.stringify(plan, null, 2);
    return {
      llmContent: json,
      returnDisplay: json,
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
