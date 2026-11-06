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
3. If the file has text subtitles, **Find a line** searches its dialogue —
   click a line and the clip jumps there with a second of air either side.
   Files whose subtitles are images (PGS) or absent say so rather than
   returning nothing.
4. Drag the in and out handles on the scrubber — it shows the frame under the
   handle as you move it. Drag the middle to move the clip without changing
   its length, or pick a preset length (5s to 5m). Focus a handle and use the
   arrow keys to nudge by a second, or hold shift for ten. The time fields
   stay in step, so you can also type an exact range.
5. Click the frame (or **Preview range**) to render a 480p draft of just that
   range and play it in place, so you can check you caught the moment before
   encoding properly. Drafts are cached and swept after a day.
6. Tick *Also make a GIF* if you want one, then **Create clip**. A progress
   bar follows ffmpeg as it cuts.
7. Download it, make a GIF from it afterwards, or **Share** to upload to
   Streamable — the link stays on the card.

## Searching the whole library

The **Quotes** tab searches subtitles across everything, once an index has
been built. Building it reads the subtitles out of every file, which is a
one-time job measured in hours for a large library: extraction has to demux
the whole container, so it costs roughly 4.5 seconds per gigabyte.

It is built to survive that. Files are indexed smallest first, so episodes
land long before the big remuxes and the index is useful early; progress is
saved every 50 files, so stopping and continuing loses nothing; a file whose
size and mtime are unchanged is skipped on later runs; and ffmpeg runs at
`nice 15` with one worker, to stay behind a Plex transcode on the same box
and avoid thrashing a single spindle.

**Sidecar subtitles are free.** A `.srt`, `.ass`, `.ssa` or `.vtt` beside the
media is read directly — kilobytes instead of gigabytes — so a library kept
populated by something like [Bazarr](https://www.bazarr.media/) indexes almost
instantly. `.idx`/`.sub` (VobSub) and embedded PGS are images, not text, and
are reported as unsearchable rather than silently returning nothing.

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

Clips are written to `CLIPS_DIR/videos` alongside a small `.json` sidecar
holding their metadata and a `.jpg` poster frame, so listing the library costs
neither an ffprobe nor a metadata request per clip. Clips made before either
existed get them filled in on demand, a few per page load. Snapshots go to
`CLIPS_DIR/images`, throwaway range previews to `CLIPS_DIR/previews`, and
extracted subtitle cues to `CLIPS_DIR/subs`.

## Credits

Original work by **Jo Nike** —
[jo-nike/clipplex](https://github.com/jo-nike/clipplex).

Distributed under the MIT License. See the LICENSE file.
