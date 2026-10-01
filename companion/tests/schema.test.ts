import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPUTED_PROPERTIES } from '../../src/shared/computed';
import { changesetSchema as extensionSchema } from '../../src/shared/export';
import { EDITABLE_PROPERTIES, changesetSchema } from '../src/schema.js';

const GOLDEN = path.resolve(import.meta.dirname, '../../tests/golden');

describe('the companion and the extension agree on the changeset contract', () => {
  for (const file of fs.readdirSync(GOLDEN).filter((name) => name.endsWith('.json'))) {
    it(`${file} parses identically with both schemas`, () => {
      const raw = JSON.parse(fs.readFileSync(path.join(GOLDEN, file), 'utf8'));
      expect(changesetSchema.parse(raw)).toEqual(extensionSchema.parse(raw));
    });
  }

  it('both write the same set of properties', () => {
    expect([...EDITABLE_PROPERTIES].sort()).toEqual([...COMPUTED_PROPERTIES].sort());
  });
});
