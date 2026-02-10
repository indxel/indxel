/** Generate the seo.config.ts template */
export function seoConfigTemplate(isTypeScript: boolean): string {
  if (isTypeScript) {
    return `import { defineSEO } from 'indxel'

export default defineSEO({
  siteName: 'My Site',
  siteUrl: 'https://example.com',
  titleTemplate: '%s | My Site',
  defaultDescription: 'A short description of your site for search engines.',
  defaultOGImage: '/og-image.png',
  locale: 'en_US',
  // twitter: {
  //   handle: '@yourhandle',
  //   cardType: 'summary_large_image',
  // },
  // organization: {
  //   name: 'My Company',
  //   logo: '/logo.png',
  //   url: 'https://example.com',
  // },
})
`;
  }

  return `const { defineSEO } = require('indxel')

module.exports = defineSEO({
  siteName: 'My Site',
  siteUrl: 'https://example.com',
  titleTemplate: '%s | My Site',
  defaultDescription: 'A short description of your site for search engines.',
  defaultOGImage: '/og-image.png',
  locale: 'en_US',
})
`;
}

/** Generate the sitemap.ts template */
export function sitemapTemplate(isTypeScript: boolean): string {
  if (isTypeScript) {
    return `import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://example.com'

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    // Add more pages here or generate dynamically:
    //
    // const posts = await getPosts()
    // return posts.map(post => ({
    //   url: \`\${baseUrl}/blog/\${post.slug}\`,
    //   lastModified: post.updatedAt,
    //   changeFrequency: 'monthly',
    //   priority: 0.7,
    // }))
  ]
}
`;
  }

  return `/** @returns {import('next').MetadataRoute.Sitemap} */
export default function sitemap() {
  const baseUrl = 'https://example.com'

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
`;
}

/** Generate the robots.ts template */
export function robotsTemplate(isTypeScript: boolean): string {
  if (isTypeScript) {
    return `import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://example.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/private/'],
      },
    ],
    sitemap: \`\${baseUrl}/sitemap.xml\`,
  }
}
`;
  }

  return `/** @returns {import('next').MetadataRoute.Robots} */
export default function robots() {
  const baseUrl = 'https://example.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/private/'],
      },
    ],
    sitemap: \`\${baseUrl}/sitemap.xml\`,
  }
}
`;
}
