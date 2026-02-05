# optimizely-cms-typegen

Generate TypeScript `contentType()` and `displayTemplate()` definitions from Optimizely CMS `types.json` files.

## Installation

```bash
npm install optimizely-cms-typegen
```

## Usage

### Multi-file Output (Default)

Generates organized TypeScript files in separate folders by category:

```bash
npx optimizely-cms-typegen --input types.json --outdir src/cms/content-types
```

**Output structure:**
```
src/cms/content-types/
├── blocks/
│   ├── index.ts
│   ├── HeroBlock.ts
│   └── FeatureGridBlock.ts
├── elements/
│   ├── index.ts
│   ├── HeadingElement.ts
│   └── ButtonElement.ts
├── pages/
│   ├── index.ts
│   └── NewsDetailPage.ts
├── settings/
│   ├── index.ts
│   └── SiteSettings.ts
└── index.ts
```

### Single-file Output

Generates all types in a single file:

```bash
npx optimizely-cms-typegen --input types.json --output src/cms/content-types.ts
```

### With Registry Initialization

Generates an additional `registry.ts` file with helper functions:

```bash
npx optimizely-cms-typegen --input types.json --outdir src/cms/content-types --with-registry
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-i, --input <path>` | Path to `types.json` file (required) |
| `-o, --outdir <path>` | Output directory for generated files (default: `src/cms/content-types`) |
| `--output <path>` | Output file path (implies `--single-file`) |
| `--single-file` | Generate all types in a single file |
| `--with-registry` | Generate registry initialization file |

## Categorization Rules

Content types are automatically categorized based on their `baseType` and naming:

| Condition | Folder |
|-----------|--------|
| `baseType: '_page'` | `pages/` |
| `baseType: '_component'` + name ends with "Settings" | `settings/` |
| `baseType: '_component'` + name ends with "Element" | `elements/` |
| `baseType: '_component'` + otherwise | `blocks/` |
| `baseType: '_media'`, `'_image'`, `'_video'` | Skipped (built-in) |

## Example Output

### elements/HeadingElement.ts

```typescript
import { contentType, displayTemplate } from '@optimizely/cms-sdk';

/**
 * Heading
 *
 * A text heading with configurable level
 */
export const HeadingElementCT = contentType({
  key: 'HeadingElement',
  displayName: 'Heading',
  description: 'A text heading with configurable level',
  baseType: '_component',
  compositionBehaviors: ['elementEnabled'],
  properties: {
    text: {
      type: 'string',
      displayName: 'Text',
      required: true,
      maxLength: 255,
    },
  },
});

export const HeadingDisplayTemplate = displayTemplate({
  key: 'HeadingDisplayTemplate',
  displayName: 'Heading Style',
  contentType: 'HeadingElement',
  isDefault: true,
  settings: {
    level: {
      editor: 'select',
      displayName: 'Heading Level',
      sortOrder: 0,
      choices: {
        auto: { displayName: 'Auto', sortOrder: 0 },
        h1: { displayName: 'Heading 1', sortOrder: 1 },
        h2: { displayName: 'Heading 2', sortOrder: 2 },
      },
    },
  },
});
```

### blocks/FeatureGridBlock.ts

```typescript
import { contentType, displayTemplate } from '@optimizely/cms-sdk';
import { FeatureItemElementCT } from '../elements/FeatureItemElement';

/**
 * Feature Grid Block
 *
 * A grid displaying multiple feature items
 */
export const FeatureGridBlockCT = contentType({
  key: 'FeatureGridBlock',
  displayName: 'Feature Grid Block',
  baseType: '_component',
  compositionBehaviors: ['sectionEnabled'],
  properties: {
    features: {
      type: 'array',
      displayName: 'Features',
      items: {
        type: 'component',
        contentType: FeatureItemElementCT,
      },
      minItems: 1,
      maxItems: 6,
    },
  },
});
```

### registry.ts (with --with-registry)

```typescript
import {
  initContentTypeRegistry,
  initDisplayTemplateRegistry,
  BlankExperienceContentType,
  BlankSectionContentType,
} from '@optimizely/cms-sdk';

import {
  HeadingElementCT,
  ButtonElementCT,
  HeroBlockCT,
  FeatureGridBlockCT,
  // ...
} from './index';

import {
  HeadingDisplayTemplate,
  HeroDisplayTemplate,
  // ...
} from './index';

export const allContentTypes = [
  BlankExperienceContentType,
  BlankSectionContentType,
  HeadingElementCT,
  ButtonElementCT,
  HeroBlockCT,
  FeatureGridBlockCT,
  // ...
];

export const allDisplayTemplates = [
  HeadingDisplayTemplate,
  HeroDisplayTemplate,
  // ...
];

export function initAllRegistries() {
  initContentTypeRegistry(allContentTypes);
  initDisplayTemplateRegistry(allDisplayTemplates);
}
```

## Programmatic API

```typescript
import { parseTypesJson, generate } from 'optimizely-cms-typegen';

const parsed = parseTypesJson('./types.json');

generate(parsed, {
  outdir: './src/cms/content-types',
  singleFile: false,
  withRegistry: true,
});
```

## License

MIT
