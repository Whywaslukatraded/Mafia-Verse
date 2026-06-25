const fs = require('fs');
const path = require('path');

const nm = path.join(__dirname, 'node_modules');

// For each .PKGNAME-XXXXXXXX temp dir, move its contents into the real package dir
function readdirSafe(d) {
  try { return fs.readdirSync(d); } catch(e) { return []; }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of readdirSafe(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    try {
      const stat = fs.lstatSync(s);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(s);
        try { fs.unlinkSync(d); } catch(e) {}
        fs.symlinkSync(target, d, stat.isDirectory() ? 'dir' : 'file');
      } else if (stat.isDirectory()) {
        copyRecursive(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    } catch(e) {}
  }
}

function rmrf(dir) {
  for (const entry of readdirSafe(dir)) {
    const full = path.join(dir, entry);
    try {
      if (fs.lstatSync(full).isDirectory()) rmrf(full);
      else fs.unlinkSync(full);
    } catch(e) {}
  }
  try { fs.rmdirSync(dir); } catch(e) {}
}

function swapTempDirs(dir) {
  const tempPattern = /^\.(.+)-[0-9A-Za-z]{8}$/;
  for (const entry of readdirSafe(dir)) {
    const m = entry.match(tempPattern);
    if (!m) continue;
    const tempPath = path.join(dir, entry);
    const realName = m[1];
    const realPath = path.join(dir, realName);
    try {
      // Copy temp -> real (overwrite)
      copyRecursive(tempPath, realPath);
      // Remove temp dir
      rmrf(tempPath);
      console.log('swapped:', realName);
    } catch(e) {
      console.error('failed:', realName, e.message);
    }
  }
}

swapTempDirs(nm);
// Also handle scoped packages
for (const entry of readdirSafe(nm)) {
  if (entry.startsWith('@')) {
    swapTempDirs(path.join(nm, entry));
  }
}
console.log('done');
