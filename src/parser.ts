/**
 * Parser module for types.json from Optimizely CMS
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface PropertyDefinition {
  type: string;
  displayName?: string;
  description?: string;
  required?: boolean;
  group?: string;
  localized?: boolean;
  indexingType?: string;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  enum?: Array<{ value: string; displayName?: string }>;
  allowedTypes?: string[];
  restrictedTypes?: string[];
  items?: {
    type: string;
    contentType?: string;
  };
  [key: string]: unknown;
}

export interface ContentTypeDefinition {
  key: string;
  displayName?: string;
  description?: string;
  baseType: string;
  compositionBehaviors?: string[];
  properties?: Record<string, PropertyDefinition>;
  [key: string]: unknown;
}

export interface TemplateSettingChoice {
  displayName: string;
  sortOrder?: number;
}

export interface TemplateSetting {
  displayName?: string;
  editor?: string;
  sortOrder?: number;
  choices?: Record<string, TemplateSettingChoice>;
  [key: string]: unknown;
}

export interface DisplayTemplateDefinition {
  key: string;
  displayName?: string;
  contentType: string;
  isDefault?: boolean;
  settings?: Record<string, TemplateSetting>;
  [key: string]: unknown;
}

export interface TypesJson {
  contentTypes?: ContentTypeDefinition[];
  displayTemplates?: DisplayTemplateDefinition[];
}

export type Category = 'blocks' | 'elements' | 'pages' | 'settings';

export interface CategorizedContentType {
  definition: ContentTypeDefinition;
  category: Category;
  dependencies: string[];
}

export interface ParsedTypes {
  contentTypes: Map<string, CategorizedContentType>;
  displayTemplates: DisplayTemplateDefinition[];
  byCategory: Record<Category, CategorizedContentType[]>;
}

// ============================================================================
// Categorization
// ============================================================================

const SKIP_BASE_TYPES = new Set(['_media', '_image', '_video']);

/**
 * Determine the category for a content type based on its baseType and name
 */
export function categorizeContentType(ct: ContentTypeDefinition): Category | null {
  const { baseType, key } = ct;

  // Skip built-in media types
  if (SKIP_BASE_TYPES.has(baseType)) {
    return null;
  }

  // Pages
  if (baseType === '_page') {
    return 'pages';
  }

  // Components - further categorize by name
  if (baseType === '_component') {
    if (key.endsWith('Settings')) {
      return 'settings';
    }
    if (key.endsWith('Element')) {
      return 'elements';
    }
    return 'blocks';
  }

  // Default to blocks for unknown base types
  return 'blocks';
}

// ============================================================================
// Dependency Extraction
// ============================================================================

/**
 * Extract content type dependencies from properties
 * These are component references in array items
 */
export function extractDependencies(properties: Record<string, PropertyDefinition> | undefined): string[] {
  if (!properties) return [];

  const deps: string[] = [];

  for (const prop of Object.values(properties)) {
    // Check for array with component items
    if (prop.type === 'array' && prop.items?.type === 'component' && prop.items.contentType) {
      deps.push(prop.items.contentType);
    }
    // Direct component reference
    if (prop.type === 'component' && prop.contentType) {
      deps.push(prop.contentType as string);
    }
  }

  return [...new Set(deps)];
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize properties from array format to object format.
 * Some JSON sources provide properties as an array of objects with a `name` field,
 * while the generator expects an object keyed by property name.
 */
function normalizeProperties(
  properties: Record<string, PropertyDefinition> | PropertyDefinition[] | undefined
): Record<string, PropertyDefinition> | undefined {
  if (!properties) return undefined;

  if (Array.isArray(properties)) {
    const result: Record<string, PropertyDefinition> = {};
    for (const prop of properties) {
      const { name, ...rest } = prop as PropertyDefinition & { name: string };
      if (name) {
        result[name] = rest as PropertyDefinition;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  return properties;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse a types.json file and categorize its content types
 */
export function parseTypesJson(inputPath: string): ParsedTypes {
  const absolutePath = path.resolve(inputPath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const data: TypesJson = JSON.parse(content);

  const contentTypes = new Map<string, CategorizedContentType>();
  const byCategory: Record<Category, CategorizedContentType[]> = {
    blocks: [],
    elements: [],
    pages: [],
    settings: [],
  };

  // Process content types
  for (const ct of data.contentTypes ?? []) {
    // Normalize properties from array format to object format
    ct.properties = normalizeProperties(ct.properties);

    const category = categorizeContentType(ct);
    if (category === null) {
      // Skip this content type (e.g., media types)
      continue;
    }

    const dependencies = extractDependencies(ct.properties);
    const categorized: CategorizedContentType = {
      definition: ct,
      category,
      dependencies,
    };

    contentTypes.set(ct.key, categorized);
    byCategory[category].push(categorized);
  }

  // Sort each category by key for consistent output
  for (const category of Object.keys(byCategory) as Category[]) {
    byCategory[category].sort((a, b) => a.definition.key.localeCompare(b.definition.key));
  }

  return {
    contentTypes,
    displayTemplates: data.displayTemplates ?? [],
    byCategory,
  };
}

/**
 * Get the category folder for a content type key
 */
export function getCategoryForKey(parsed: ParsedTypes, key: string): Category | null {
  const ct = parsed.contentTypes.get(key);
  return ct?.category ?? null;
}

/**
 * Calculate the relative import path between two categories/files
 */
export function getRelativeImportPath(
  fromCategory: Category,
  toCategory: Category,
  toFileName: string
): string {
  if (fromCategory === toCategory) {
    return `./${toFileName}`;
  }
  return `../${toCategory}/${toFileName}`;
}

/**
 * Build a dependency map for topological sorting in single-file mode
 */
export function buildDependencyOrder(parsed: ParsedTypes): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(key: string) {
    if (visited.has(key)) return;
    visited.add(key);

    const ct = parsed.contentTypes.get(key);
    if (!ct) return;

    // Visit dependencies first
    for (const dep of ct.dependencies) {
      visit(dep);
    }

    result.push(key);
  }

  // Visit all content types
  for (const key of parsed.contentTypes.keys()) {
    visit(key);
  }

  return result;
}
