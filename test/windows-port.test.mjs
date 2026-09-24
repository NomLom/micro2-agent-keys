import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { buildSessionUrl, nativeSessionActive } from '../dist/vscode-app.js';
import { appDataRoot, stateRoot, vscodeUserDataRoot } from '../dist/platform.js';
import { VSCodeIntegration } from '../dist/vscode.js';

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

test('Copilot CLI sessions share slots and reopen through the CLI launcher', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentkeys-cli-'));
  const root = path.join(dir, 'session-state');
  const nativeRoot = path.join(dir, 'workspaceStorage');
  const id = '11111111-1111-4111-8111-111111111111';
  const sessionDir = path.join(root, id);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(nativeRoot);
  fs.writeFileSync(path.join(sessionDir, 'workspace.yaml'), `id: ${id}\ncwd: ${JSON.stringify(dir)}\n`);
  const events = path.join(sessionDir, 'events.jsonl');
  const write = (...entries) => fs.appendFileSync(events, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  write({ type: 'session.start', data: { producer: 'copilot-agent', version: 1 } });
  const launches = [];
  const integration = new VSCodeIntegration({
    root, nativeRoot, statePath: path.join(dir, 'state.json'), enabledSlots: [0],
    launchCli: async (cwd, sessionId) => launches.push([cwd, sessionId]),
  });
  try {
    await integration.scan(true);
    write({ type: 'user.message', data: { turnId: 'turn-1' } },
      { type: 'assistant.turn_start', data: { turnId: 'turn-1' } });
    await integration.scan();
    assert.equal(integration.publicSlots()[0].source, 'standalone-cli');
    assert.equal(integration.publicSlots()[0].state, 'running');
    write({ type: 'assistant.turn_end', data: { turnId: 'turn-1' } });
    await integration.scan();
    assert.equal(integration.publicSlots()[0].state, 'done');
    const opened = await integration.open(0);
    assert.equal(opened.url, `copilot --resume=${id}`);
    assert.deepEqual(launches, [[dir, id]]);
    assert.equal(integration.publicSlots()[0].state, 'idle');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
