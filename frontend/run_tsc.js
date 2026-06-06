const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const frontendDir = r`C:\Users\priya\Forged-Final\frontend`;
process.chdir(frontendDir);

try {
  const output = execSync(`node node_modules\\typescript\\bin\\tsc --noEmit`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024
  });
  console.log(output);
  console.log('EXIT_CODE: 0');
} catch (error) {
  console.log(error.stdout || '');
  console.log(error.stderr || '');
  console.log(`EXIT_CODE: ${error.status}`);
}
