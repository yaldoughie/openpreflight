import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const directories = [
  'packages/configuration/schemas',
  'packages/journey-schema/schemas',
  'packages/reporters/schemas',
];
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
let count = 0;
for (const directory of directories)
  for (const file of await readdir(directory))
    if (file.endsWith('.json')) {
      const path = resolve(directory, file);
      const schema = JSON.parse(await readFile(path, 'utf8')) as object;
      ajv.compile(schema);
      count += 1;
    }
process.stdout.write(`Validated ${count} JSON Schemas.\n`);
