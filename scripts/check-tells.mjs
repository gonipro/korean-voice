#!/usr/bin/env node
// 사전 검사: 모든 항목이 칸을 다 채웠는지, 예문이 실제로 걸리는지, id가 겹치지 않는지 본다.
// 실행: node scripts/check-tells.mjs
import fs from "node:fs";
import { loadTells } from "./kv.mjs";
const d = JSON.parse(fs.readFileSync(new URL("../data/ai-tells.json", import.meta.url), "utf8"));
const tells = loadTells();
const bad = [], ids = new Set();
d.tells.forEach((t, i) => {
  const at = `${i + 1}번(${t.id || "id 없음"})`;
  ["id", "label", "kind", "example", "why"].forEach((k) => { if (!t[k]) bad.push(`${at}: '${k}' 칸이 비었어요`); });
  if (!(t.words || []).length && !t.regex) bad.push(`${at}: words나 regex 중 하나는 있어야 해요`);
  if (ids.has(t.id)) bad.push(`${at}: id가 겹쳐요`); ids.add(t.id);
  if (t.example && !tells[i].test(t.example)) bad.push(`${at}: 예문 "${t.example}"이 이 항목에 안 걸려요`);
});
if (bad.length) { console.error("고칠 곳\n- " + bad.join("\n- ")); process.exit(1); }
console.log(`사전 검사 통과: ${d.tells.length}개 항목`);
