import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createLocalServer } from '../server.mjs';

const directory = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const port = Number(process.env.FOCUCITY_PORT || 5175);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('本地端口必须是 1024–65535 之间的整数。');
  process.exit(1);
}
const url = `http://127.0.0.1:${port}/`;

function runningTown() {
  return new Promise(resolve => {
    const req = http.get(`${url}__focucity_local`, { timeout: 1500 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 8192) req.destroy(); });
      res.on('error', () => resolve(false));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(res.statusCode === 200 && data.app === 'FocuCity' && path.resolve(data.directory) === directory);
        } catch { resolve(false); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function openBrowser() {
  if (process.argv.includes('--no-open')) return;
  const child = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
  const fallback = () => console.log(`未能自动打开浏览器，请手动访问：${url}`);
  child.once('error', fallback);
  child.once('exit', code => { if (code) fallback(); });
}

const server = createLocalServer();
server.once('error', async error => {
  if (error.code === 'EADDRINUSE' && await runningTown()) {
    console.log(`FocuCity 已经在运行，正在打开：${url}`);
    openBrowser();
    return;
  }
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 被其他服务占用。请先关闭占用它的服务，再双击启动。\n为避免切换地址后读不到原存档，启动器不会自动改用其他端口。`
    : `无法启动本地服务：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\nFocuCity 已打开：${url}\n\n保持此终端窗口打开即可使用；按 Control + C 停止服务。\n下次双击同一个启动文件，就能继续此浏览器里的进度。\n`);
  openBrowser();
});
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  console.log('\nFocuCity 本地服务已停止，浏览器中已保存的进度仍会保留。');
  server.close(() => process.exit(0));
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(0), 1500).unref();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
process.once('SIGHUP', stop);
