import http from 'node:http';
import * as sandbox from 'near-sandbox';
import { Sandbox } from 'near-sandbox';

function ping(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode === 200) resolve();
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('RPC ping timeout')));
  });
}

async function main() {
  const expected = ['DEFAULT_ACCOUNT_ID', 'DEFAULT_BALANCE', 'DEFAULT_PRIVATE_KEY', 'DEFAULT_PUBLIC_KEY', 'GenesisAccount', 'Sandbox'];
  for (const key of expected) {
    if (!(key in sandbox)) throw new Error(`[esm] missing export: ${key}`);
  }

  console.log('  [esm] starting Sandbox.start({})');
  const s = await Sandbox.start({});
  try {
    console.log(`  [esm] running at ${s.rpcUrl}`);
    await ping(`${s.rpcUrl}/status`);
    console.log('  [esm] /status OK');
  } finally {
    await s.tearDown();
  }
  console.log('  [esm] tearDown OK');
}

main().catch((err) => {
  console.error('  [esm] FAILED:', err && err.stack || err);
  process.exit(1);
});
