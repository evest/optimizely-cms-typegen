/**
 * Code generator module for TypeScript content type definitions
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ParsedTypes,
  CategorizedContentType,
  ContentTypeDefinition,
  DisplayTemplateDefinition,
  PropertyDefinition,
  Category,
} from './parser.js';
import { getRelativeImportPath, buildDependencyOrder } from './parser.js';

// ============================================================================
// Types
// ============================================================================

export interface GeneratorOptions {
  outdir: string;
  singleFile?: boolean;
  withRegistry?: boolean;
  verboseGeneration?: boolean;
}

interface ImportInfo {
  constantName: string;
  category: Category;
  fileName: string;
}

// ============================================================================
// Code Generation Utilities
// ============================================================================

/**
 * Convert a content type key to the exported constant name
 */
export function toConstantName(key: string, suffix: 'CT' | 'DisplayTemplate' = 'CT'): string {
  if (suffix === 'CT') {
    return `${key}CT`;
  }
  return key;
}

/**
 * Serialize a value to TypeScript code with proper indentation
 */
function serializeValue(value: unknown, baseIndent: number = 0): string {
  const spaces = (level: number) => '  '.repeat(level);

  function serialize(val: unknown, currentIndent: number): string {
    if (val === null || val === undefined) {
      return 'undefined';
    }

    if (typeof val === 'string') {
      return `'${val.replace(/'/g, "\\'")}'`;
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const items = val.map((v) => serialize(v, currentIndent + 1));
      // Inline short arrays
      if (items.every((i) => !i.includes('\n')) && items.join(', ').length < 60) {
        return `[${items.join(', ')}]`;
      }
      const itemLines = items.map((item) => `${spaces(currentIndent + 1)}${item},`);
      return `[\n${itemLines.join('\n')}\n${spaces(currentIndent)}]`;
    }

    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      const entries = Object.entries(obj);
      if (entries.length === 0) return '{}';

      const propLines = entries.map(([k, v]) => {
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`;
        const serialized = serialize(v, currentIndent + 1);
        return `${spaces(currentIndent + 1)}${key}: ${serialized},`;
      });

      return `{\n${propLines.join('\n')}\n${spaces(currentIndent)}}`;
    }

    return String(val);
  }

  return serialize(value, baseIndent);
}

// ============================================================================
// Property Generation
// ============================================================================

/**
 * Check if a property value is a default that should be omitted in non-verbose mode
 */
function isDefaultPropertyValue(key: string, value: unknown): boolean {
  if (key === 'sortOrder' && value === 0) return true;
  if (key === 'maxLength' && value === 255) return true;
  if (key === 'allowedTypes' && Array.isArray(value) && value.length === 0) return true;
  if (key === 'restrictedTypes' && Array.isArray(value) && value.length === 0) return true;
  if (key === 'localized' && value === false) return true;
  if (key === 'required' && value === false) return true;
  if (key === 'group' && value === 'content') return true;
  return false;
}

/**
 * Build a property object with component reference handling
 */
function buildPropertyObject(
  prop: PropertyDefinition,
  parsed: ParsedTypes,
  componentRefs: Map<string, ImportInfo>,
  verboseGeneration: boolean = false
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Copy all properties
  for (const [key, value] of Object.entries(prop)) {
    if (key === 'items' && prop.type === 'array' && prop.items?.type === 'component' && prop.items.contentType) {
      // Handle component reference in array items - will be handled specially
      continue;
    }
    // Skip default values in non-verbose mode
    if (!verboseGeneration && isDefaultPropertyValue(key, value)) {
      continue;
    }
    result[key] = value;
  }

  // Handle array with component reference
  if (prop.type === 'array' && prop.items?.type === 'component' && prop.items.contentType) {
    const refKey = prop.items.contentType;
    const refCt = parsed.contentTypes.get(refKey);

    if (refCt) {
      const constantName = toConstantName(refKey);
      componentRefs.set(refKey, {
        constantName,
        category: refCt.category,
        fileName: refKey,
      });

      // Create items object with reference placeholder
      result.items = {
        type: 'component',
        __contentTypeRef: constantName,
      };
    } else {
      // Referenced type not found, use string
      result.items = prop.items;
    }
  }

  return result;
}

/**
 * Post-process serialized code to replace reference placeholders
 */
function replaceReferencePlaceholders(code: string): string {
  // Replace '__contentTypeRef': 'SomeTypeCT' with contentType: SomeTypeCT
  return code.replace(/__contentTypeRef: '([^']+)'/g, 'contentType: $1');
}

// ============================================================================
// Content Type Generation
// ============================================================================

/**
 * Generate the contentType() call for a content type
 */
export function generateContentType(
  ct: CategorizedContentType,
  parsed: ParsedTypes,
  componentRefs: Map<string, ImportInfo>,
  verboseGeneration: boolean = false
): string {
  const def = ct.definition;

  // Build the object structure
  const obj: Record<string, unknown> = {
    key: def.key,
  };

  if (def.displayName) {
    obj.displayName = def.displayName;
  }
  if (def.description) {
    obj.description = def.description;
  }

  obj.baseType = def.baseType;

  if (def.compositionBehaviors && def.compositionBehaviors.length > 0) {
    obj.compositionBehaviors = def.compositionBehaviors;
  }

  // Properties
  if (def.properties && Object.keys(def.properties).length > 0) {
    const props: Record<string, unknown> = {};
    for (const [propName, propDef] of Object.entries(def.properties)) {
      props[propName] = buildPropertyObject(propDef, parsed, componentRefs, verboseGeneration);
    }
    obj.properties = props;
  }

  const constantName = toConstantName(def.key);
  const serialized = serializeValue(obj, 0);
  let code = `export const ${constantName} = contentType(${serialized});`;

  return replaceReferencePlaceholders(code);
}

// ============================================================================
// Display Template Generation
// ============================================================================

/**
 * Generate the displayTemplate() call for a display template
 */
export function generateDisplayTemplate(template: DisplayTemplateDefinition): string {
  // Build the object structure
  const obj: Record<string, unknown> = {
    key: template.key,
  };

  if (template.displayName) {
    obj.displayName = template.displayName;
  }

  obj.contentType = template.contentType;

  if (template.isDefault !== undefined) {
    obj.isDefault = template.isDefault;
  }

  if (template.settings && Object.keys(template.settings).length > 0) {
    obj.settings = template.settings;
  }

  const constantName = toConstantName(template.key, 'DisplayTemplate');
  const serialized = serializeValue(obj, 0);
  return `export const ${constantName} = displayTemplate(${serialized});`;
}

// ============================================================================
// File Generation (Multi-File Mode)
// ============================================================================

/**
 * Generate a JSDoc comment for a content type
 */
function generateJsDoc(ct: ContentTypeDefinition): string {
  const lines: string[] = ['/**'];
  if (ct.displayName) {
    lines.push(` * ${ct.displayName}`);
  }
  if (ct.description) {
    if (ct.displayName) lines.push(' *');
    lines.push(` * ${ct.description}`);
  }
  lines.push(' */');
  return lines.length > 2 ? lines.join('\n') : '';
}

/**
 * Generate a complete TypeScript file for a content type
 */
export function generateFile(
  ct: CategorizedContentType,
  parsed: ParsedTypes,
  templates: DisplayTemplateDefinition[],
  verboseGeneration: boolean = false
): string {
  const componentRefs = new Map<string, ImportInfo>();
  const lines: string[] = [];

  // Generate content type code first to collect references
  const ctCode = generateContentType(ct, parsed, componentRefs, verboseGeneration);

  // Generate imports
  lines.push("import { contentType, displayTemplate } from '@optimizely/cms-sdk';");

  // Add component imports
  if (componentRefs.size > 0) {
    for (const [, ref] of componentRefs) {
      const importPath = getRelativeImportPath(ct.category, ref.category, ref.fileName);
      lines.push(`import { ${ref.constantName} } from '${importPath}';`);
    }
  }

  lines.push('');

  // Add JSDoc
  const jsDoc = generateJsDoc(ct.definition);
  if (jsDoc) {
    lines.push(jsDoc);
  }

  // Add content type
  lines.push(ctCode);

  // Add display templates for this content type
  for (const template of templates) {
    if (template.contentType === ct.definition.key) {
      lines.push('');
      lines.push(generateDisplayTemplate(template));
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Generate an index.ts file for a category
 */
export function generateIndexFile(
  types: CategorizedContentType[],
  templates: DisplayTemplateDefinition[]
): string {
  const exports: string[] = [];

  for (const ct of types) {
    const constantName = toConstantName(ct.definition.key);
    const fileName = ct.definition.key;

    // Find templates for this content type
    const ctTemplates = templates.filter((t) => t.contentType === ct.definition.key);
    const templateExports = ctTemplates.map((t) => toConstantName(t.key, 'DisplayTemplate'));

    const allExports = [constantName, ...templateExports];
    exports.push(`export { ${allExports.join(', ')} } from './${fileName}';`);
  }

  return exports.join('\n') + '\n';
}

/**
 * Generate the root index.ts file that re-exports from all categories
 */
export function generateRootIndexFile(parsed: ParsedTypes): string {
  const lines: string[] = [];

  const categories: Category[] = ['elements', 'blocks', 'pages', 'settings'];
  for (const category of categories) {
    if (parsed.byCategory[category].length > 0) {
      lines.push(`export * from './${category}';`);
    }
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// Single File Generation
// ============================================================================

/**
 * Generate all content types and templates in a single file
 */
export function generateSingleFile(
  parsed: ParsedTypes,
  withRegistry: boolean = false,
  verboseGeneration: boolean = false
): string {
  const lines: string[] = [];

  // Import statement
  if (withRegistry) {
    lines.push('import {');
    lines.push('  contentType,');
    lines.push('  displayTemplate,');
    lines.push('  initContentTypeRegistry,');
    lines.push('  initDisplayTemplateRegistry,');
    lines.push('  BlankExperienceContentType,');
    lines.push('  BlankSectionContentType,');
    lines.push("} from '@optimizely/cms-sdk';");
  } else {
    lines.push("import { contentType, displayTemplate } from '@optimizely/cms-sdk';");
  }
  lines.push('');

  // Build dependency order
  const orderedKeys = buildDependencyOrder(parsed);

  // Group by category while maintaining dependency order
  const categories: Category[] = ['elements', 'blocks', 'pages', 'settings'];
  const byCategory: Record<Category, string[]> = {
    elements: [],
    blocks: [],
    pages: [],
    settings: [],
  };

  for (const key of orderedKeys) {
    const ct = parsed.contentTypes.get(key);
    if (ct) {
      byCategory[ct.category].push(key);
    }
  }

  // Generate code for each category
  for (const category of categories) {
    const keys = byCategory[category];
    if (keys.length === 0) continue;

    // Section header
    lines.push('// ' + '='.repeat(76));
    lines.push(`// ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    lines.push('// ' + '='.repeat(76));
    lines.push('');

    for (const key of keys) {
      const ct = parsed.contentTypes.get(key)!;
      const componentRefs = new Map<string, ImportInfo>();

      // Generate content type (refs are already defined above in single file mode)
      const ctCode = generateContentType(ct, parsed, componentRefs, verboseGeneration);

      // Add JSDoc
      const jsDoc = generateJsDoc(ct.definition);
      if (jsDoc) {
        lines.push(jsDoc);
      }

      lines.push(ctCode);
      lines.push('');

      // Generate templates
      const templates = parsed.displayTemplates.filter((t) => t.contentType === key);
      for (const template of templates) {
        lines.push(generateDisplayTemplate(template));
        lines.push('');
      }
    }
  }

  // Add registry section if requested
  if (withRegistry) {
    lines.push('// ' + '='.repeat(76));
    lines.push('// Registry');
    lines.push('// ' + '='.repeat(76));
    lines.push('');

    // Collect all constant names
    const contentTypeNames: string[] = [];
    const templateNames: string[] = [];

    for (const category of categories) {
      for (const key of byCategory[category]) {
        contentTypeNames.push(toConstantName(key));
      }
    }

    for (const template of parsed.displayTemplates) {
      if (parsed.contentTypes.has(template.contentType)) {
        templateNames.push(toConstantName(template.key, 'DisplayTemplate'));
      }
    }

    // All content types array
    lines.push('/**');
    lines.push(' * Array of all content types for registry initialization');
    lines.push(' */');
    lines.push('export const allContentTypes = [');
    lines.push('  // Built-in experience types');
    lines.push('  BlankExperienceContentType,');
    lines.push('  BlankSectionContentType,');
    for (const category of categories) {
      const keys = byCategory[category];
      if (keys.length > 0) {
        lines.push(`  // ${category.charAt(0).toUpperCase() + category.slice(1)}`);
        for (const key of keys) {
          lines.push(`  ${toConstantName(key)},`);
        }
      }
    }
    lines.push('];');
    lines.push('');

    // All display templates array
    lines.push('/**');
    lines.push(' * Array of all display templates for registry initialization');
    lines.push(' */');
    lines.push('export const allDisplayTemplates = [');
    for (const name of templateNames) {
      lines.push(`  ${name},`);
    }
    lines.push('];');
    lines.push('');

    // Init function
    lines.push('/**');
    lines.push(' * Initialize all registries');
    lines.push(' * Call this in your root layout before rendering CMS content');
    lines.push(' */');
    lines.push('export function initAllRegistries() {');
    lines.push('  initContentTypeRegistry(allContentTypes);');
    lines.push('  initDisplayTemplateRegistry(allDisplayTemplates);');
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Registry Generation
// ============================================================================

/**
 * Generate the registry.ts file
 */
export function generateRegistryFile(parsed: ParsedTypes): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * Content Type and Display Template Registry Initialization');
  lines.push(' * Auto-generated by optimizely-cms-typegen');
  lines.push(' */');
  lines.push('');
  lines.push('import {');
  lines.push('  initContentTypeRegistry,');
  lines.push('  initDisplayTemplateRegistry,');
  lines.push('  BlankExperienceContentType,');
  lines.push('  BlankSectionContentType,');
  lines.push("} from '@optimizely/cms-sdk';");
  lines.push('');

  // Collect all exports
  const contentTypeExports: string[] = [];
  const templateExports: string[] = [];

  const categories: Category[] = ['elements', 'blocks', 'pages', 'settings'];
  for (const category of categories) {
    for (const ct of parsed.byCategory[category]) {
      contentTypeExports.push(toConstantName(ct.definition.key));
    }
  }

  for (const template of parsed.displayTemplates) {
    // Only include templates for content types we generated
    if (parsed.contentTypes.has(template.contentType)) {
      templateExports.push(toConstantName(template.key, 'DisplayTemplate'));
    }
  }

  // Import content types
  lines.push('// Import all generated content types');
  lines.push('import {');
  for (const category of categories) {
    const types = parsed.byCategory[category];
    if (types.length > 0) {
      lines.push(`  // ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      for (const ct of types) {
        lines.push(`  ${toConstantName(ct.definition.key)},`);
      }
    }
  }
  lines.push("} from './index';");
  lines.push('');

  // Import display templates
  if (templateExports.length > 0) {
    lines.push('// Import display templates');
    lines.push('import {');
    for (const name of templateExports) {
      lines.push(`  ${name},`);
    }
    lines.push("} from './index';");
    lines.push('');
  }

  // All content types array
  lines.push('/**');
  lines.push(' * Array of all content types for registry initialization');
  lines.push(' */');
  lines.push('export const allContentTypes = [');
  lines.push('  // Built-in experience types');
  lines.push('  BlankExperienceContentType,');
  lines.push('  BlankSectionContentType,');
  for (const category of categories) {
    const types = parsed.byCategory[category];
    if (types.length > 0) {
      lines.push(`  // ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      for (const ct of types) {
        lines.push(`  ${toConstantName(ct.definition.key)},`);
      }
    }
  }
  lines.push('];');
  lines.push('');

  // All display templates array
  lines.push('/**');
  lines.push(' * Array of all display templates for registry initialization');
  lines.push(' */');
  lines.push('export const allDisplayTemplates = [');
  for (const name of templateExports) {
    lines.push(`  ${name},`);
  }
  lines.push('];');
  lines.push('');

  // Init function
  lines.push('/**');
  lines.push(' * Initialize all registries');
  lines.push(' * Call this in your root layout before rendering CMS content');
  lines.push(' */');
  lines.push('export function initAllRegistries() {');
  lines.push('  initContentTypeRegistry(allContentTypes);');
  lines.push('  initDisplayTemplateRegistry(allDisplayTemplates);');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Ensure a directory exists
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate all output files
 */
export function generate(parsed: ParsedTypes, options: GeneratorOptions): void {
  const { outdir, singleFile, withRegistry, verboseGeneration } = options;

  if (singleFile) {
    // Single file mode
    ensureDir(path.dirname(outdir));
    const code = generateSingleFile(parsed, withRegistry, verboseGeneration);
    fs.writeFileSync(outdir, code, 'utf-8');
    console.log(`Generated: ${outdir}`);
    return;
  }

  // Multi-file mode
  ensureDir(outdir);

  const categories: Category[] = ['elements', 'blocks', 'pages', 'settings'];

  for (const category of categories) {
    const types = parsed.byCategory[category];
    if (types.length === 0) continue;

    const categoryDir = path.join(outdir, category);
    ensureDir(categoryDir);

    // Generate individual files
    for (const ct of types) {
      const fileName = `${ct.definition.key}.ts`;
      const filePath = path.join(categoryDir, fileName);
      const code = generateFile(ct, parsed, parsed.displayTemplates, verboseGeneration);
      fs.writeFileSync(filePath, code, 'utf-8');
      console.log(`Generated: ${filePath}`);
    }

    // Generate category index
    const indexPath = path.join(categoryDir, 'index.ts');
    const indexCode = generateIndexFile(types, parsed.displayTemplates);
    fs.writeFileSync(indexPath, indexCode, 'utf-8');
    console.log(`Generated: ${indexPath}`);
  }

  // Generate root index
  const rootIndexPath = path.join(outdir, 'index.ts');
  const rootIndexCode = generateRootIndexFile(parsed);
  fs.writeFileSync(rootIndexPath, rootIndexCode, 'utf-8');
  console.log(`Generated: ${rootIndexPath}`);

  // Generate registry if requested
  if (withRegistry) {
    const registryPath = path.join(outdir, 'registry.ts');
    const registryCode = generateRegistryFile(parsed);
    fs.writeFileSync(registryPath, registryCode, 'utf-8');
    console.log(`Generated: ${registryPath}`);
  }
}
