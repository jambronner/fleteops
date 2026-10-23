import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
const files = execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
if (!files.length) throw new Error('No tracked release files to check.');
const findings=[];
for (const file of files) {
  if (/(^|\/)(node_modules|\.next|\.storage|uploads|logs|backups|test-results|playwright-report)\//.test(file) || /(^|\/)\.env(?!\.example$)/.test(file) || /\.(pem|key|p12|pfx|sql\.gz|zip|mp4|pdf|tsbuildinfo|log)$/.test(file)) findings.push([file,'excluded artifact']);
  if(lstatSync(file).isSymbolicLink()){findings.push([file,'symlink']);continue;}
  const bytes=readFileSync(file);if(bytes.includes(0)){findings.push([file,'binary']);continue;}
  const content=bytes.toString('utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) findings.push([file,'private-key material']);
  if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16})/.test(content))findings.push([file,'credential-shaped token']);
  if(/postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@(?!localhost|127\.0\.0\.1)[^\s]+/.test(content))findings.push([file,'embedded database credential']);
}
if(findings.length){for(const [file,reason] of findings)console.error(`${file}: ${reason}`);process.exitCode=1;}
else console.log(`Checked ${files.length} tracked text files. No excluded artifacts or credential shapes detected. Manual privacy review remains required.`);
