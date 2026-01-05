/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import AjvPkg from 'ajv';
import * as addFormats from 'ajv-formats';
// Ajv's ESM/CJS interop: use 'any' for compatibility as recommended by Ajv docs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass = (AjvPkg as any).default || AjvPkg;
const ajValidator = new AjvClass(
  // See: https://ajv.js.org/options.html#strict-mode-options
  {
    // strictSchema defaults to true and prevents use of JSON schemas that
    // include unrecognized keywords. The JSON schema spec specifically allows
    // for the use of non-standard keywords and the spec-compliant behavior
    // is to ignore those keywords. Note that setting this to false also
    // allows use of non-standard or custom formats (the unknown format value
    // will be logged but the schema will still be considered valid).
    strictSchema: false,
  },
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormatsFunc = (addFormats as any).default || addFormats;
addFormatsFunc(ajValidator);

/**
 * Simple utility to validate objects against JSON Schemas
 */
export class SchemaValidator {
  /**
   * Validates tool parameters against a schema. Requires data to be an object.
   * Returns null if valid, or an error string if invalid.
   */
  static validate(schema: unknown | undefined, data: unknown): string | null {
    if (!schema) {
      return null;
    }
    if (typeof data !== 'object' || data === null) {
      return 'Value of params must be an object';
    }
    const validate = ajValidator.compile(schema);
    const valid = validate(data);
    if (!valid && validate.errors) {
      return ajValidator.errorsText(validate.errors, { dataVar: 'params' });
    }
    return null;
  }

  /**
   * Validates any value (including primitives) against a JSON Schema.
   * Used for agent output validation where the output may be a string, number, etc.
   * Returns null if valid, or an error string if invalid.
   */
  static validateAny(
    schema: unknown | undefined,
    data: unknown,
  ): string | null {
    if (!schema) {
      return null;
    }
    const validate = ajValidator.compile(schema);
    const valid = validate(data);
    if (!valid && validate.errors) {
      return ajValidator.errorsText(validate.errors, { dataVar: 'value' });
    }
    return null;
  }

  /**
   * Validates that a schema definition is a valid JSON Schema.
   * Used at load-time (e.g., parsing TOML) to catch syntax errors in schemas.
   * Returns null if valid, or an error string if invalid.
   */
  static validateSchema(schema: unknown | undefined): string | null {
    if (!schema) {
      return null;
    }
    const isValid = ajValidator.validateSchema(schema);
    if (!isValid && ajValidator.errors) {
      return ajValidator.errorsText(ajValidator.errors, { dataVar: 'schema' });
    }
    return null;
  }
}
