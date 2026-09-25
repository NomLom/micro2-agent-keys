import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  throw new Error('This installer is for Windows. Use scripts/install-agent.sh on macOS.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hook = path.join(root, 'dist', 'vscode-hook.js');
const daemon = path.join(root, 'dist', 'daemon.js');
if (!fs.existsSync(hook) || !fs.existsSync(daemon)) {
  throw new Error('Build first with npm run build.');
}

const hookDir = path.join(process.env.COPILOT_HOME ?? path.join(os.homedir(), '.copilot'), 'hooks');
const hookFile = path.join(hookDir, 'agentkeys.json');
fs.mkdirSync(hookDir, { recursive: true });
const command = `"${process.execPath}" "${hook}"`;
const names = [
  'PreToolUse', 'PostToolUse', 'PermissionRequest',
  'PermissionDenied', 'SessionStart', 'SessionEnd',
];
const hooks = Object.fromEntries(names.map((name) => [name, [{ type: 'command', command, timeout: 2 }]]));
fs.writeFileSync(hookFile, `${JSON.stringify({ hooks }, null, 2)}\n`);
console.log(`Installed Copilot hooks: ${hookFile}`);
console.log(`Start AgentKeys with: "${process.execPath}" "${daemon}"`);
console.log('Keep that process running while using the keyboard.');
