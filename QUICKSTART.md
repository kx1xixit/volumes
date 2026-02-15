# Quick start guide

You can get Volumes's development environment up and ready within a few minutes.

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- TurboWarp ([Link](https://turbowarp.org/)) or any other Scratch mod

## Setup (One-time)

```bash
# 1. Clone your repository
git clone https://github.com/kx1xixit/volumes.git
cd volumes

# 2. Install dependencies
npm ci

# 3. Build the extension
npm run build
```

## Development workflow

### Option A: One-time nuild (Simple)

1. Edit files in `src/`
2. Run `npm run build`
3. Load the extension in TurboWarp

### Option B: Watch mode (Recommended)

1. Install `chokidar`: `npm install --save-dev chokidar`
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

## Common commands

| Command          | What it does                     |
| ---------------- | -------------------------------- |
| `npm run build`  | Build the extension once         |
| `npm run watch`  | Rebuild automatically on changes |
| `npm run lint`   | Check for code errors            |
| `npm run format` | Auto-format your code            |
| `npm run test`   | Run tests                        |

## Publishing a release

```bash
# Update version in src/manifest.json

# Create a git tag
git tag v1.0.0

# Push to GitHub
git push origin main --tags
```

→ GitHub Actions will automatically create a release!

## Need help?

- Full docs: [README.md](README.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Issues: [Create an issue](../../issues/new)
- Scratch Extension Protocol: [Scratch Wiki](https://en.scratch-wiki.info/wiki/Scratch_Extension_Protocol)

---

Happy extending!
