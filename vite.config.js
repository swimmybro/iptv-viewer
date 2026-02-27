import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // This exposes the server to your local network
    allowedHosts: true, // This tells Vite to stop complaining about hostnames entirely
  },
});
