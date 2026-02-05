/**
 * Programmatic API for optimizely-cms-typegen
 */

export { parseTypesJson, categorizeContentType, extractDependencies } from './parser.js';
export type {
  ParsedTypes,
  CategorizedContentType,
  ContentTypeDefinition,
  DisplayTemplateDefinition,
  PropertyDefinition,
  Category,
} from './parser.js';

export {
  generate,
  generateContentType,
  generateDisplayTemplate,
  generateFile,
  generateIndexFile,
  generateRootIndexFile,
  generateSingleFile,
  generateRegistryFile,
  toConstantName,
} from './generator.js';
export type { GeneratorOptions } from './generator.js';
