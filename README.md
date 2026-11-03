# Clipplex

Pull a clip out of whatever you're currently watching on Plex, without hunting
for the file yourself. Clipplex asks Plex what you're playing and where you are
in it, then cuts the range you pick with ffmpeg and lists the result for you to
download or share.

This is a fork of [jo-nike/clipplex](https://github.com/jo-nike/clipplex),
updated to run on a current Python/Flask stack with a rebuilt interface.

## How it works

Clipplex reads your active session from the Plex API, which reports the media's
**absolute path as Plex sees it**. It hands that path straight to ffmpeg.

That makes one thing non-negotiable: **the container must see your media at the
same paths your Plex server does.** If Plex has `/data/movies`, Clipplex needs
`/data/movies` too — pointing it at the same files under a different path will
not work.

## Configuration

| Variable              | Required | Notes                                                     |
| --------------------- | -------- | --------------------------------------------------------- |
| `PLEX_URL`            | yes      | e.g. `http://plex:32400`. See the note below for host networking. |
| `PLEX_TOKEN`          | yes      | [Finding your token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) |
| `PLEX_USERNAME`       | no       | Pre-fills the username field                               |
| `STREAMABLE_LOGIN`    | no       | Needed only for the Share button                           |
| `STREAMABLE_PASSWORD` | no       | As above                                                   |
| `SECRET_KEY`          | no       | Flask session key; a random one is generated if unset      |
| `TZ`                  | no       | Defaults to `America/Los_Angeles`                          |

### Volumes

- your media, mounted at **the same paths Plex uses**
- somewhere for the clips: `/app/app/static/media`

### Port

The app listens on **5000** inside the container (gunicorn).

### Reaching Plex

If Plex runs with `network_mode: host` and Clipplex is on a bridge network,
`http://plex:32400` will not resolve. Use the Docker bridge gateway instead —
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
      - TZ=America/Los_Angeles
    volumes:
      # left side: where the files really are
      # right side: the paths Plex reports — these must match your Plex container
      - /mnt/media/TV:/data/tvshows:ro
      - /mnt/media/Movies:/data/movies:ro
      - /srv/clipplex/media:/app/app/static/media
    ports:
      - 9945:5000
```

Keep secrets in a `.env` file next to the compose file rather than inline:

```bash
printf 'PLEX_TOKEN=%s\n' "$TOKEN" > .env
chmod 600 .env
```

Then:

```bash
docker compose up -d --build clipplex
```

## Using it

1. Start playing something in Plex.
2. Enter your Plex username and press the eye icon — Clipplex shows what's
   playing and your current position.
3. **Use as start**, then one of the `+15s` / `+30s` / `+1m` / `+2m` buttons,
   or type the times in directly.
4. **Create clip.** It appears in the library below, with its Plex metadata.
5. Download it, or **Share** to upload to Streamable. The link stays on the
   card afterwards.

## Changes in this fork

- Runs on Alpine 3.21 / Python 3.12 / Flask 3.1, served by gunicorn
- Fixed a build that could never start (`FLASK_APP` was set by a no-op `RUN`)
- Rebuilt the frontend: no Bootstrap or jQuery, responsive, with the clip
  library as cards showing each clip's metadata
- Streamable failures report the actual reason instead of a blank 500, and
  successful uploads keep their link on the card
- Clip filenames and share titles no longer embed the Plex username
- The username is configurable rather than hardcoded

## Credits

Original work by **Jo Nike** — [jo-nike/clipplex](https://github.com/jo-nike/clipplex).
UI originally based on [Start Bootstrap](https://github.com/startbootstrap/startbootstrap-sb-admin), since replaced.

Distributed under the MIT License. See the LICENSE file.
