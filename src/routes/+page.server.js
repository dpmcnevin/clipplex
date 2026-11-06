import { listClips } from "$lib/server/clips.js";
import { PLEX_USERNAME, hasPlex } from "$lib/server/config.js";

export async function load() {
  return {
    clips: await listClips(),
    hasPlex: hasPlex(),
    defaultUsername: PLEX_USERNAME
  };
}
