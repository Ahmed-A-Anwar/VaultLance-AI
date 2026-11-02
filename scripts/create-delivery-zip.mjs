import fs from "fs";
import path from "path";
import AdmZip from "../backend/node_modules/adm-zip/adm-zip.js";

const zip = new AdmZip();
const rootDir = process.cwd();
const outputFile = path.join(rootDir, "VaultLance-AI-Steps-4-to-11-Delivery.zip");

console.log("[ZIP] Packaging VaultLance delivery...");

const addDirectoryRecursive = (dirPath, zipPrefix) => {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const entryZipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;

    // Skip node_modules, .git, and huge archive files
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "public.zip" ||
      entry.name === "VaultLance-AI-Steps-4-to-11-Delivery.zip"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      addDirectoryRecursive(fullPath, entryZipPath);
    } else {
      zip.addLocalFile(fullPath, zipPrefix);
    }
  }
};

// 1. Add all steps
addDirectoryRecursive(path.join(rootDir, "steps"), "steps");

// 2. Add backend source and configs
addDirectoryRecursive(path.join(rootDir, "backend", "src"), "backend/src");
addDirectoryRecursive(path.join(rootDir, "backend", "tests"), "backend/tests");
addDirectoryRecursive(path.join(rootDir, "backend", "prisma"), "backend/prisma");
if (fs.existsSync(path.join(rootDir, "backend", "package.json"))) {
  zip.addLocalFile(path.join(rootDir, "backend", "package.json"), "backend");
}
if (fs.existsSync(path.join(rootDir, "backend", "tsconfig.json"))) {
  zip.addLocalFile(path.join(rootDir, "backend", "tsconfig.json"), "backend");
}
if (fs.existsSync(path.join(rootDir, "backend", "vitest.config.ts"))) {
  zip.addLocalFile(path.join(rootDir, "backend", "vitest.config.ts"), "backend");
}

// 3. Add frontend source
addDirectoryRecursive(path.join(rootDir, "src"), "src");
addDirectoryRecursive(path.join(rootDir, "docs"), "docs");

// 4. Add root README and package.json
if (fs.existsSync(path.join(rootDir, "README.md"))) {
  zip.addLocalFile(path.join(rootDir, "README.md"), "");
}
if (fs.existsSync(path.join(rootDir, "package.json"))) {
  zip.addLocalFile(path.join(rootDir, "package.json"), "");
}

zip.writeZip(outputFile);

const stats = fs.statSync(outputFile);
console.log(`[ZIP] Successfully created: ${outputFile}`);
console.log(`[ZIP] Archive size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
