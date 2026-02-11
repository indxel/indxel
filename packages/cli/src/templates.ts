/** Generate the seo.config.ts template */
export function seoConfigTemplate(isTypeScript: boolean, siteUrl = "https://example.com"): string {
  if (isTypeScript) {
    return `import { defineSEO } from 'indxel'

export default defineSEO({
  siteName: 'My Site',
  siteUrl: '${siteUrl}',
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
  //   url: '${siteUrl}',
  // },
})
`;
  }

  return `const { defineSEO } = require('indxel')

module.exports = defineSEO({
  siteName: 'My Site',
  siteUrl: '${siteUrl}',
  titleTemplate: '%s | My Site',
  defaultDescription: 'A short description of your site for search engines.',
  defaultOGImage: '/og-image.png',
  locale: 'en_US',
})
`;
}

/** Generate the sitemap.ts template */
export function sitemapTemplate(isTypeScript: boolean, siteUrl = "https://example.com"): string {
  if (isTypeScript) {
    return `import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = '${siteUrl}'

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
  const baseUrl = '${siteUrl}'

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
export function robotsTemplate(isTypeScript: boolean, siteUrl = "https://example.com"): string {
  if (isTypeScript) {
    return `import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = '${siteUrl}'

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
  const baseUrl = '${siteUrl}'

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
