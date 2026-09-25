import * as os from 'os';
import * as path from 'path';

export function appDataRoot(): string {
  return process.platform === 'win32'
    ? process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    : path.join(os.homedir(), 'Library', 'Application Support');
}

export function stateRoot(): string {
  return process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? appDataRoot(), 'AgentKeys')
    : path.join(os.homedir(), '.local', 'state', 'agentkeys');
}

export function vscodeUserDataRoot(): string {
  return process.env.AGENTKEYS_VSCODE_USER_DATA ?? path.join(appDataRoot(), 'Code');
}
