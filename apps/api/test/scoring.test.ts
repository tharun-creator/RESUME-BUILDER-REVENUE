import { describe, it, expect } from 'vitest';
import { scoreResume } from '../src/scoring.js';

describe('scoreResume', () => {
  it('returns overall score as sum of sub-scores', () => {
    const r = scoreResume('John Doe\nemail@example.com\nSummary\nExperience\n- Built APIs\nEducation\nSkills: Node, SQL', 'Node SQL API');
    const sum = r.subScores.formatting + r.subScores.sections + r.subScores.keywords + r.subScores.bullets + r.subScores.lengthGrammar;
    expect(r.overallScore).toBe(sum);
  });

  it('penalizes missing sections', () => {
    const good = scoreResume('John Doe email@test.com\nSummary\nExperience\n- Built X\nEducation\nSkills Python', '');
    const bad = scoreResume('John Doe did some stuff', '');
    expect(good.subScores.sections).toBeGreaterThan(bad.subScores.sections);
  });
});
