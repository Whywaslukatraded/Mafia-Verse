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

// Clean ALL dot-prefixed temp dirs at top level and inside scoped packages
function cleanDotDirs(dir) {
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.') && entry.length > 4) {
        const full = path.join(dir, entry);
        try {
          if (fs.lstatSync(full).isDirectory()) rmrf(full);
        } catch(e) {}
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
