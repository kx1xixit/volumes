# TurboWarp Extension Template

A template repository for creating **TurboWarp/Scratch extensions** with CI/CD workflows and automated builds.

## Features

- **Modular Architecture**: Organize your extension code into separate files
- **Automated Build System**: Combines multiple JS files from `/src/` into a single extension bundle
- **CI/CD Workflows**: GitHub Actions for building, testing, and releasing
- **Watch Mode**: Development mode with automatic rebuilding on file changes
- **Linting & Formatting**: ESLint and Prettier pre-configured
- **Release Automation**: Automatic release creation with build artifacts
- **Scratch Extension Format**: Ready for TurboWarp or Scratch 3.0+ environments

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or yarn
- TurboWarp or Scratch 3.0+ environment

### Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

#### Build the extension

```bash
npm run build
```

This creates `build/extension.js` by combining all `.js` files from `src/`.

#### Watch mode (automatic rebuild on file changes)

```bash
npm run watch
```

#### Lint your code

```bash
npm run lint
```

#### Format code

```bash
npm run format
```

## Project Structure

```
├── src/
│   ├── manifest.json          # Extension metadata
│   ├── 01-core.js             # Main extension class
│   ├── 02-example-module.js   # Example helper code
│   └── [other modules].js     # Add more modules here
├── build/
│   └── extension.js           # Generated output file
├── scripts/
│   └── build.js               # Build script
└── Configuration files
```

## How It Works

### File Loading Order

Files in `src/` are loaded in **alphabetical order** by the build script. Use numbered prefixes to control load order:

- `01-core.js` - Main extension class (loaded first, must have `getInfo()` and block methods)
- `02-helpers.js` - Helper functions and utilities
- `03-utils.js` - Additional utilities
- etc.

### Extension Structure

The generated `extension.js` includes:

1. **Extension Header**: Generated from `src/manifest.json`
2. **IIFE Wrapper**: `(function (Scratch) { ... })(Scratch)`
3. **All Source Files**: Concatenated in alphabetical order
4. **Extension Registration**: `Scratch.extensions.register(new YourExtension())`

### Creating Blocks

Add blocks to your extension's `getInfo()` method:

```javascript
class MyExtension {
  getInfo() {
    return {
      id: 'myExtension',
      name: 'My Extension',
      color1: '#4CAF50',
      blocks: [
        {
          opcode: 'myBlock',
          blockType: 'reporter',
          text: 'my block',
        },
      ],
    };
  }

  myBlock() {
    return 'Hello!';
  }
}
```

## Configuration

### manifest.json

Customize your extension metadata in `src/manifest.json`:

```json
{
  "name": "My Extension",
  "id": "myExtension",
  "version": "1.0.0",
  "description": "What does my extension do?",
  "author": "Your Name",
  "licence": "MIT"
}
```

The metadata is automatically inserted into the extension header:

```javascript
// Name: My Extension
// ID: myExtension
// Description: What does my extension do?
// By: Your Name
// Licence: MIT
// Version 1.0.0
```

### ESLint & Prettier

Edit `.eslintrc.json` and `.prettierrc.json` to customize linting and formatting rules.

## CI/CD Workflows

### Build Workflow (`.github/workflows/build.yml`)

Automatically builds the extension on:

- Push to `main`, `develop`, or `master` branches
- Pull requests to these branches
- Tests against Node.js 18.x and 20.x

Artifacts are uploaded and available for download.

### Release Workflow (`.github/workflows/release.yml`)

Automatically builds and releases the extension when you:

1. Create a git tag: `git tag v1.0.0`
2. Push the tag: `git push origin v1.0.0`

The workflow will:

- Build the extension
- Create a GitHub release
- Upload `build/extension.js` as a release asset

## Installation in TurboWarp

1. Build the extension: `npm run build`
2. Go to [TurboWarp](https://turbowarp.org)
3. Click "Add Extension" → "Load Custom Extension"
4. Paste the URL or upload `build/extension.js` file
5. The extension blocks will appear in the editor

### For Local Testing

To test locally during development, you can use a fork of TurboWarp that loads extensions from a local server:

1. Build: `npm run build`
2. Start a local HTTP server
3. Load from `http://localhost:PORT/build/extension.js`

## Tips

- **Development**: Use `npm run watch` while developing to automatically rebuild on changes
- **Testing**: Load the extension in TurboWarp's "Load Custom Extension" dialog
- **Versioning**: Update `version` in `src/manifest.json` when releasing new versions
- **Block Colors**: Use hex colors in `getInfo()` for `color1`, `color2`, `color3`
- **Block Types**: Use `'reporter'`, `'command'`, `'boolean'`, `'hat'`, or `'conditional'`

## Troubleshooting

### Extension doesn't load

- Check browser console for error messages
- Verify the extension ID is unique
- Ensure syntax is valid: run `npm run lint`

### Changes not reflected

- Run `npm run build` to rebuild if not in watch mode
- Hard refresh TurboWarp (Ctrl+Shift+R)
- For block changes: reload extension via "Load Custom Extension"

### Build errors

- Check that all `.js` files in `src/` have valid JavaScript syntax
- Run `npm run lint` to find potential issues
- Ensure manifest.json is valid JSON

## Example Extensions

This template includes example code. To see it in action:

1. Run `npm run build`
2. Load `build/extension.js` into TurboWarp
3. Look for "My Extension" in the extensions menu
4. Use the example blocks

## License

MIT

## Contributing

Feel free to use this template as a starting point for your own TurboWarp/Scratch extensions!

For questions or improvements, open an issue or pull request.
