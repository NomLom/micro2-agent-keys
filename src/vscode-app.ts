import * as fs from 'fs';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';

export const RESOURCE_SCHEME = 'agent-host-copilotcli';
export const NATIVE_RESOURCE_SCHEME = 'vscode-chat-session';
export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VSCODE_APP = '/Applications/Visual Studio Code.app';

export function nativeSessionResource(sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid VS Code session id');
  return `${NATIVE_RESOURCE_SCHEME}://local/${Buffer.from(sessionId).toString('base64url')}`;
}

export function nativeSessionActive(indexPath: string, sessionId: string): boolean | null {
  if (!SESSION_ID.test(sessionId)) return null;
  if (process.platform === 'win32') {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(indexPath, { readOnly: true });
      const result = db.prepare(
        "SELECT CASE WHEN EXISTS (SELECT 1 FROM ItemTable WHERE key IN " +
        "('memento/interactive-session', 'chat.terminalSessions') AND " +
        "instr(CAST(value AS TEXT), ?) > 0) THEN 1 ELSE 0 END"
      ).get(sessionId);
      const value = result ? Object.values(result)[0] : null;
      return value === 1 ? true : value === 0 ? false : null;
    } catch {
      return null;
    } finally {
      db?.close();
    }
  }
  try {
    const query =
      `SELECT CASE WHEN EXISTS (` +
      `SELECT 1 FROM ItemTable WHERE key IN ('memento/interactive-session', 'chat.terminalSessions') ` +
      `AND instr(CAST(value AS TEXT), '${sessionId}') > 0) THEN 1 ELSE 0 END`;
    const result = execFileSync('/usr/bin/sqlite3', [indexPath, query], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
    return result === '1' ? true : result === '0' ? false : null;
  } catch {
    return null;
  }
}

export function buildSessionUrl(cwd: string, sessionId: string, resource: string = `${RESOURCE_SCHEME}:/${sessionId}`): string {
  if (!path.isAbsolute(cwd)) throw new Error('project path is not absolute');
  if (!SESSION_ID.test(sessionId)) throw new Error('invalid VS Code session id');
  const url = new URL('vscode://file');
  url.pathname = pathToFileURL(cwd).pathname;
  url.searchParams.set('session', resource);
  return url.toString();
}

export function launchUrl(url: string, exec: typeof execFile = execFile): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(process.platform === 'win32' ? 'explorer.exe' : '/usr/bin/open', [url],
      (err) => (err ? reject(err) : resolve()));
  });
}

interface ExactOpenCompatibility {
  available: boolean;
  version: string | null;
  protocolRegistered: boolean;
}

export function exactOpenSupported(
  _version: string | null,
  protocolRegistered: boolean
): boolean {
  return protocolRegistered;
}

export function exactOpenCompatibility(): ExactOpenCompatibility {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'resources', 'app', 'package.json'),
      path.join(process.env.ProgramFiles ?? '', 'Microsoft VS Code', 'resources', 'app', 'package.json'),
    ];
    let version: string | null = null;
    for (const candidate of candidates) {
      try {
        version = (JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: string }).version ?? null;
        break;
      } catch { /* Try the next installation location. */ }
    }
    let protocolRegistered = false;
    try {
      execFileSync('reg.exe', ['query', 'HKCR\\vscode', '/v', 'URL Protocol'], { stdio: 'ignore' });
      protocolRegistered = true;
    } catch { /* VS Code's URL handler is unavailable. */ }
    return { available: protocolRegistered, version, protocolRegistered };
  }
  if (process.platform !== 'darwin' || !fs.existsSync(VSCODE_APP)) {
    return { available: false, version: null, protocolRegistered: false };
  }
  let version: string | null = null;
  let protocolRegistered = false;
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(VSCODE_APP, 'Contents', 'Resources', 'app', 'package.json'), 'utf8')
    ) as { version?: string };
    version = packageJson.version ?? null;
    const urlTypes = JSON.parse(
      execFileSync(
        '/usr/bin/plutil',
        ['-extract', 'CFBundleURLTypes', 'json', '-o', '-', path.join(VSCODE_APP, 'Contents', 'Info.plist')],
        { encoding: 'utf8' }
      )
    ) as { CFBundleURLSchemes?: string[] }[];
    protocolRegistered = urlTypes.some((entry) => entry.CFBundleURLSchemes?.includes('vscode'));
    execFileSync('/usr/bin/open', ['-Ra', 'Visual Studio Code'], { stdio: 'ignore' });
  } catch {
    return { available: false, version, protocolRegistered };
  }
  return {
    available: exactOpenSupported(version, protocolRegistered),
    version,
    protocolRegistered,
  };
}
