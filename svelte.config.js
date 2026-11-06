import adapter from "@sveltejs/adapter-node";

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter(),
    csrf: {
      // Single-user tool on a LAN, reached by IP or .local name, so the
      // Origin check rejects legitimate form posts from the host's own name.
      checkOrigin: false
    }
  }
};
