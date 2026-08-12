import { spawn } from "node:child_process";

export async function terminateProcessTree(child, {
  platform = process.platform,
  spawnProcess = spawn,
  signal = "SIGTERM",
} = {}) {
  if (!child || child.exitCode !== null) return { terminated: false, method: "already-exited" };

  if (platform !== "win32" || !Number.isInteger(child.pid)) {
    const terminated = child.kill(signal);
    return { terminated, method: "signal" };
  }

  return new Promise((resolveTermination) => {
    const terminator = spawnProcess("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      shell: false,
      stdio: "ignore",
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveTermination(result);
    };
    terminator.once("error", () => {
      let terminated = false;
      try { terminated = child.kill(signal); } catch { /* The process may have exited during taskkill startup. */ }
      finish({ terminated, method: "signal-fallback" });
    });
    terminator.once("close", (code) => finish({ terminated: code === 0, method: "windows-tree", exitCode: code }));
  });
}
