/**
 * SHELLDOJO - SUITE DE PRUEBAS UNITARIAS DEL MOTOR VALIDADOR
 * Ejecución nativa con Node.js: `node --test tests/validator.test.js`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, normalizeCommandString } from '../js/core/validator.js';

test('Normaliza múltiples espacios y bordes', () => {
  assert.equal(normalizeCommandString('   git    checkout   -b   main  '), 'git checkout -b main');
});

test('Normaliza espacios alrededor de tuberías (|)', () => {
  const valid = ['netstat -ano | findstr :8080'];
  assert.equal(validateCommand('netstat -ano|findstr :8080', valid), true);
  assert.equal(validateCommand('netstat -ano | findstr :8080', valid), true);
  assert.equal(validateCommand('netstat   -ano   |   findstr :8080', valid), true);
});

test('Acepta equivalencias entre docker compose y docker-compose', () => {
  const valid = ['docker compose up -d', 'docker-compose up -d'];
  assert.equal(validateCommand('docker-compose up -d', valid), true);
  assert.equal(validateCommand('docker compose up -d', valid), true);
});

test('Acepta comillas simples y dobles indistintamente en mensajes de commit', () => {
  const valid = ['git commit -m "Initial commit"'];
  assert.equal(validateCommand("git commit -m 'Initial commit'", valid), true);
  assert.equal(validateCommand('git commit -m "Initial commit"', valid), true);
});

test('Acepta mayúsculas y minúsculas en comandos de Windows CMD', () => {
  const valid = ['taskkill /F /PID 3140', 'taskkill /PID 3140 /F'];
  assert.equal(validateCommand('taskkill /f /pid 3140', valid), true);
  assert.equal(validateCommand('TASKKILL /PID 3140 /F', valid), true);
});

