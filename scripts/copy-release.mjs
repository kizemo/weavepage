// 构建后把安装包复制到项目根 release 目录
//
// channel 参数(argv[2],默认 "full"):
//   full   — 默认。复制 NSIS setup.exe + MSI(完整渠道,嵌 WebView2 离线包)
//   update — 只复制 NSIS setup.exe 并改名为 _update.exe(轻量渠道,升级用)
//
//   tauri build 跑两次,第二次传 --config tauri.conf.update.json 覆盖 webviewInstallMode;
//   Tauri v2 --config 是 partial merge,所以主 config 的 version/identifier 不动。
//
// 用法:
//   node scripts/copy-release.mjs full    # 默认
//   node scripts/copy-release.mjs update
import { cp, mkdir, rename, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const channel = process.argv[2] ?? "full";
if (channel !== "full" && channel !== "update") {
  console.error(`未知 channel: ${channel} (仅支持 full / update)`);
  process.exit(2);
}

const bundle = "src-tauri/target/release/bundle";
const dest = "release";

// 自动从主 config 读 productName + version —— 避免发版时漏改硬编码
const conf = JSON.parse(
  await readFile("src-tauri/tauri.conf.json", "utf8"),
);
const productName = conf.productName ?? "WeavePage";
const version = conf.version;

const nsisSrc = path.join(bundle, "nsis", `${productName}_${version}_x64-setup.exe`);
const msiSrc = path.join(bundle, "msi", `${productName}_${version}_x64_en-US.msi`);

await mkdir(dest, { recursive: true });

let failed = false;

if (channel === "full") {
  if (existsSync(nsisSrc)) {
    const dst = path.join(dest, `${productName}_${version}_x64-setup.exe`);
    await cp(nsisSrc, dst);
    console.log(`已复制 NSIS (full)   -> ${dst}`);
  } else {
    console.error("未找到 NSIS 安装包:", nsisSrc);
    failed = true;
  }

  if (existsSync(msiSrc)) {
    const dst = path.join(dest, `${productName}_${version}_x64_en-US.msi`);
    await cp(msiSrc, dst);
    console.log(`已复制 MSI (full)    -> ${dst}`);
  } else {
    console.error("未找到 MSI 安装包:", msiSrc);
    failed = true;
  }
} else if (channel === "update") {
  // update 渠道:NSIS 不再嵌 WebView2 离线包,体量从 ~209MB 降到 ~25MB
  // 复制一份 setup.exe 然后改名为 _update.exe(NSIS 升级链正常)
  // ⚠️ tmp 不能用 _x64-setup.exe 同名 — 那会把 release/ 里的 full 版覆盖掉
  const tmp = path.join(dest, `${productName}_${version}_x64-setup.exe.tmp`);
  const dst = path.join(dest, `${productName}_${version}_x64-update.exe`);
  if (existsSync(nsisSrc)) {
    await cp(nsisSrc, tmp);
    await rename(tmp, dst);
    console.log(`已复制 NSIS (update) -> ${dst}`);
  } else {
    console.error("未找到 NSIS 安装包:", nsisSrc);
    failed = true;
  }
  // update 渠道不发 MSI(轻量化优先,MSI 在国内极少用)
}

if (failed) process.exitCode = 1;