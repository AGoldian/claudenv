/**
 * Router for `claudenv hook <name>` — entry point for Claude Code hook scripts.
 *
 * Claude Code invokes registered hooks as shell commands with the hook event
 * (JSON) piped on stdin. The dispatcher reads stdin, routes to a handler, and
 * exits with 0 (allow) or 2 (block).
 *
 * Handlers MUST be fast (< 100ms for hot-path PostToolUse) and never throw
 * uncaught — a thrown handler will surface to the user as a noisy hook failure.
 */

import { readDecisionsLoggerInput, handleDecisionsLogger } from './decisions-logger.js';
import { handleRegenIndex } from './regen-index.js';

/**
 * Read stdin with a short idle timeout. Avoids hanging when the hook is invoked
 * without piped input (manual `claudenv hook regen-index` from a non-TTY shell —
 * background tasks, GH Actions, etc.).
 *
 * - TTY → return "" immediately (interactive call, no event expected)
 * - Otherwise wait up to `idleMs` for the first byte; once data starts arriving
 *   we drain to EOF normally.
 */
async function readStdin(idleMs = 200) {
  if (process.stdin.isTTY) return '';

  return await new Promise((resolve, reject) => {
    let data = '';
    let gotAnyData = false;
    const timer = setTimeout(() => {
      // No data appeared within idleMs and no EOF either — treat as no event.
      if (!gotAnyData) {
        process.stdin.removeAllListeners();
        resolve('');
      }
    }, idleMs);

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      gotAnyData = true;
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Dispatch a hook by name. Reads stdin, calls handler, prints any result, exits.
 *
 * @param {string} name - The hook name passed as `claudenv hook <name>`
 */
export async function dispatch(name) {
  const stdin = await readStdin();
  let event = null;
  if (stdin.trim()) {
    try {
      event = JSON.parse(stdin);
    } catch {
      // Non-JSON input — pass raw string to handlers that want it.
      event = { _raw: stdin };
    }
  }

  switch (name) {
    case 'decisions-logger': {
      const input = readDecisionsLoggerInput(event);
      const result = await handleDecisionsLogger(input);
      if (result?.message) process.stdout.write(result.message + '\n');
      process.exit(result?.exitCode ?? 0);
      break;
    }
    case 'regen-index': {
      const result = await handleRegenIndex({ event });
      if (result?.message) process.stdout.write(result.message + '\n');
      process.exit(result?.exitCode ?? 0);
      break;
    }
    default: {
      process.stderr.write(`Unknown hook: ${name}\n`);
      process.stderr.write('Available: decisions-logger, regen-index\n');
      process.exit(2);
    }
  }
}
