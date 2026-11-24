import type { Report, SubScores } from '@repo/shared';

const SECTION_PATTERNS: Record<string, RegExp> = {
  contact: /email|phone|linkedin|github|@/i,
  summary: /summary|objective|profile/i,
  experience: /experience|employment|work history|internship/i,
  education: /education|university|college|b\.?tech|bachelor|master/i,
  skills: /skills|technologies|tools/i,
};

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

export function scoreResume(text: string, jobDescription?: string): Report {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const bullets = (text.match(/(^|\n)\s*[•\-\*\u2022]/g) || []).length;
  const hasTablesLikely = /\|{2,}|\t{2,}/.test(text) || /table/i.test(text);
  const hasLongLines = text.split(/\n/).some(l => l.length > 140);

  // Formatting (25) - rules
  let formatting = 25;
  if (hasTablesLikely) formatting -= 8;
  if (hasLongLines) formatting -= 4;
  if (words.length < 120) formatting -= 6;
  if (!/\b[A-Z][a-z]+ [A-Z][a-z]+/.test(text)) formatting -= 2;
  formatting = clamp(formatting, 0, 25);

  // Sections (15) - rules
  const found = Object.entries(SECTION_PATTERNS).filter(([, re]) => re.test(lower)).map(([k]) => k);
  const missingSections = Object.keys(SECTION_PATTERNS).filter(k => !found.includes(k));
  const sections = clamp(Math.round((found.length / 5) * 15), 0, 15);

  // Length & grammar (15) - simple rules
  let lengthGrammar = 15;
  if (words.length < 200) lengthGrammar -= 5;
  if (words.length > 1200) lengthGrammar -= 4;
  const repeatedSpaces = (text.match(/[ ]{3,}/g) || []).length;
  if (repeatedSpaces > 3) lengthGrammar -= 2;
  const allCapsLines = text.split(/\n/).filter(l => l.trim().length > 12 && l === l.toUpperCase()).length;
  if (allCapsLines > 6) lengthGrammar -= 2;
  lengthGrammar = clamp(lengthGrammar, 0, 15);

  // Keywords (25) - heuristic (AI-assisted in prod)
  const jdWords = (jobDescription || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length > 3);
  const jdUnique = [...new Set(jdWords)].slice(0, 40);
  const matched = jdUnique.filter(w => lower.includes(w));
  const keywordGaps = jdUnique.filter(w => !lower.includes(w)).slice(0, 10);
  let keywords = jdUnique.length ? clamp(Math.round((matched.length / jdUnique.length) * 25), 0, 25) : 16;
  if (!jdUnique.length) {
    // no JD: baseline by presence of common skill tokens
    const common = ['python','java','sql','react','node','api','testing','git','aws','docker'];
    const hits = common.filter(k => lower.includes(k)).length;
    keywords = clamp(10 + hits, 0, 25);
  }

  // Bullets (20) - heuristic
  let bulletsScore = 10;
  const actionVerbs = ['built','led','designed','improved','reduced','increased','created','implemented','automated','managed','delivered'];
  const verbHits = actionVerbs.filter(v => lower.includes(v)).length;
  bulletsScore += Math.min(6, verbHits);
  const metricHits = (text.match(/\b\d+%|\b\d+\+|\$\d+|\b\d{2,}\b/g) || []).length;
  bulletsScore += Math.min(4, Math.floor(metricHits / 2));
  if (bullets === 0) bulletsScore -= 4;
  bulletsScore = clamp(bulletsScore, 0, 20);

  const subScores: SubScores = { formatting, sections, keywords, bullets: bulletsScore, lengthGrammar };
  const overallScore = formatting + sections + keywords + bulletsScore + lengthGrammar;

  const topFixes = [
    missingSections.length ? { title: `Add missing sections: ${missingSections.join(', ')}`, detail: 'ATS parsers look for standard section headings.', impact: 'high' as const } : null,
    hasTablesLikely ? { title: 'Avoid tables/columns', detail: 'Use a single-column layout so ATS can parse text reliably.', impact: 'high' as const } : null,
    bullets === 0 ? { title: 'Use bullet points for impact', detail: 'Break experience into bullets starting with action verbs and metrics.', impact: 'high' as const } : null,
    keywordGaps.length ? { title: 'Add relevant keywords', detail: `Missing JD keywords: ${keywordGaps.slice(0,5).join(', ')}`, impact: 'medium' as const } : null,
    words.length < 200 ? { title: 'Add more detail', detail: 'Your resume looks thin; add quantified achievements and relevant skills.', impact: 'medium' as const } : null,
  ].filter(Boolean).slice(0, 5) as Report['topFixes'];

  const bulletRewrites = [
    { before: 'Worked on backend APIs for the product.', after: 'Built and shipped 6 REST APIs in Node.js, reducing average response time by 28%.' },
    { before: 'Responsible for testing.', after: 'Implemented automated test suite covering 40+ critical flows, cutting regression bugs by 35%.' },
  ].slice(0, 5);

  return {
    overallScore,
    subScores,
    topFixes,
    keywordGaps: keywordGaps.slice(0, 10),
    bulletRewrites,
    summary: overallScore >= 75 ? 'Strong ATS foundation with a few targeted improvements.' : overallScore >= 55 ? 'Decent base, but key ATS gaps are likely reducing shortlist chances.' : 'Significant ATS issues detected; prioritize structure, keywords, and measurable bullets.',
  };
}