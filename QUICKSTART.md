# Quick Start Guide

Get up and running with your TurboWarp extension in 5 minutes!

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- TurboWarp ([Link](https://turbowarp.org/)) or Scratch 3.0+

## Setup (One-time)

```bash
# 1. Clone your repository
git clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
cd YOUR-REPO-NAME

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build
```

## Development Workflow

### Option A: One-time Build (Simple)

1. Edit files in `src/`
2. Run `npm run build`
3. Load the extension in TurboWarp

### Option B: Watch Mode (Recommended)

1. Install chokidar: `npm install --save-dev chokidar`
2. Start watching: `npm run watch`
3. Edit files in `src/` - changes auto-build!
4. Reload the extension in TurboWarp

## Using Your Extension

1. **Build**: `npm run build`
2. **Load in TurboWarp**:
   - Go to [turbowarp.org](https://turbowarp.org)
   - Click "Add Extension"
   - Click "Load Custom Extension"
   - Select or paste path to `build/extension.js`
3. **Test**: Your extension blocks should appear in the editor
4. **Debug**: Check browser console (F12) for errors

## Project Structure

```
src/               ← Edit your code here
├── 01-core.js     ← Main extension class (must have getInfo())
├── 02-*.js        ← Helper files (optional)
└── manifest.json  ← Extension metadata

build/
└── extension.js   ← Generated output (don't edit!)

scripts/
└── build.js       ← Build script
```

## Creating Your First Block

1. Edit `src/01-core.js`
2. Add a block to the `getInfo()` method:

```javascript
getInfo() {
  return {
    id: 'myExtension',
    name: 'My Extension',
    blocks: [
      {
        opcode: 'myBlock',
        blockType: 'reporter',
        text: 'say [TEXT]',
        arguments: {
          TEXT: {
            type: 'string',
            defaultValue: 'hello',
          },
        },
      },
    ],
  };
}
```

3. Add the block implementation:

```javascript
myBlock(args) {
  return `You said: ${args.TEXT}`;
}
```

4. Build: `npm run build`
5. Load in TurboWarp and test!

## Common Commands

| Command          | What it does                     |
| ---------------- | -------------------------------- |
| `npm run build`  | Build the extension once         |
| `npm run watch`  | Rebuild automatically on changes |
| `npm run lint`   | Check for code errors            |
| `npm run format` | Auto-format your code            |
| `npm run test`   | Run tests                        |

## Publishing a Release

```bash
# Update version in src/manifest.json

# Create a git tag
git tag v1.0.0

# Push to GitHub
git push origin main --tags
```

→ GitHub Actions will automatically create a release!

## Need Help?

- Full docs: [README.md](README.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Issues: [Create an issue](../../issues/new)
- Scratch Extension Protocol: [Scratch Wiki](https://en.scratch-wiki.info/wiki/Scratch_Extension_Protocol)

---

Happy extending!
