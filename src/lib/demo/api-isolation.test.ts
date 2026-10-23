import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { demoApiDisabled } from "../runtime-mode";

async function files(dir:string):Promise<string[]> {
  return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(path.join(dir,e.name)):Promise.resolve([path.join(dir,e.name)])))).flat();
}
test("every connected API handler starts with a demo guard", async () => {
  const routes=(await files("src/app/api")).filter(f=>f.endsWith("/route.ts")&&!f.includes("/health/"));
  let guarded=0;
  for(const file of routes){
    const source=await readFile(file,"utf8");
    if(file.includes("/inngest/")) { for(const method of ["GET","POST","PUT"]) assert.match(source,new RegExp(`export const ${method}:.*isDemoMode\\(\\) \\? demoApiDisabled\\(\\)`)); continue; }
    const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    for(const n of tree.statements){
      if(ts.isFunctionDeclaration(n)&&n.name&&/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(n.name.text)&&n.body){
        assert.match(n.body.statements[0].getText(tree),/^if \(isDemoMode\(\)\) return demoApiDisabled\(\);$/,file);guarded++;
      }
    }
  }
  assert.ok(guarded>50); assert.equal(demoApiDisabled().status,403);
});
test("default demo ignores inherited malformed provider configuration", () => {
  const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",`import config from './src/lib/env.ts'; const {env,getRuntimeEnvValue}=config; if(env.DATABASE_URL||env.EVOLUTION_API_KEY||env.NEXT_PUBLIC_SUPABASE_URL||getRuntimeEnvValue('OPENROUTER_API_KEY')) process.exit(1);`],{encoding:"utf8",env:{NODE_ENV:"test",PATH:process.env.PATH,FLETEOPS_MODE:"demo",DATABASE_URL:"synthetic-canary",EVOLUTION_API_KEY:"synthetic-canary",NEXT_PUBLIC_SUPABASE_URL:"not-a-url",OPENROUTER_API_KEY:"synthetic-canary"}});
  assert.equal(result.status,0,"inherited provider configuration must stay disabled");
});
