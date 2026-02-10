import type { RuleDefinition } from "../types.js";

import { titlePresentRule, titleLengthRule } from "./title.js";
import { descriptionPresentRule, descriptionLengthRule } from "./description.js";
import { ogImageRule, ogTitleRule, ogDescriptionRule } from "./open-graph.js";
import { canonicalRule } from "./canonical.js";
import { structuredDataPresentRule, structuredDataValidRule, structuredDataCompleteRule } from "./structured-data.js";
import {
  robotsRule,
  twitterCardRule,
  alternatesRule,
  viewportRule,
  faviconRule,
} from "./robots.js";
import { imageAltTextRule } from "./image-alt.js";

/**
 * All validation rules, ordered by weight (most impactful first).
 * Total weight: 100 points.
 *
 * Title:           5 + 10 = 15
 * Description:     5 + 10 = 15
 * OpenGraph:       10 + 5 + 5 = 20
 * Canonical:       10
 * Structured Data: 8 + 2 + 5 = 15
 * Robots:          5
 * Twitter:         5
 * Alternates:      5
 * Viewport:        3
 * Favicon:         2
 * Image Alt:       5
 * ---
 * Total:           100
 */
export const allRules: RuleDefinition[] = [
  titlePresentRule,
  titleLengthRule,
  descriptionPresentRule,
  descriptionLengthRule,
  ogImageRule,
  ogTitleRule,
  ogDescriptionRule,
  canonicalRule,
  structuredDataPresentRule,
  structuredDataValidRule,
  structuredDataCompleteRule,
  robotsRule,
  twitterCardRule,
  alternatesRule,
  viewportRule,
  faviconRule,
  imageAltTextRule,
];

export {
  titlePresentRule,
  titleLengthRule,
  descriptionPresentRule,
  descriptionLengthRule,
  ogImageRule,
  ogTitleRule,
  ogDescriptionRule,
  canonicalRule,
  structuredDataPresentRule,
  structuredDataValidRule,
  structuredDataCompleteRule,
  robotsRule,
  twitterCardRule,
  alternatesRule,
  viewportRule,
  faviconRule,
  imageAltTextRule,
};
