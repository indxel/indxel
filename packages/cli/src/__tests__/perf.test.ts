import { describe, it, expect } from "vitest";
import { parsePsiResponse, checkBudgets } from "../commands/perf.js";

// --- Mock PSI response ---

function makePsiResponse(overrides?: {
  score?: number;
  lcp?: number;
  cls?: number;
  inp?: number;
  fcp?: number;
  si?: number;
  tbt?: number;
}) {
  const {
    score = 0.92,
    lcp = 1200,
    cls = 0.03,
    inp = 120,
    fcp = 800,
    si = 1400,
    tbt = 150,
  } = overrides ?? {};

  return {
    lighthouseResult: {
      categories: {
        performance: { score },
      },
      audits: {
        "largest-contentful-paint": { numericValue: lcp },
        "cumulative-layout-shift": { numericValue: cls },
        "interaction-to-next-paint": { numericValue: inp },
        "first-contentful-paint": { numericValue: fcp },
        "speed-index": { numericValue: si },
        "total-blocking-time": { numericValue: tbt },
      },
    },
  };
}

describe("parsePsiResponse", () => {
  it("extracts all metrics from a valid response", () => {
    const data = makePsiResponse();
    const metrics = parsePsiResponse(data);

    expect(metrics.performanceScore).toBe(92);
    expect(metrics.lcp).toBe(1200);
    expect(metrics.cls).toBe(0.03);
    expect(metrics.inp).toBe(120);
    expect(metrics.fcp).toBe(800);
    expect(metrics.si).toBe(1400);
    expect(metrics.tbt).toBe(150);
  });

  it("rounds performance score to nearest integer", () => {
    const data = makePsiResponse({ score: 0.876 });
    const metrics = parsePsiResponse(data);
    expect(metrics.performanceScore).toBe(88);
  });

  it("handles score of 1.0 (perfect)", () => {
    const data = makePsiResponse({ score: 1.0 });
    const metrics = parsePsiResponse(data);
    expect(metrics.performanceScore).toBe(100);
  });

  it("handles score of 0.0", () => {
    const data = makePsiResponse({ score: 0.0 });
    const metrics = parsePsiResponse(data);
    expect(metrics.performanceScore).toBe(0);
  });

  it("defaults missing audit values to 0", () => {
    const data = {
      lighthouseResult: {
        categories: { performance: { score: 0.5 } },
        audits: {},
      },
    };
    const metrics = parsePsiResponse(data);
    expect(metrics.lcp).toBe(0);
    expect(metrics.cls).toBe(0);
    expect(metrics.inp).toBe(0);
  });

  it("throws on missing lighthouseResult", () => {
    expect(() => parsePsiResponse({})).toThrow("No lighthouseResult");
  });

  it("throws on missing performance score", () => {
    expect(() =>
      parsePsiResponse({ lighthouseResult: { categories: {}, audits: {} } }),
    ).toThrow("No performance score");
  });
});

describe("checkBudgets", () => {
  const goodMetrics = {
    performanceScore: 92,
    lcp: 1200,
    cls: 0.03,
    inp: 120,
    fcp: 800,
    si: 1400,
    tbt: 150,
  };

  it("returns empty array when all budgets pass", () => {
    const failures = checkBudgets(goodMetrics, {
      score: 90,
      lcp: 2500,
      cls: 0.1,
    });
    expect(failures).toHaveLength(0);
  });

  it("returns empty array when no budgets are set", () => {
    const failures = checkBudgets(goodMetrics, {});
    expect(failures).toHaveLength(0);
  });

  it("detects score budget failure", () => {
    const failures = checkBudgets(goodMetrics, { score: 95 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("score 92");
    expect(failures[0]).toContain("budget 95");
  });

  it("detects LCP budget failure", () => {
    const metrics = { ...goodMetrics, lcp: 3000 };
    const failures = checkBudgets(metrics, { lcp: 2500 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("LCP");
  });

  it("detects CLS budget failure", () => {
    const metrics = { ...goodMetrics, cls: 0.15 };
    const failures = checkBudgets(metrics, { cls: 0.1 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("CLS");
  });

  it("detects multiple budget failures at once", () => {
    const poorMetrics = {
      ...goodMetrics,
      performanceScore: 40,
      lcp: 5000,
      cls: 0.3,
    };
    const failures = checkBudgets(poorMetrics, {
      score: 80,
      lcp: 2500,
      cls: 0.1,
    });
    expect(failures).toHaveLength(3);
  });

  it("passes when value exactly equals budget", () => {
    const metrics = { ...goodMetrics, lcp: 2500 };
    const failures = checkBudgets(metrics, { lcp: 2500 });
    expect(failures).toHaveLength(0);
  });
});
