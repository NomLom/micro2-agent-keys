import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildSessionUrl, nativeSessionActive } from '../dist/vscode-app.js';
import { appDataRoot, stateRoot, vscodeUserDataRoot } from '../dist/platform.js';

test('Windows defaults use roaming VS Code data and local device state', { skip: process.platform !== 'win32' }, () => {
  assert.equal(vscodeUserDataRoot(), path.join(appDataRoot(), 'Code'));
  assert.equal(stateRoot(), path.join(process.env.LOCALAPPDATA ?? appDataRoot(), 'AgentKeys'));
});

test('Windows project path produces an encoded VS Code file URL', { skip: process.platform !== 'win32' }, () => {
  const session = '11111111-1111-1111-1111-111111111111';
  const url = buildSessionUrl('C:\\Projects\\Demo space', session);
  assert.match(url, /^vscode:\/\/file\/C:\/Projects\/Demo%20space\?/);
  assert.equal(new URL(url).searchParams.get('session'), `agent-host-copilotcli:/${session}`);
});

test('Windows reads active native sessions from a SQLite state database', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentkeys-win-sqlite-'));
  const file = path.join(dir, 'state.vscdb');
  const session = '11111111-1111-1111-1111-111111111111';
  const db = new DatabaseSync(file);
  try {
    db.exec('CREATE TABLE ItemTable (key TEXT, value TEXT)');
    db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run('memento/interactive-session', session);
  } finally {
    db.close();
  }
  try {
    assert.equal(nativeSessionActive(file, session), true);
    assert.equal(nativeSessionActive(file, '22222222-2222-2222-2222-222222222222'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
