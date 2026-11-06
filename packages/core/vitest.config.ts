import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        // material-color-utilities 0.4.0 ships ESM with extensionless imports that Node
        // can't resolve; let Vite transform it like it does in the site build.
        inline: ['@material/material-color-utilities'],
      },
    },
  },
});
