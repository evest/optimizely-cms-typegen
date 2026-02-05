#!/usr/bin/env node

/**
 * CLI entry point for optimizely-cms-typegen
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { parseTypesJson } from './parser.js';
import { generate } from './generator.js';

const program = new Command();

program
  .name('optimizely-cms-typegen')
  .description('Generate TypeScript contentType() and displayTemplate() definitions from Optimizely CMS types.json')
  .version('1.0.0')
  .requiredOption('-i, --input <path>', 'Path to types.json file')
  .option('-o, --outdir <path>', 'Output directory for generated files', 'src/cms/content-types')
  .option('--output <path>', 'Output file path (implies --single-file)')
  .option('--single-file', 'Generate all types in a single file')
  .option('--with-registry', 'Generate registry initialization file')
  .action((options) => {
    try {
      const inputPath = path.resolve(options.input);
      const singleFile = options.singleFile || !!options.output;
      const outdir = options.output
        ? path.resolve(options.output)
        : path.resolve(options.outdir);

      console.log(`Parsing: ${inputPath}`);
      const parsed = parseTypesJson(inputPath);

      console.log(`Found ${parsed.contentTypes.size} content types`);
      console.log(`  - Elements: ${parsed.byCategory.elements.length}`);
      console.log(`  - Blocks: ${parsed.byCategory.blocks.length}`);
      console.log(`  - Pages: ${parsed.byCategory.pages.length}`);
      console.log(`  - Settings: ${parsed.byCategory.settings.length}`);
      console.log(`Found ${parsed.displayTemplates.length} display templates`);
      console.log('');

      generate(parsed, {
        outdir,
        singleFile,
        withRegistry: options.withRegistry,
      });

      console.log('');
      console.log('Done!');
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
