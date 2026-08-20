const fs = require('fs');
const path = require('path');
const babelParser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const projectRoot = process.cwd();

function getAllFiles(dir, extPatterns, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, extPatterns, fileList);
    } else if (extPatterns.some(p => entry.name.endsWith(p))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const srcDir = path.join(projectRoot, 'src');
const files = getAllFiles(srcDir, ['.js', '.jsx', '.tsx']);
const stringsMap = {};

files.forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = babelParser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch (e) {
    console.error('Parse error in', file, e.message);
    return;
  }
  traverse(ast, {
    StringLiteral({ node }) {
      
      const parent = node.parent;
      if (parent && (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration')) return;
      if (parent && parent.type === 'ObjectProperty' && parent.key === node) return;
      if (!node.value.trim()) return;
      const locLine = node.loc && node.loc.start && node.loc.start.line ? node.loc.start.line : 0;
      const relPath = path.relative(projectRoot, file).replace(/\\\\/g, '/');
      const key = `${relPath}:${locLine}`;
      stringsMap[key] = node.value;
    },
    JSXText({ node }) {
      const text = node.value.trim();
      if (!text) return;
      const locLine = node.loc && node.loc.start && node.loc.start.line ? node.loc.start.line : 0;
      const relPath = path.relative(projectRoot, file).replace(/\\\\/g, '/');
      const key = `${relPath}:${locLine}`;
      stringsMap[key] = text;
    }
  });
});

const outDir = path.join(projectRoot, 'scripts');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'extracted_strings.json'), JSON.stringify(stringsMap, null, 2));
console.log('Extracted', Object.keys(stringsMap).length, 'strings');
