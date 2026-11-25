const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../app');

// Files that live in routes/ but are NOT Express routers — they export helpers,
// middleware, or are the index file itself.
const NON_ROUTER_FILES = new Set([
  'index.js',
  'sitemap.js', // exported inline, not via registerRoute
  'categories.js', // mounted directly in app.js
]);

describe('API route mounts', () => {
  it('serves the versioned CSRF token endpoint', async () => {
    const response = await request(app).get('/api/v1/csrf-token');

    expect(response.status).toBe(200);
    expect(response.body).not.toEqual({ success: true, data: [] });
  });

  it.each([
    ['get', '/api/v1/not-a-route'],
    ['delete', '/api/v1/not-a-route'],
    ['post', '/api/v1'],
  ])('does not route %s %s through reviews', async (method, url) => {
    const response = await request(app)[method](url);

    expect(response.status).toBe(404);
    expect(response.body).not.toEqual({ success: true, data: [] });
  });

  it('every route file in src/routes/ is required by the router', () => {
    const routesDir = path.join(__dirname, '..', 'routes');
    const indexPath = path.join(routesDir, 'index.js');
    const appPath = path.join(__dirname, '..', 'app.js');

    const routeFiles = fs
      .readdirSync(routesDir)
      .filter((f) => f.endsWith('.js') && !NON_ROUTER_FILES.has(f));

    const indexSource = fs.readFileSync(indexPath, 'utf8');
    const appSource = fs.readFileSync(appPath, 'utf8');

    const unmounted = routeFiles.filter((f) => {
      const stem = f.replace(/\.js$/, '');
      // Check whether either the index router or app.js require this file.
      return (
        !indexSource.includes(`'./${stem}'`) &&
        !indexSource.includes(`"./${stem}"`) &&
        !appSource.includes(`'./routes/${stem}'`) &&
        !appSource.includes(`"./routes/${stem}"`)
      );
    });

    expect(unmounted).toEqual([]);
    if (unmounted.length > 0) {
      throw new Error(
        `Route file(s) not mounted in routes/index.js or app.js: ${unmounted.join(', ')}`
      );
    }
  });
});
