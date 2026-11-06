# Clipplex

Pull a clip out of your media and share it, without hunting for the file
yourself. Point Clipplex at what you're watching in Plex, search your Plex
library, or just browse the files on disk — then pick a range and cut it.

A SvelteKit application. Originally a Flask app by
[jo-nike/clipplex](https://github.com/jo-nike/clipplex); this fork has since
been rewritten.

## How it works

Clipplex shells out to ffmpeg, and for anything that comes from Plex it uses
the paths **Plex reports**. So the one hard requirement is:

> The container must see your media at the same paths your Plex server does.

If Plex has `/data/movies`, Clipplex needs `/data/movies`. Pointing it at the
same files under a different path will not work. Search results say
"not reachable" when Plex knows a file Clipplex can't open, which is almost
always a mount mismatch.

Browsing files has no such constraint — it only ever offers what is under
`MEDIA_ROOTS`.

## Configuration

| Variable              | Required | Notes                                                              |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `MEDIA_ROOTS`         | no       | Colon-separated directories to browse. Default `/data`              |
| `CLIPS_DIR`           | no       | Where clips and snapshots are written. Default `/clips`             |
| `PLEX_URL`            | no       | e.g. `http://plex:32400`. Without it, only the file browser appears |
| `PLEX_TOKEN`          | no       | [Finding your token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) |
| `PLEX_USERNAME`       | no       | Pre-fills the username field                                        |
| `STREAMABLE_LOGIN`    | no       | Needed only for the Share button                                    |
| `STREAMABLE_PASSWORD` | no       | As above                                                            |
| `PORT` / `HOST`       | no       | Default `5000` on `0.0.0.0`                                         |
| `TZ`                  | no       | Default `America/Los_Angeles`                                       |

Plex is optional. With no `PLEX_URL`/`PLEX_TOKEN` the app still runs, offering
the file browser alone.

### Reaching Plex

If Plex runs with `network_mode: host` and Clipplex is on a bridge network,
`http://plex:32400` will not resolve. Use the Docker bridge gateway —
usually `http://172.17.0.1:32400`.

## Running it

```yaml
services:
  clipplex:
    build: ./clipplex/src
    image: clipplex:local
    container_name: clipplex
    restart: unless-stopped
    environment:
      - PLEX_URL=http://172.17.0.1:32400
      - PLEX_TOKEN=${PLEX_TOKEN}
      - PLEX_USERNAME=yourplexuser
      - STREAMABLE_LOGIN=${STREAMABLE_LOGIN:-}
      - STREAMABLE_PASSWORD=${STREAMABLE_PASSWORD:-}
    volumes:
      # left: where the files really are
      # right: the paths Plex reports — these must match your Plex container
      - /mnt/media/TV:/data/tvshows:ro
      - /mnt/media/Movies:/data/movies:ro
      - /srv/clipplex:/clips
    ports:
      - 9945:5000
```

Keep secrets in a `.env` beside the compose file rather than inline:

```bash
printf 'PLEX_TOKEN=%s\n' "$TOKEN" > .env
chmod 600 .env
```

```bash
docker compose up -d --build clipplex
```

## Using it

1. Choose a source: **Now playing**, **Search Plex**, or **Browse files**.
2. For Now playing, enter your Plex username and press *Check stream*, then
   *Use as start*. Otherwise pick an item or a file.
3. Drag the in and out handles on the scrubber — it shows the frame under the
   handle as you move it. Focus a handle and use the arrow keys to nudge by a
   second, or hold shift for ten. The time fields stay in step, so you can
   also type an exact range, or use `+15s` / `+30s` / `+1m` / `+2m`.
4. **Preview range** renders a 480p draft of just that range and plays it
   inline, so you can check you caught the moment before encoding properly.
   Drafts are cached and swept after a day.
5. Tick *Also make a GIF* if you want one, then **Create clip**. A progress
   bar follows ffmpeg as it cuts.
6. Download it, make a GIF from it afterwards, or **Share** to upload to
   Streamable — the link stays on the card.

## Development

```bash
npm install
npm run dev
```

Point it at real media while developing:

```bash
MEDIA_ROOTS=/path/to/media CLIPS_DIR=/tmp/clips npm run dev
```

ffmpeg and ffprobe must be on `PATH`.

## Layout

```
src/lib/server/    paths, plex, media, clips, ffmpeg, streamable
src/lib/components/ UI pieces
src/routes/api/    JSON endpoints; /api/clips streams progress as NDJSON
src/routes/media/  serves stored clips, with Range support for seeking
```

Scrubber previews come from `/api/frame`, which pulls a single frame with
ffmpeg. `-ss` goes before `-i` so it seeks by index instead of decoding up to
the timestamp: about 200ms at any point of a 45-minute file. That also means
previews work for sources a browser could never play, like MKV or HEVC.

Clips are written to `CLIPS_DIR/videos` with a small `.json` sidecar holding
their metadata, so listing the library costs no ffprobe per clip. Snapshots go
to `CLIPS_DIR/images`.

## Credits

Original work by **Jo Nike** —
[jo-nike/clipplex](https://github.com/jo-nike/clipplex).

Distributed under the MIT License. See the LICENSE file.
