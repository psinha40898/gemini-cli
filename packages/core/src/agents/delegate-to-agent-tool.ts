/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  Kind,
  type ToolInvocation,
  type ToolResult,
  BaseToolInvocation,
} from '../tools/tools.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { DELEGATE_TO_AGENT_TOOL_NAME } from '../tools/tool-names.js';
import type { AgentRegistry } from './registry.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SubagentToolWrapper } from './subagent-tool-wrapper.js';
import type { AgentInputs } from './types.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import type { JSONSchema7 } from 'json-schema';

type DelegateParams = { agent_name: string } & Record<string, unknown>;

export class DelegateToAgentTool extends BaseDeclarativeTool<
  DelegateParams,
  ToolResult
> {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    const definitions = registry.getAllDefinitions();

    let schema: JSONSchema7;

    if (definitions.length === 0) {
      // Fallback if no agents are registered (mostly for testing/safety)
      schema = {
        type: 'object',
        properties: {
          agent_name: {
            type: 'string',
            description: 'No agents are currently available.',
          },
        },
        required: ['agent_name'],
      };
    } else {
      const agentSchemas = definitions.map((def) => {
        const { inputSchema } = def.inputConfig;

        // Validate schema at registration time
        const schemaError = SchemaValidator.validateSchema(inputSchema);
        if (schemaError) {
          throw new Error(
            `Invalid input schema for agent '${def.name}': ${schemaError}`,
          );
        }

        // Check for reserved 'agent_name' parameter
        const props =
          (inputSchema.properties as Record<string, JSONSchema7>) ?? {};
        if ('agent_name' in props) {
          throw new Error(
            `Agent '${def.name}' cannot have an input parameter named 'agent_name' as it is a reserved parameter for delegation.`,
          );
        }

        // Build schema option with agent_name discriminator
        return {
          type: 'object' as const,
          properties: {
            agent_name: {
              const: def.name,
              description: def.description,
            },
            ...props,
          },
          required: [
            'agent_name',
            ...((inputSchema.required as string[]) ?? []),
          ],
        };
      });

      // Create oneOf schema for multiple agents, or single schema for one agent
      if (agentSchemas.length === 1) {
        schema = agentSchemas[0];
      } else {
        schema = { oneOf: agentSchemas };
      }
    }

    super(
      DELEGATE_TO_AGENT_TOOL_NAME,
      'Delegate to Agent',
      registry.getToolDescription(),
      Kind.Think,
      schema,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ true,
      messageBus,
    );
  }

  protected createInvocation(
    params: DelegateParams,
  ): ToolInvocation<DelegateParams, ToolResult> {
    return new DelegateInvocation(
      params,
      this.registry,
      this.config,
      this.messageBus,
    );
  }
}

class DelegateInvocation extends BaseToolInvocation<
  DelegateParams,
  ToolResult
> {
  constructor(
    params: DelegateParams,
    private readonly registry: AgentRegistry,
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus, DELEGATE_TO_AGENT_TOOL_NAME);
  }

  getDescription(): string {
    return `Delegating to agent '${this.params.agent_name}'`;
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    const definition = this.registry.getDefinition(this.params.agent_name);
    if (!definition) {
      throw new Error(
        `Agent '${this.params.agent_name}' exists in the tool definition but could not be found in the registry.`,
      );
    }

    // Extract arguments (everything except agent_name)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { agent_name, ...agentArgs } = this.params;

    // Delegate the creation of the specific invocation (Local or Remote) to the wrapper.
    // This centralizes the logic and ensures consistent handling.
    const wrapper = new SubagentToolWrapper(
      definition,
      this.config,
      this.messageBus,
    );

    // We could skip extra validation here if we trust the Registry's schema,
    // but build() will do a safety check anyway.
    const invocation = wrapper.build(agentArgs as AgentInputs);

    return invocation.execute(signal, updateOutput);
  }
}
