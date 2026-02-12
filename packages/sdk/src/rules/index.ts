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
import { h1PresentRule, contentLengthRule } from "./content.js";

/**
 * All validation rules, ordered by weight (most impactful first).
 * Total weight: 100 points.
 *
 * Title:           5 + 8 = 13
 * Description:     5 + 8 = 13
 * OpenGraph:       8 + 4 + 4 = 16
 * Canonical:       10
 * Structured Data: 6 + 2 + 4 = 12
 * Content:         8 + 5 = 13
 * Robots:          5
 * Twitter:         4
 * Alternates:      4
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
  h1PresentRule,
  contentLengthRule,
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
  h1PresentRule,
  contentLengthRule,
  robotsRule,
  twitterCardRule,
  alternatesRule,
  viewportRule,
  faviconRule,
  imageAltTextRule,
};
