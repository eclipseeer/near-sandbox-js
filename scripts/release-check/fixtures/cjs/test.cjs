const http = require('node:http');
const sandbox = require('near-sandbox');

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
  const expected = [
    'DEFAULT_ACCOUNT_ID',
    'DEFAULT_BALANCE',
    'DEFAULT_PRIVATE_KEY',
    'DEFAULT_PUBLIC_KEY',
    'GenesisAccount',
    'Sandbox',
  ];
  for (const key of expected) {
    if (!(key in sandbox)) throw new Error(`[cjs] missing export: ${key}`);
  }

  console.log('  [cjs] starting Sandbox.start({})');
  const s = await sandbox.Sandbox.start({});
  try {
    console.log(`  [cjs] running at ${s.rpcUrl}`);
    await ping(`${s.rpcUrl}/status`);
    console.log('  [cjs] /status OK');
  } finally {
    await s.tearDown();
  }
  console.log('  [cjs] tearDown OK');
}

main().catch((err) => {
  console.error('  [cjs] FAILED:', (err && err.stack) || err);
  process.exit(1);
});
