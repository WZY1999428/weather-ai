/**
 * electron-builder afterPack 钩子。
 * 在非 Windows 主机上交叉打包 Windows 版本时，@electron/rebuild 无法交叉编译原生模块，
 * 这里下载 better-sqlite3 针对 win32-x64 + 当前 Electron 版本的官方预编译二进制并替换。
 * 在 Windows 主机上打包（推荐，见 .github/workflows/build-windows.yml）时不做任何事。
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ARCH = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64' }

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName
  if (platform !== 'win32' || process.platform === 'win32') return
  const arch = ARCH[context.arch] || 'x64'
  const electronVersion = context.packager.config.electronVersion || require('electron/package.json').version
  const target = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3')
  if (!fs.existsSync(target)) throw new Error(`better-sqlite3 not found in ${target}`)

  const pkg = require(path.join(context.packager.projectDir, 'node_modules', 'better-sqlite3', 'package.json'))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bsqlite-win-'))
  fs.cpSync(path.join(context.packager.projectDir, 'node_modules', 'better-sqlite3', 'package.json'), path.join(tmp, 'package.json'))
  const prebuild = require.resolve('prebuild-install/bin.js', { paths: [path.join(context.packager.projectDir, 'node_modules', 'better-sqlite3')] })
  console.log(`  • fetching better-sqlite3@${pkg.version} prebuilt  platform=${platform} arch=${arch} electron=${electronVersion}`)
  execFileSync(process.execPath, [prebuild, '--runtime', 'electron', '--target', electronVersion, '--platform', platform, '--arch', arch, '--verbose'], {
    cwd: tmp,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  const built = path.join(tmp, 'build', 'Release', 'better_sqlite3.node')
  const head = fs.readFileSync(built).subarray(0, 2).toString('latin1')
  if (head !== 'MZ') throw new Error('downloaded better_sqlite3.node is not a Windows PE binary')
  const dest = path.join(target, 'build', 'Release')
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  fs.copyFileSync(built, path.join(dest, 'better_sqlite3.node'))
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('  • replaced better_sqlite3.node with win32 prebuilt')
}
