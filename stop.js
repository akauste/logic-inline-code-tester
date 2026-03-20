const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pidFile = path.join(__dirname, 'server.pid');

function formatError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return err.message ? err.message : String(err);
}

try {
  if (!fs.existsSync(pidFile)) {
    console.log(`No ${path.basename(pidFile)} found. If the server is running, stop it manually.`);
    process.exit(0);
  }

  const raw = fs.readFileSync(pidFile, 'utf8').trim();
  const pid = Number(raw);
  if (!Number.isFinite(pid) || pid <= 0) {
    console.log(`Invalid pid in ${path.basename(pidFile)}: "${raw}"`);
    process.exit(1);
  }

  if (process.platform === 'win32') {
    // /T: kill child processes too, /F: force
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'inherit' });
  } else {
    process.kill(pid, 'SIGKILL');
  }

  try {
    fs.unlinkSync(pidFile);
  } catch {
    // ignore
  }

  console.log(`Stopped server (pid ${pid}).`);
} catch (err) {
  console.error('Failed to stop server:', formatError(err));
  process.exit(1);
}

