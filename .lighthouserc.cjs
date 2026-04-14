module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      isSinglePageApplication: true,
      url: [
        'http://localhost/spine-scanner/',
        'http://localhost/spine-scanner/privacy',
      ],
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.45 }],
        'categories:accessibility': ['error', { minScore: 0.88 }],
        'categories:best-practices': ['error', { minScore: 0.82 }],
        'categories:seo': ['error', { minScore: 0.85 }],
      },
    },
  },
};
