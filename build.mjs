import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');
const distDir = path.resolve('dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Helper to copy files/directories
function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyStaticAssets() {
  copyFile('manifest.json', path.join(distDir, 'manifest.json'));
  copyFile('src/popup/popup.html', path.join(distDir, 'popup.html'));
  copyFile('src/popup/popup.css', path.join(distDir, 'popup.css'));
  copyFile('src/content/content.css', path.join(distDir, 'content.css'));
  copyDir('icons', path.join(distDir, 'icons'));
  console.log('[Build] Static assets copied to dist/');
}

async function runBuild() {
  console.log('[Build] Building WhatsApp Web - Forwarded Text Mode extension...');
  copyStaticAssets();

  const buildOptions = [
    // Content Script Bundle
    {
      entryPoints: ['src/content/index.ts'],
      bundle: true,
      outfile: 'dist/content.js',
      format: 'iife',
      target: 'es2022',
      sourcemap: false,
      minify: false,
    },
    // Popup Script Bundle
    {
      entryPoints: ['src/popup/popup.ts'],
      bundle: true,
      outfile: 'dist/popup.js',
      format: 'iife',
      target: 'es2022',
      sourcemap: false,
      minify: false,
    },
    // Background Service Worker Bundle
    {
      entryPoints: ['src/background/background.ts'],
      bundle: true,
      outfile: 'dist/background.js',
      format: 'esm',
      target: 'es2022',
      sourcemap: false,
      minify: false,
    },
    // Injected Page-Context Script (runs in WA Web's own JS context)
    {
      entryPoints: ['src/content/waInject.ts'],
      bundle: true,
      outfile: 'dist/waInject.js',
      format: 'iife',
      target: 'es2022',
      sourcemap: false,
      minify: false,
    },
  ];

  if (isWatch) {
    console.log('[Build] Watching for changes...');
    for (const opt of buildOptions) {
      const ctx = await esbuild.context(opt);
      await ctx.watch();
    }
  } else {
    for (const opt of buildOptions) {
      await esbuild.build(opt);
    }
    console.log('[Build] Extension build completed successfully in dist/');
  }
}

runBuild().catch((err) => {
  console.error('[Build] Build failed:', err);
  process.exit(1);
});
