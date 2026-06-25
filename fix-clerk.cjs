const fs = require('fs');
const path = require('path');

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        if (fs.lstatSync(full).isDirectory()) rmrf(full);
        else fs.unlinkSync(full);
      } catch(e) {}
    }
    fs.rmdirSync(dir);
  } catch(e) {}
}

const nm = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nm)) process.exit(0);

function cleanDotDirs(dir) {
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.') && /[0-9A-F]{4,}$/i.test(entry)) {
        rmrf(path.join(dir, entry));
      }
    }
  } catch(e) {}
}

cleanDotDirs(nm);
try {
  for (const entry of fs.readdirSync(nm)) {
    if (entry.startsWith('@')) {
      cleanDotDirs(path.join(nm, entry));
    }
  }
} catch(e) {}

// Re-link fdir and picomatch for vite
const tinyglobbyNm = path.join(nm, 'tinyglobby/node_modules');
for (const pkg of ['fdir', 'picomatch']) {
  const src = path.join(tinyglobbyNm, pkg);
  const dest = path.join(nm, pkg);
  if (fs.existsSync(src) && !fs.existsSync(dest)) {
    try { fs.symlinkSync(src, dest, 'dir'); } catch(e) {}
  }
}

// Re-link vite's esbuild linux-x64 binary
const viteCacheDir = path.join(nm, '.vite-gUmlbfBd/node_modules/@esbuild/linux-x64');
const viteEsbuildDir = path.join(nm, 'vite/node_modules/@esbuild');
const viteEsbuildDest = path.join(viteEsbuildDir, 'linux-x64');
if (fs.existsSync(viteCacheDir) && !fs.existsSync(viteEsbuildDest)) {
  try {
    fs.mkdirSync(viteEsbuildDir, { recursive: true });
    fs.symlinkSync(viteCacheDir, viteEsbuildDest, 'dir');
  } catch(e) {}
}
