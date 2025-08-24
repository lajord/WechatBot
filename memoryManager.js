import fs from 'fs';
import path from 'path';

// secret 9b2db01b3561facd8184c5a2f2736083

const MEMORY_DIR = './memory';
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR);
}

function getMemoryFilePath(userId) {
  const safeId = userId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(MEMORY_DIR, `${safeId}.json`);
}

export function saveMessageToMemory(userId, role, content) {
  const filePath = getMemoryFilePath(userId);
  let memory = [];

  if (fs.existsSync(filePath)) {
    memory = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  memory.push({ role, content });

  // Garder seulement les 5 derniers messages
  if (memory.length > 10) memory = memory.slice(-10);

  fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
}

export function loadMemory(userId) {
  const filePath = getMemoryFilePath(userId);
  if (!fs.existsSync(filePath)) return [];

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
