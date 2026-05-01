import { spawn } from 'node:child_process';
import { mkdtemp, rm, copyFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} → exit ${code}`))));
    child.on('error', rej);
  });
}

function runCapture(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => (code === 0 ? res({ out, err }) : rej(new Error(`${cmd} → exit ${code}\n${err}`))));
    child.on('error', rej);
  });
}

function step(label) {
  console.log(`\n━━━ ${label} ━━━`);
}

async function findTarball() {
  const entries = await readdir(projectRoot);
  const tgz = entries.find((f) => f.startsWith('near-sandbox-') && f.endsWith('.tgz'));
  if (!tgz) throw new Error('No tarball produced by npm pack');
  return join(projectRoot, tgz);
}

async function setupConsumer(format, tarballPath) {
  const dir = await mkdtemp(join(tmpdir(), `near-sandbox-${format}-`));
  const pkg = {
    name: `release-check-${format}`,
    version: '1.0.0',
    private: true,
    ...(format === 'esm' ? { type: 'module' } : {}),
  };
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  const fixtureFile = format === 'cjs' ? 'test.cjs' : 'test.mjs';
  await copyFile(join(__dirname, 'fixtures', format, fixtureFile), join(dir, fixtureFile));
  await run('npm', ['install', '--no-audit', '--no-fund', '--silent', tarballPath], { cwd: dir });
  return { dir, fixtureFile };
}

async function runConsumer({ dir, fixtureFile }, cacheDir) {
  const t0 = Date.now();
  await run('node', [fixtureFile], {
    cwd: dir,
    env: { ...process.env, DIR_TO_DOWNLOAD_BINARY: cacheDir },
  });
  return ((Date.now() - t0) / 1000).toFixed(1);
}

async function main() {
  const results = [];
  const cleanupDirs = [];
  let tarballPath = null;
  const t0 = Date.now();

  try {
    step('1/5  Build');
    await run('pnpm', ['build'], { cwd: projectRoot });

    step('2/5  publint');
    await run('pnpm', ['dlx', 'publint', projectRoot], { cwd: projectRoot });

    step('3/5  are-the-types-wrong');
    await run('pnpm', ['dlx', '@arethetypeswrong/cli@latest', '--pack', projectRoot], { cwd: projectRoot });

    step('4/5  npm pack');
    await runCapture('npm', ['pack', '--silent'], { cwd: projectRoot });
    tarballPath = await findTarball();
    console.log(`  → ${tarballPath}`);

    step('5/5  Consumer tests');
    const cacheDir = await mkdtemp(join(tmpdir(), 'near-sandbox-cache-'));
    cleanupDirs.push(cacheDir);

    for (const format of ['cjs', 'esm']) {
      console.log(`\n  · setup ${format} consumer`);
      const consumer = await setupConsumer(format, tarballPath);
      cleanupDirs.push(consumer.dir);

      console.log(`  · ${format}: fresh run (clean cache)`);
      await rm(cacheDir, { recursive: true, force: true });
      await mkdir(cacheDir, { recursive: true });
      const freshTime = await runConsumer(consumer, cacheDir);
      results.push({ step: `${format} fresh`, time: freshTime });

      console.log(`  · ${format}: cached run`);
      const cachedTime = await runConsumer(consumer, cacheDir);
      results.push({ step: `${format} cached`, time: cachedTime });
    }
  } finally {
    for (const d of cleanupDirs) await rm(d, { recursive: true, force: true }).catch(() => {});
    if (tarballPath) await rm(tarballPath, { force: true }).catch(() => {});
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n━━━ Summary ━━━');
  for (const r of results) console.log(`  ✓ ${r.step.padEnd(14)} ${r.time}s`);
  console.log(`  ─────────────────────`);
  console.log(`  total          ${total}s`);
}

main().catch((err) => {
  console.error(`\n✗ release-check FAILED: ${err.message}`);
  process.exit(1);
});
