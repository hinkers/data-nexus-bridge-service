# Node.js Version Compatibility

This project is configured to work with **Node.js 20.11.1** and above.

## Current Package Versions

The following packages have been selected for compatibility with Node.js 20.11+:

- **Vite**: `^6.4.1` (instead of 7.x which requires Node 20.19+)
- **@vitejs/plugin-react**: `^4.7.0` (instead of 5.x which requires Node 20.19+)

## If You Have Node.js 20.19+ or 22.12+

You can upgrade to the latest Vite for better performance and features:

```bash
npm install vite@latest @vitejs/plugin-react@latest --save-dev
```

## Troubleshooting

### Error: "crypto.hash is not a function"

This means you're using Vite 7.x with Node.js < 20.19. Solution:

```bash
# Downgrade to Vite 6.x (already configured in package.json)
npm install
```

### Checking Your Node.js Version

```bash
node --version
```

Should output: `v20.11.1` or higher

### Upgrading Node.js

If you want to use the latest Vite, upgrade Node.js:

**Windows:**
- Download from https://nodejs.org/
- Or use nvm-windows: `nvm install 22` then `nvm use 22`

**Linux/Mac:**
- Using nvm: `nvm install 22` then `nvm use 22`
- Or download from https://nodejs.org/

## Version History

- **Initial setup**: Used Vite 7.3.1 (requires Node 20.19+)
- **Current**: Downgraded to Vite 6.4.1 (works with Node 20.11+)
