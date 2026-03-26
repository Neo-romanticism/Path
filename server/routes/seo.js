const express = require('express');
const router = express.Router();
const pool = require('../db');
const { escapeXml, getSiteBaseUrl } = require('../utils/textHelpers');

router.get('/robots.txt', (req, res) => {
  const baseUrl = getSiteBaseUrl(req);

  res
    .type('text/plain')
    .send(
      ['User-agent: *', 'Allow: /', 'Disallow: /api/', `Sitemap: ${baseUrl}/sitemap.xml`, ''].join(
        '\n',
      ),
    );
});

router.get('/sitemap.xml', async (req, res) => {
  const baseUrl = getSiteBaseUrl(req);
  const now = new Date().toISOString();

  let postRows = [];
  try {
    const posts = await pool.query(
      `SELECT id, created_at
                 FROM community_posts
                 ORDER BY created_at DESC
                 LIMIT 500`,
    );
    postRows = posts.rows;
  } catch (err) {
    console.error('[seo] sitemap community posts', err.message);
  }

  const postUrls = postRows
    .map(
      (row) => `
    <url>
        <loc>${escapeXml(`${baseUrl}/community/post/${row.id}`)}</loc>
        <lastmod>${escapeXml(new Date(row.created_at).toISOString())}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${baseUrl}/community/</loc>
        <lastmod>${now}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>${baseUrl}/login/</loc>
        <lastmod>${now}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>
    ${postUrls}
</urlset>`;

  res.type('application/xml').send(xml);
});

module.exports = router;
