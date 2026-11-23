#!/usr/bin/env node
// korean-voice · 한국어 문체 점수 · AI 티 지우개
// © 고니프로 (gonipro.app) · MIT License
//
// 사용법
//   node scripts/kv.mjs profile 내글1.txt 내글2.txt ... > my-voice.json   # 내 문체 기준 만들기 (5~10편 권장)
//   node scripts/kv.mjs score my-voice.json 새글.txt                       # 새 글 점수 + AI 티 문장 짚기
//   node scripts/kv.mjs score my-voice.json 새글.txt --json                # 결과를 JSON으로
//
// 재는 것 (첫 버전 4가지)
//   1) 종결 어미: ~다 / ~음·됨·임 / ~요 / ~습니다 / 반말(~어·~지) 비율
//   2) 문장 길이 리듬: 평균, 들쭉날쭉한 정도, 짧은 문장 비율
//   3) 권유형·AI 티 표현: "~해 보세요", "결론적으로", "다양한" 같은 말
//   4) 1인칭 체험: 나·내가·저는 같은 말이 얼마나 나오는지
// 외부 프로그램·인터넷 없이 돌아간다(노드만 있으면 됨). 글은 내 컴퓨터 밖으로 나가지 않는다.

import fs from "node:fs";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r1 = (x) => Math.round(x * 10) / 10;

export function toPlain(input) {
  return String(input)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[^\s#]+/g, " ")
    .replace(/[ \t​]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function sentences(text) {
  return toPlain(text)
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^가-힣a-zA-Z0-9]/g, "").length >= 3);
}

const tail = (s) => s.replace(/["'”’)\]\s]+$/, "").replace(/[.!?…~]+$/, "").replace(/[ㅋㅎㅠㅜ]+$/, "").trim();

const ENDINGS = {
  da: /(다|었다|았다|겠다|했다|이다|한다|된다|는다)$/,
  eum: /(음|됨|임|함|중|듯|쉬움|꼬임|알려드림|ㅁ)$/,
  yo: /(요|죠|네요|어요|아요|해요|예요|이에요|세요|드려요|거든요)$/,
  hapsyo: /(습니다|입니다|ㅂ니다|십시오|습니까|입니까)$/,
  banmal: /(어|아|지|야|네|래|게|자|냐|니|거든|잖아|더라|겠지)$/,
};
const jong = (ch) => { const c = (ch || "").charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? c % 28 : -1; };
export function endingOf(s) {
  const t = tail(s);
  const last = t.slice(-1);
  if (ENDINGS.hapsyo.test(t)) return "hapsyo";
  if (ENDINGS.yo.test(t)) return "yo";
  if (ENDINGS.da.test(t)) return "da";
  if (ENDINGS.eum.test(t) || jong(last) === 16) return "eum"; // 받침 ㅁ으로 끝나면(뜸·땡김·옴) 음슴체
  if (ENDINGS.banmal.test(t)) return "banmal";
  return "etc";
}
export const ENDING_NAME = { da: "~다", eum: "~음·됨·임", yo: "~요", hapsyo: "~습니다", banmal: "반말(~어·~지)", etc: "그 밖" };

// AI 티 표현은 data/ai-tells.json 에서 읽는다(누구나 보탤 수 있게 코드 밖에 둠).
const squash = (x) => String(x).replace(/\s+/g, "");
export function loadTells(file = new URL("../data/ai-tells.json", import.meta.url)) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  return d.tells.map((t) => {
    const words = (t.words || []).map(squash).filter(Boolean);
    const re = t.regex ? new RegExp(t.regex) : null;
    return { id: t.id, label: t.label, test: (s) => (re && re.test(s.trim())) || words.some((w) => squash(s).includes(w)) };
  });
}
export const AI_TELLS = loadTells();
const FIRST_PERSON = /(?:^|[^가-힣])(나는|내가|난 |나도|나를|내 |저는|제가|저도|저를|제 |우리는|우리가)/;

export function measure(texts) {
  const all = [].concat(texts).flatMap(sentences);
  const n = all.length;
  if (!n) return null;
  const L = all.map((s) => s.length);
  const avg = L.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(L.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
  const end = { da: 0, eum: 0, yo: 0, hapsyo: 0, banmal: 0, etc: 0 };
  all.forEach((s) => end[endingOf(s)]++);
  Object.keys(end).forEach((k) => (end[k] = end[k] / n));
  const tells = all.filter((s) => AI_TELLS.some((t) => t.test(s))).length / n;
  const first = all.filter((s) => FIRST_PERSON.test(" " + s)).length / n;
  const short = L.filter((x) => x <= 20).length / n;
  return { sentences: n, avgLen: r1(avg), sdLen: r1(sd), shortRatio: Math.round(short * 100) / 100, endings: Object.fromEntries(Object.entries(end).map(([k, v]) => [k, Math.round(v * 100) / 100])), firstPerson: Math.round(first * 100) / 100, aiTellRate: Math.round(tells * 100) / 100 };
}

export function buildProfile(texts) {
  const m = measure(texts);
  if (!m) throw new Error("글이 너무 짧아요. 글 5편 이상을 넣어 주세요.");
  return { tool: "korean-voice", version: 1, made: new Date().toISOString().slice(0, 10), samples: [].concat(texts).length, ...m };
}

export function score(profile, text) {
  const m = measure(text);
  if (!m || m.sentences < 3) throw new Error("채점할 글이 너무 짧아요. 세 문장 이상 넣어 주세요.");
  // 1) 종결 어미가 얼마나 비슷한가 (0~1)
  const keys = Object.keys(profile.endings);
  const l1 = keys.reduce((a, k) => a + Math.abs((profile.endings[k] || 0) - (m.endings[k] || 0)), 0) / 2;
  const sEnd = 1 - clamp(l1, 0, 1);
  // 2) 문장 길이 리듬
  const sLen = 1 - clamp(Math.abs(m.avgLen - profile.avgLen) / Math.max(profile.avgLen, 10), 0, 1);
  const sSd = 1 - clamp(Math.abs(m.sdLen - profile.sdLen) / Math.max(profile.sdLen, 6), 0, 1);
  const sShort = 1 - clamp(Math.abs(m.shortRatio - profile.shortRatio) / 0.5, 0, 1);
  const sRhythm = (sLen + sSd + sShort) / 3;
  // 3) AI 티 (내 평소보다 많으면 감점)
  const extra = Math.max(0, m.aiTellRate - profile.aiTellRate);
  const sTell = 1 - clamp(extra / 0.3, 0, 1);
  // 4) 1인칭 체험
  const sFirst = 1 - clamp(Math.abs(m.firstPerson - profile.firstPerson) / 0.4, 0, 1);
  const voice = Math.round(100 * (0.35 * sEnd + 0.25 * sRhythm + 0.25 * sTell + 0.15 * sFirst));

  // AI 티 점수: 표현이 몰렸는지 + 문장 길이가 너무 고른지
  const uniform = clamp(1 - m.sdLen / Math.max(m.avgLen * 0.45, 4), 0, 1);
  const aiTell = Math.round(100 * clamp(0.75 * clamp(m.aiTellRate / 0.35, 0, 1) + 0.25 * uniform, 0, 1));

  // 고칠 문장 짚기
  const sents = sentences(text);
  const mainEnd = keys.filter((k) => k !== "etc").reduce((a, k) => ((profile.endings[k] || 0) > (profile.endings[a] || 0) ? k : a), "da");
  const flags = [];
  sents.forEach((s, i) => {
    const why = [];
    AI_TELLS.forEach((t) => { if (t.test(s)) why.push(t.label); });
    const e = endingOf(s);
    if ((profile.endings[e] || 0) < 0.08 && e !== "etc") why.push(`평소에 거의 안 쓰는 끝맺음(${ENDING_NAME[e]}, 평소엔 ${ENDING_NAME[mainEnd]})`);
    if (s.length > Math.max(profile.avgLen + 2.2 * profile.sdLen, 70)) why.push(`평소보다 많이 긴 문장(${s.length}자)`);
    if (why.length) flags.push({ n: i + 1, sentence: s, why });
  });
  return {
    voiceScore: voice, aiTellScore: aiTell,
    parts: { endings: Math.round(sEnd * 100), rhythm: Math.round(sRhythm * 100), aiTell: Math.round(sTell * 100), firstPerson: Math.round(sFirst * 100) },
    draft: m, flags,
  };
}

function report(res, profile) {
  const bar = (x) => "■".repeat(Math.round(x / 10)) + "□".repeat(10 - Math.round(x / 10));
  const L = [];
  L.push(`나다움 ${res.voiceScore}점  ${bar(res.voiceScore)}`);
  L.push(`AI 티 ${res.aiTellScore}점  ${bar(res.aiTellScore)}  (낮을수록 사람 같음)`);
  L.push("");
  L.push(`· 끝맺음 닮은 정도 ${res.parts.endings} · 문장 리듬 ${res.parts.rhythm} · AI 표현 ${res.parts.aiTell} · 1인칭 ${res.parts.firstPerson}`);
  L.push(`· 이 글: 평균 ${res.draft.avgLen}자 (평소 ${profile.avgLen}자), 짧은 문장 ${Math.round(res.draft.shortRatio * 100)}% (평소 ${Math.round(profile.shortRatio * 100)}%)`);
  if (res.flags.length) {
    L.push("", "고쳐 보면 좋은 문장");
    res.flags.slice(0, 12).forEach((f) => L.push(`  ${f.n}. ${f.sentence}\n     → ${f.why.join(" · ")}`));
  } else L.push("", "짚을 문장이 없어요. 평소 내 글과 잘 맞아요.");
  L.push("", "korean-voice · 고니프로 gonipro.app");
  return L.join("\n");
}

const isMain = import.meta.url === `file://${process.argv[1]}` || (process.argv[1] || "").endsWith("kv.mjs");
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const read = (p) => fs.readFileSync(p, "utf8");
  try {
    if (cmd === "profile") {
      const files = rest.filter((x) => !x.startsWith("--"));
      if (files.length < 1) throw new Error("사용법: node scripts/kv.mjs profile 내글1.txt 내글2.txt ... > my-voice.json");
      if (files.length < 5) console.error(`참고: 글이 ${files.length}편이에요. 5~10편이면 더 정확해요.`);
      process.stdout.write(JSON.stringify(buildProfile(files.map(read)), null, 2) + "\n");
    } else if (cmd === "score") {
      const [pf, df] = rest.filter((x) => !x.startsWith("--"));
      if (!pf || !df) throw new Error("사용법: node scripts/kv.mjs score my-voice.json 새글.txt");
      const profile = JSON.parse(read(pf));
      const res = score(profile, read(df));
      process.stdout.write((rest.includes("--json") ? JSON.stringify(res, null, 2) : report(res, profile)) + "\n");
    } else {
      console.log("korean-voice · 한국어 문체 점수 · AI 티 지우개\n\n  node scripts/kv.mjs profile 내글들.txt > my-voice.json\n  node scripts/kv.mjs score my-voice.json 새글.txt");
    }
  } catch (e) { console.error("⚠ " + e.message); process.exit(1); }
}
