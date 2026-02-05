# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build    # Compile TypeScript to dist/
npm run dev      # Watch mode compilation
```

## Testing the CLI

```bash
# Multi-file output
node dist/cli.js --input types.json --outdir ./output

# Single-file output
node dist/cli.js --input types.json --output ./output/types.ts

# With registry file
node dist/cli.js --input types.json --outdir ./output --with-registry
```

## Architecture

This is a code generator CLI that transforms Optimizely CMS `types.json` files into TypeScript files with `contentType()` and `displayTemplate()` SDK calls.

### Module Structure

- **src/parser.ts** - Parses `types.json`, categorizes content types by folder (blocks/elements/pages/settings), and extracts cross-type dependencies for import generation
- **src/generator.ts** - Generates TypeScript code: `contentType()` calls, `displayTemplate()` calls, index files, and optional registry initialization
- **src/cli.ts** - Commander-based CLI entry point
- **src/index.ts** - Programmatic API exports

### Key Data Flow

1. `parseTypesJson()` reads JSON and returns `ParsedTypes` with content types categorized and dependencies extracted
2. `generate()` orchestrates file creation based on options (multi-file vs single-file, with/without registry)
3. Component references in array `items` are converted from string keys to imported constant references (e.g., `contentType: FeatureItemElementCT`)

### Categorization Logic

Content types are sorted into folders based on `baseType` and naming conventions:
- `_page` → pages/
- `_component` + ends with "Settings" → settings/
- `_component` + ends with "Element" → elements/
- `_component` otherwise → blocks/
- `_media`, `_image`, `_video` → skipped (built-in types)

### Generated Output Naming

- Content type constants: `{Key}CT` (e.g., `HeroBlockCT`)
- Display template constants: `{Key}` as-is (e.g., `HeroDisplayTemplate`)
