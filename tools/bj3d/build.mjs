import * as esbuild from 'esbuild'; import fs from 'fs'; import path from 'path';
const SH='node_modules/three/src/renderers/shaders/';
const KEEP_LIB=['meshlambert','meshbasic','background','backgroundCube','cube','equirect','distance'];
const need=new Set(); const read=f=>fs.readFileSync(f,'utf8');
const scan=s=>{ for(const m of s.matchAll(/#include <([\w]+)>/g)){ if(!need.has(m[1])){ need.add(m[1]); const f=SH+'ShaderChunk/'+m[1]+'.glsl.js'; if(fs.existsSync(f)) scan(read(f)); } } };
for(const l of KEEP_LIB){ const f=SH+'ShaderLib/'+l+'.glsl.js'; if(fs.existsSync(f)) scan(read(f)); }
// WebGLProgram añade estos por su cuenta
['colorspace_pars_fragment','tonemapping_pars_fragment','packing','common'].forEach(n=>{need.add(n); const f=SH+'ShaderChunk/'+n+'.glsl.js'; if(fs.existsSync(f)) scan(read(f));});
const trim=s=>s.replace(/`([\s\S]*?)`/g,(m,body)=>'`'+body.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('//')).join('\n')+'`');
let blanked=[];
const glsl={name:'glsl',setup(b){ b.onLoad({filter:/three[\\/]src[\\/]renderers[\\/]shaders[\\/].*\.glsl\.js$/},async a=>{
  const base=path.basename(a.path,'.glsl.js'), dir=path.basename(path.dirname(a.path));
  let s=read(a.path);
  if(dir==='ShaderChunk' && !need.has(base)){ blanked.push(base); return {contents:'export default "";',loader:'js'}; }
  if(dir==='ShaderLib' && !KEEP_LIB.includes(base)){ blanked.push('lib:'+base); return {contents:'export const vertex="";export const fragment="";',loader:'js'}; }
  return {contents:trim(s),loader:'js'}; }); }};
await esbuild.build({entryPoints:['src/bj3d-src.js'],bundle:true,minify:true,format:'iife',legalComments:'none',target:'es2019',outfile:'dist/bj3d.min.js',plugins:[glsl]});
console.log('blanked',blanked.length, fs.statSync('dist/bj3d.min.js').size);
