module.exports = {
  ci: {
    collect: {
      // Serve the production build the same way users hit it (respects Vite base path).
      startServerCommand: 'npx vite preview --host 127.0.0.1 --port 4176 --strictPort',
      startServerReadyPattern: 'Local:',
      url: [
        'http://127.0.0.1:4176/spine-scanner/',
        'http://127.0.0.1:4176/spine-scanner/privacy',
      ],
      isSinglePageApplication: true,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    // No score assertions: CI varies too much by machine; bundle budgets + a11y E2E cover quality.
  },
};
