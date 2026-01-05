/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { SchemaValidator } from './schemaValidator.js';

describe('SchemaValidator', () => {
  it('should allow any params if schema is undefined', () => {
    const params = {
      foo: 'bar',
    };
    expect(SchemaValidator.validate(undefined, params)).toBeNull();
  });

  it('rejects null params', () => {
    const schema = {
      type: 'object',
      properties: {
        foo: {
          type: 'string',
        },
      },
    };
    expect(SchemaValidator.validate(schema, null)).toBe(
      'Value of params must be an object',
    );
  });

  it('rejects params that are not objects', () => {
    const schema = {
      type: 'object',
      properties: {
        foo: {
          type: 'string',
        },
      },
    };
    expect(SchemaValidator.validate(schema, 'not an object')).toBe(
      'Value of params must be an object',
    );
  });

  it('allows schema with extra properties', () => {
    const schema = {
      type: 'object',
      properties: {
        example_enum: {
          type: 'string',
          enum: ['FOO', 'BAR'],
          // enum-descriptions is not part of the JSON schema spec.
          // This test verifies that the SchemaValidator allows the
          // use of extra keywords, like this one, in the schema.
          'enum-descriptions': ['a foo', 'a bar'],
        },
      },
    };
    const params = {
      example_enum: 'BAR',
    };

    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('allows custom format values', () => {
    const schema = {
      type: 'object',
      properties: {
        duration: {
          type: 'string',
          // See: https://cloud.google.com/docs/discovery/type-format
          format: 'google-duration',
        },
        mask: {
          type: 'string',
          format: 'google-fieldmask',
        },
        foo: {
          type: 'string',
          format: 'something-totally-custom',
        },
      },
    };
    const params = {
      duration: '10s',
      mask: 'foo.bar,biz.baz',
      foo: 'some value',
    };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('allows valid values for known formats', () => {
    const schema = {
      type: 'object',
      properties: {
        today: {
          type: 'string',
          format: 'date',
        },
      },
    };
    const params = {
      today: '2025-04-08',
    };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('rejects invalid values for known formats', () => {
    const schema = {
      type: 'object',
      properties: {
        today: {
          type: 'string',
          format: 'date',
        },
      },
    };
    const params = {
      today: 'this is not a date',
    };
    expect(SchemaValidator.validate(schema, params)).not.toBeNull();
  });

  describe('validateAny', () => {
    it('should allow any value if schema is undefined', () => {
      expect(SchemaValidator.validateAny(undefined, 'hello')).toBeNull();
      expect(SchemaValidator.validateAny(undefined, 123)).toBeNull();
      expect(SchemaValidator.validateAny(undefined, null)).toBeNull();
    });

    it('validates string values against string schema', () => {
      const schema = { type: 'string' };
      expect(SchemaValidator.validateAny(schema, 'hello')).toBeNull();
      expect(SchemaValidator.validateAny(schema, 123)).not.toBeNull();
    });

    it('validates string values with minLength constraint', () => {
      const schema = { type: 'string', minLength: 10 };
      expect(SchemaValidator.validateAny(schema, 'short')).not.toBeNull();
      expect(
        SchemaValidator.validateAny(schema, 'this is long enough'),
      ).toBeNull();
    });

    it('validates object values', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      expect(SchemaValidator.validateAny(schema, { name: 'test' })).toBeNull();
      expect(SchemaValidator.validateAny(schema, {})).not.toBeNull();
    });

    it('validates number values', () => {
      const schema = { type: 'number', minimum: 0 };
      expect(SchemaValidator.validateAny(schema, 5)).toBeNull();
      expect(SchemaValidator.validateAny(schema, -1)).not.toBeNull();
    });
  });

  describe('validateSchema', () => {
    it('should allow undefined schema', () => {
      expect(SchemaValidator.validateSchema(undefined)).toBeNull();
    });

    it('validates a correct schema', () => {
      const schema = {
        type: 'object',
        properties: {
          foo: { type: 'string' },
        },
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('rejects an incorrect schema', () => {
      const schema = {
        type: 'object',
        properties: {
          foo: { type: 'invalid-type' },
        },
      };
      const error = SchemaValidator.validateSchema(schema);
      expect(error).not.toBeNull();
      expect(error).toContain('schema/properties/foo/type');
    });

    it('rejects a schema with missing required fields in meta-schema', () => {
      // In JSON Schema, 'type' must be a valid string or array of strings
      const schema = {
        type: 123,
      };
      expect(SchemaValidator.validateSchema(schema)).not.toBeNull();
    });
  });
});
