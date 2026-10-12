const fs = require('fs');
const path = require('path');

// node-dependency-injection walks src/ in readdir order and awaits its files
// concurrently. Interface aliases go to whichever implementation finishes first
// and definitions are dumped in completion order, so config/container/
// services.yaml changes with the filesystem and with I/O timing. Walk in name
// order and process one file at a time so the generated file depends only on
// the sources.
const relativePath =
  'node_modules/node-dependency-injection/dist/lib/Autowire.js';
const replacements = [
  [
    'files=_fs["default"].readdirSync(dir,{withFileTypes:true});',
    'files=_fs["default"].readdirSync(dir,{withFileTypes:true}).sort(function(a,b){return a.name<b.name?-1:a.name>b.name?1:0;});',
  ],
  [
    'var promises,_iterator2,_step2,filePath;',
    'var promises,_iterator2,_step2,filePath,sequence=Promise.resolve();',
  ],
  [
    'promises.push(this._executeFilePath(filePath));',
    'promises.push(sequence=sequence.then(this._executeFilePath.bind(this,filePath)));',
  ],
];

const autowireFile = path.join(process.cwd(), relativePath);

if (!fs.existsSync(autowireFile)) {
  throw new Error(`Unable to find autowire file: ${relativePath}`);
}

let next = fs.readFileSync(autowireFile, 'utf8');
let changed = false;

for (const [search, replacement] of replacements) {
  if (next.includes(replacement)) {
    continue;
  }

  if (!next.includes(search)) {
    throw new Error(`Unable to patch ${relativePath}`);
  }

  next = next.replace(search, replacement);
  changed = true;
}

if (changed) {
  fs.writeFileSync(autowireFile, next);
  console.log(`Patched ${relativePath}`);
}
