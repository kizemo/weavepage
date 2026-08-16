// 构建后把安装包复制到项目根 release 目录
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const bundle = "src-tauri/target/release/bundle";
const dest = "release";
const nsis = path.join(bundle, "nsis", "WeavePage_0.1.2_x64-setup.exe");
const msi = path.join(bundle, "msi", "WeavePage_0.1.2_x64_en-US.msi");

await mkdir(dest, { recursive: true });

if (existsSync(nsis)) {
  await cp(nsis, path.join(dest, "WeavePage_0.1.2_x64-setup.exe"));
  console.log(`已复制 NSIS 安装包 -> ${dest}/WeavePage_0.1.2_x64-setup.exe`);
} else {
  console.error("未找到 NSIS 安装包:", nsis);
  process.exitCode = 1;
}

if (existsSync(msi)) {
  await cp(msi, path.join(dest, "WeavePage_0.1.2_x64_en-US.msi"));
  console.log(`已复制 MSI 安装包 -> ${dest}/WeavePage_0.1.2_x64_en-US.msi`);
} else {
  console.error("未找到 MSI 安装包:", msi);
  process.exitCode = 1;
}
