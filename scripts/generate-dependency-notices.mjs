import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const unique=new Map();
for(const [location,pkg] of Object.entries(lock.packages)) {
  if(!location)continue;
  const name=location.split('node_modules/').at(-1);
  const key=`${name}@${pkg.version}`;
  if(!pkg.license) throw new Error(`License metadata missing: ${key}`);
  if(!unique.has(key))unique.set(key,{name,version:pkg.version,license:pkg.license,location,dev:!!pkg.dev});
}
let md='# Locked dependency inventory\n\nGenerated from `package-lock.json` by `npm run notices:generate`. These declarations are upstream package metadata, not a legal clearance. Optional platform packages are included; not all are installed on every system. See [scope and obligations](../THIRD_PARTY_NOTICES.md).\n\n| Package | Version | Declared license | Role |\n| --- | --- | --- | --- |\n';
let texts='Dependency license and notice texts\n===================================\n\nCollected verbatim from installed package roots. Platform-optional packages absent on this system have inventory entries but no text here. Any binary/image redistribution must collect notices for its actual target and provide corresponding source where required.\n';
let count=0;
for(const pkg of [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version))){
 md+=`| [${pkg.name}](https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}) | ${pkg.version} | ${pkg.license.replaceAll('|','\\|')} | ${pkg.dev?'Development':'Runtime / optional'} |\n`;
 if(!existsSync(pkg.location))continue;
 for(const file of readdirSync(pkg.location).filter(n=>/^(licen[sc]e|copying|notice|copyright)(\..*)?$/i.test(n)).sort()){
  const full=path.join(pkg.location,file);let bytes;try{bytes=readFileSync(full);}catch{continue;}
  if(bytes.includes(0))throw new Error(`Non-text notice: ${pkg.name}`);
  texts+=`\n\n===== ${pkg.name}@${pkg.version} — ${file} =====\n\n${bytes.toString('utf8')}\n`;count++;
 }
}
writeFileSync('docs/DEPENDENCIES.md',md);
writeFileSync('THIRD_PARTY_LICENSES.txt',texts);
console.log(`Inventoried ${unique.size} package versions; preserved ${count} installed notice/license files.`);
