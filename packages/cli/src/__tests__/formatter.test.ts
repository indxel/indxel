import { describe, it, expect } from "vitest";
import { computeSummary, formatJSON, type CheckResult } from "../formatter.js";
import type { ResolvedMetadata } from "indxel";

function makeResult(
  route: string,
  score: number,
  errorCount: number,
): CheckResult {
  return {
    page: {
      filePath: `src/app${route === "/" ? "" : route}/page.tsx`,
      route,
      hasMetadata: true,
      hasDynamicMetadata: false,
      extractedMetadata: {} as ResolvedMetadata,
    },
    validation: {
      score,
      grade: score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F",
      passed: [],
      warnings: [],
      errors: Array.from({ length: errorCount }, (_, i) => ({
        id: `error-${i}`,
        name: `Error ${i}`,
        description: "Test error",
        weight: 5,
        severity: "critical" as const,
        status: "error" as const,
        message: `Test error ${i}`,
      })),
    },
  };
}

describe("computeSummary", () => {
  it("computes summary for all-passing results", () => {
    const results = [
      makeResult("/", 95, 0),
      makeResult("/blog", 90, 0),
      makeResult("/about", 88, 0),
    ];

    const summary = computeSummary(results);

    expect(summary.totalPages).toBe(3);
    expect(summary.passedPages).toBe(3);
    expect(summary.averageScore).toBe(91);
    expect(summary.grade).toBe("A");
    expect(summary.criticalErrors).toBe(0);
  });

  it("computes summary with errors", () => {
    const results = [
      makeResult("/", 50, 3),
      makeResult("/blog", 70, 1),
    ];

    const summary = computeSummary(results);

    expect(summary.totalPages).toBe(2);
    expect(summary.passedPages).toBe(0);
    expect(summary.averageScore).toBe(60);
    expect(summary.grade).toBe("D");
    expect(summary.criticalErrors).toBe(4);
  });

  it("handles empty results", () => {
    const summary = computeSummary([]);

    expect(summary.totalPages).toBe(0);
    expect(summary.passedPages).toBe(0);
    expect(summary.averageScore).toBe(0);
    expect(summary.grade).toBe("F");
  });
});

describe("formatJSON", () => {
  it("returns valid JSON with required fields", () => {
    const results = [makeResult("/", 85, 1)];
    const summary = computeSummary(results);
    const json = formatJSON(summary);

    const parsed = JSON.parse(json);

    expect(parsed.score).toBe(85);
    expect(parsed.grade).toBe("B");
    expect(parsed.totalPages).toBe(1);
    expect(parsed.pages).toHaveLength(1);
    expect(parsed.pages[0].route).toBe("/");
    expect(parsed.pages[0].errors).toHaveLength(1);
  });
});
