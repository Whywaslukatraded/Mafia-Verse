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
    const s = path.resolve(src, entry);
    const relS = path.relative(src, s);
    if (relS.startsWith('..') || path.isAbsolute(relS)) continue;
    const d = path.resolve(dest, entry);
    const relD = path.relative(dest, d);
    if (relD.startsWith('..') || path.isAbsolute(relD)) continue;
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
    const full = path.resolve(dir, entry);
    const rel = path.relative(dir, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
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
    const tempPath = path.resolve(dir, entry);
    const relTemp = path.relative(dir, tempPath);
    if (relTemp.startsWith('..') || path.isAbsolute(relTemp)) continue;
    const realName = m[1];
    const realPath = path.resolve(dir, realName);
    const relReal = path.relative(dir, realPath);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) continue;
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
