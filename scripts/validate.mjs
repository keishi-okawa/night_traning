import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";

const root = process.cwd();
const read = (p) => readFile(path.join(root, p), "utf8");
const mustExist = async (p) => access(path.join(root, p));

const html = await read("index.html");
const manifest = JSON.parse(await read("manifest.webmanifest"));
const sw = await read("sw.js");
const scene = await read("assets/js/island-3d.js");
const threeModule = await read("assets/vendor/three.module.js");

if (!manifest.name || manifest.start_url !== "./") throw new Error("Invalid PWA manifest");
if (!scene.includes("../vendor/three.module.js")) throw new Error("Three.js must be loaded locally");
if (!threeModule.includes("./three.core.js")) throw new Error("Three.js core import missing");
if (!sw.includes("assets/vendor/three.module.js") || !sw.includes("assets/vendor/three.core.js")) throw new Error("Three.js files must be precached");
if (!html.includes("function renderRoadmap") || !html.includes("data-screen=\"roadmap\"")) throw new Error("Gantt planner screen/navigation missing");
if (!html.includes("function getMainQuestState") || !html.includes("beacon_reignition")) throw new Error("Main campaign objective missing");
if (!html.includes("data-island3d")) throw new Error("3D island host missing");

for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const attrs = script[1] || "";
  const body = script[2] || "";
  if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
  new vm.Script(body, { filename: "index.html:inline-script" });
}

await mustExist("assets/js/island-3d.js");
await mustExist("assets/vendor/three.module.js");
await mustExist("assets/vendor/three.core.js");
await mustExist("assets/vendor/THREE-LICENSE.txt");
await mustExist("docs/仕様変更書-004-リアルタイム3D.md");
await mustExist("docs/仕様変更書-005-メインクエスト.md");
await mustExist("docs/仕様変更書-006-自動学習計画.md");

console.log("Night Flow validation passed: inline JS, PWA manifest, 3D dependencies, campaign and Gantt planner.");
