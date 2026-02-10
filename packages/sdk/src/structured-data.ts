import type { StructuredDataType } from "./types.js";

/**
 * Generate a JSON-LD structured data object.
 * Returns a plain object ready to be serialized in a <script type="application/ld+json"> tag.
 *
 * @example
 * ```ts
 * import { generateLD } from 'indxel'
 *
 * const articleLD = generateLD('Article', {
 *   headline: 'My Blog Post',
 *   datePublished: '2026-01-15',
 *   author: { name: 'John Doe' },
 * })
 *
 * // In your component:
 * <script
 *   type="application/ld+json"
 *   dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLD) }}
 * />
 * ```
 */
export function generateLD(
  type: StructuredDataType,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const generator = generators[type];
  if (!generator) {
    throw new Error(`indxel: unsupported structured data type "${type}"`);
  }
  return generator(data);
}

// --------------------------------------------------------------------------
// Type-specific generators
// --------------------------------------------------------------------------

type LDGenerator = (data: Record<string, unknown>) => Record<string, unknown>;

const generators: Record<StructuredDataType, LDGenerator> = {
  Article: (data) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.headline ?? data.title,
    description: data.description,
    image: data.image,
    datePublished: data.datePublished ?? data.publishedTime,
    dateModified: data.dateModified ?? data.modifiedTime ?? data.datePublished,
    author: normalizeAuthor(data.author),
    publisher: data.publisher ? normalizeOrganization(data.publisher) : undefined,
    mainEntityOfPage: data.url ? { "@type": "WebPage", "@id": data.url } : undefined,
    ...(data.section ? { articleSection: data.section } : {}),
    ...(data.tags ? { keywords: data.tags } : {}),
  }),

  Product: (data) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: data.name,
    description: data.description,
    image: data.image,
    brand: data.brand
      ? { "@type": "Brand", name: data.brand }
      : undefined,
    offers: data.price
      ? {
          "@type": "Offer",
          price: data.price,
          priceCurrency: data.currency ?? "EUR",
          availability: data.availability ?? "https://schema.org/InStock",
          url: data.url,
        }
      : data.offers,
    aggregateRating: data.rating
      ? {
          "@type": "AggregateRating",
          ratingValue: (data.rating as Record<string, unknown>).value,
          reviewCount: (data.rating as Record<string, unknown>).count,
        }
      : undefined,
  }),

  FAQ: (data) => {
    const items = data.questions ?? data.items;
    if (!Array.isArray(items)) {
      throw new Error("indxel: FAQ structured data requires a 'questions' array");
    }
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((item: Record<string, unknown>) => ({
        "@type": "Question",
        name: item.question ?? item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer ?? item.a,
        },
      })),
    };
  },

  HowTo: (data) => {
    const steps = data.steps;
    if (!Array.isArray(steps)) {
      throw new Error("indxel: HowTo structured data requires a 'steps' array");
    }
    return {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: data.name ?? data.title,
      description: data.description,
      image: data.image,
      totalTime: data.totalTime,
      step: steps.map((step: Record<string, unknown>, i: number) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: step.name ?? step.title,
        text: step.text ?? step.description,
        image: step.image,
        url: step.url,
      })),
    };
  },

  Breadcrumb: (data) => {
    const items = data.items;
    if (!Array.isArray(items)) {
      throw new Error("indxel: Breadcrumb structured data requires an 'items' array");
    }
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item: Record<string, unknown>, i: number) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name ?? item.title,
        item: item.url ?? item.href,
      })),
    };
  },

  Organization: (data) => ({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: data.name,
    url: data.url,
    logo: data.logo
      ? {
          "@type": "ImageObject",
          url: data.logo,
        }
      : undefined,
    description: data.description,
    sameAs: data.sameAs,
    contactPoint: data.contactPoint,
    ...(data.knowsAbout ? { knowsAbout: data.knowsAbout } : {}),
  }),

  WebPage: (data) => ({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: data.name ?? data.title,
    description: data.description,
    url: data.url,
    isPartOf: data.isPartOf
      ? { "@type": "WebSite", name: data.isPartOf }
      : undefined,
    breadcrumb: data.breadcrumb,
    mainEntity: data.mainEntity,
  }),

  SoftwareApplication: (data) => ({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: data.name,
    description: data.description,
    url: data.url,
    applicationCategory: data.category ?? "DeveloperApplication",
    operatingSystem: data.operatingSystem ?? "All",
    offers: data.price
      ? {
          "@type": "Offer",
          price: data.price,
          priceCurrency: data.currency ?? "EUR",
        }
      : data.offers,
    aggregateRating: data.rating
      ? {
          "@type": "AggregateRating",
          ratingValue: (data.rating as Record<string, unknown>).value,
          reviewCount: (data.rating as Record<string, unknown>).count,
        }
      : undefined,
  }),

  WebSite: (data) => ({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: data.name,
    url: data.url,
    description: data.description,
    potentialAction: data.searchUrl
      ? {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: data.searchUrl,
          },
          "query-input": "required name=search_term_string",
        }
      : undefined,
  }),
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function normalizeAuthor(
  author: unknown,
): Record<string, unknown> | undefined {
  if (!author) return undefined;
  if (typeof author === "string") {
    return { "@type": "Person", name: author };
  }
  if (typeof author === "object" && author !== null) {
    const a = author as Record<string, unknown>;
    return {
      "@type": a.type ?? "Person",
      name: a.name,
      url: a.url,
    };
  }
  return undefined;
}

function normalizeOrganization(
  org: unknown,
): Record<string, unknown> | undefined {
  if (!org) return undefined;
  if (typeof org === "string") {
    return { "@type": "Organization", name: org };
  }
  if (typeof org === "object" && org !== null) {
    const o = org as Record<string, unknown>;
    return {
      "@type": "Organization",
      name: o.name,
      url: o.url,
      logo: o.logo ? { "@type": "ImageObject", url: o.logo } : undefined,
    };
  }
  return undefined;
}
