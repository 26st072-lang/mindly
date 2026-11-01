import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'previews','source');
const [{outputFiles},shell,css,mascot,license]=await Promise.all([
  build({entryPoints:[path.join(source,'preview.js')],bundle:true,minify:true,format:'iife',target:'es2020',write:false,legalComments:'inline'}),
  readFile(path.join(source,'shell.html'),'utf8'),readFile(path.join(source,'preview.css'),'utf8'),readFile(path.join(root,'assets','mascot.png')),
  readFile(path.join(root,'node_modules','three','LICENSE'),'utf8')
]);
const script=outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html=shell.replace('/*__STYLE__*/',()=>css).replace('__MASCOT__',()=>`data:image/png;base64,${mascot.toString('base64')}`).replace('/*__SCRIPT__*/',()=>script);
await mkdir(path.join(root,'previews'),{recursive:true});
for(const [file,initial] of [['mindly-3d-preview.html',0],['previews/01-sunlit-room.html',0],['previews/02-letters-of-care.html',1],['previews/03-quiet-journal.html',2]]){
  const output=html.replaceAll('__INITIAL__',String(initial)).replace('</head>',`<!-- Three.js is distributed under the MIT License.\n${license.replaceAll('--','—')}\n-->\n</head>`);
  await writeFile(path.join(root,file),output);console.log(`${file}: ${(Buffer.byteLength(output)/1024).toFixed(0)} KB`);
}
