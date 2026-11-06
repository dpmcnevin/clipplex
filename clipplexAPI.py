from dataclasses import dataclass
from datetime import datetime, timedelta
import os
import re
import subprocess
import xml.etree.ElementTree as ET
import ffmpeg
import requests


MEDIA_STATIC_PATH = "app/static/media"

VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".avi", ".m4v", ".mov", ".webm",
    ".ts", ".m2ts", ".mpg", ".mpeg", ".wmv", ".flv",
}


class StreamableError(Exception):
    """Raised when a clip could not be uploaded to Streamable."""


class PathNotAllowed(Exception):
    """Raised when a supplied path escapes the directories we serve."""


class ClipError(Exception):
    """Raised when ffmpeg could not produce the requested output."""


class PlexUnavailable(Exception):
    """Raised when the Plex API could not be reached or answered badly."""


# --------------------------------------------------------------------------
# Paths
#
# Every path below arrives from the browser, so each one is resolved and then
# checked against a known root. Without that, "../.." walks straight out of
# the clip directory and into the mounted media.
# --------------------------------------------------------------------------

def clips_base() -> str:
    return os.path.realpath(MEDIA_STATIC_PATH)


def resolve_clip_path(file_path: str) -> str:
    """Resolve a clip path from the UI, confined to the clip directory."""
    if not file_path:
        raise PathNotAllowed("No file was given.")
    base = clips_base()
    full = os.path.realpath(os.path.join("app", file_path))
    if full != base and not full.startswith(base + os.sep):
        raise PathNotAllowed("That path is outside the clip directory.")
    return full


def media_roots() -> list:
    """The directories that can be browsed for source media."""
    raw = os.environ.get("MEDIA_ROOTS") or "/data"
    roots = []
    for item in raw.split(":"):
        item = item.strip()
        if item and os.path.isdir(item):
            root = os.path.realpath(item)
            if root not in roots:
                roots.append(root)
    return roots


def resolve_media_path(path: str) -> str:
    """Resolve a source-media path, confined to the configured roots."""
    roots = media_roots()
    if not roots:
        raise PathNotAllowed("No media roots are configured.")
    full = os.path.realpath(path) if path else roots[0]
    for root in roots:
        if full == root or full.startswith(root + os.sep):
            return full
    raise PathNotAllowed("That path is outside the configured media roots.")


def browse(path: str = "") -> dict:
    """List sub-directories and playable files under a media root."""
    roots = media_roots()
    full = resolve_media_path(path)
    if not os.path.isdir(full):
        raise PathNotAllowed("That path is not a directory.")

    dirs, files = [], []
    with os.scandir(full) as entries:
        for entry in entries:
            if entry.name.startswith("."):
                continue
            try:
                if entry.is_dir():
                    dirs.append({"name": entry.name, "path": entry.path})
                elif os.path.splitext(entry.name)[1].lower() in VIDEO_EXTENSIONS:
                    files.append({
                        "name": entry.name,
                        "path": entry.path,
                        "size": entry.stat().st_size,
                    })
            except OSError:
                continue

    dirs.sort(key=lambda item: item["name"].lower())
    files.sort(key=lambda item: item["name"].lower())

    return {
        "path": full,
        "parent": None if full in roots else os.path.dirname(full),
        "roots": [{"name": os.path.basename(root) or root, "path": root} for root in roots],
        "dirs": dirs,
        "files": files,
    }


def media_info(path: str) -> dict:
    """Name and duration of a source file, for the picker."""
    full = resolve_media_path(path)
    try:
        probed = ffmpeg.probe(full)
    except ffmpeg.Error as e:
        raise ClipError(f"Could not read {os.path.basename(full)}: {_ffmpeg_error(e)}")
    duration = float(probed["format"].get("duration") or 0)
    return {
        "path": full,
        "name": os.path.basename(full),
        "duration": duration,
        "duration_str": Utils().seconds_to_time(duration),
    }


def _ffmpeg_error(error) -> str:
    detail = getattr(error, "stderr", b"") or b""
    if isinstance(detail, bytes):
        detail = detail.decode("utf-8", "replace")
    return detail.strip().splitlines()[-1] if detail.strip() else str(error)


def _tidy(text: str) -> str:
    return re.sub(r"[._]+", " ", text).strip(" -_.")


def _parse_episode(stem: str):
    """Pull show / season / episode out of a filename when it looks like one."""
    match = re.match(
        r"^(?P<show>.+?)[ ._-]+[Ss](?P<season>\d{1,2})[ ._-]?[Ee](?P<episode>\d{1,3})(?P<rest>.*)$",
        stem,
    )
    if not match:
        return "", "", "", _tidy(stem)
    show = _tidy(match.group("show"))
    title = _tidy(match.group("rest"))
    return show, str(int(match.group("season"))), str(int(match.group("episode"))), title


class PlexInfo:
    def __init__(self, username):
        self.plex_url = os.environ.get("PLEX_URL")
        self.plex_token = os.environ.get("PLEX_TOKEN")
        self.params = (("X-Plex-Token", self.plex_token),)
        self.sessions_xml = self._get_current_sessions_xml()
        self.username = username
        self.session_id = self._get_session_id(username)
        self.media_key = self._get_media_key()
        self.media_path_xml = self._get_media_path_xml()
        self.media_path = self._get_file_path()
        self.media_fps = self._get_media_fps()
        self.media_type = self._get_file_type()
        self.media_title = self._get_file_title()
        self.current_media_time_int = self._get_current_media_time()
        self.current_media_time_str = Utils(offset=self.current_media_time_int).offset_to_time

    def _get_media_fps(self) -> float:
        """Get the frame rate of the video currently played by the user."""
        media_dict = list(list(list(list(list(self.media_path_xml)[0]))[0])[0])[0].attrib
        return float(media_dict["frameRate"])

    def _get_current_media_time(self) -> int:
        """Offset between the start of the video and the current view position."""
        media_dict = list(list(self.sessions_xml))[self.session_id].attrib
        return int(media_dict["viewOffset"])

    def _get_current_sessions_xml(self) -> ET:
        """Get the XML from plex for the current user session."""
        response = requests.get(f"{self.plex_url}/status/sessions", params=self.params)
        return ET.fromstring(response.content)

    def _get_file_path(self) -> str:
        """Get the file path of the video currently played by the user."""
        media_dict = list(list(list(list(self.media_path_xml)[0]))[0])[0].attrib
        return media_dict["file"]

    def _get_file_title(self) -> str:
        """Show plus episode name for an episode, otherwise the movie name."""
        video_dict = list(list(self.media_path_xml))[0].attrib
        if self.media_type == "episode":
            return f"{video_dict['grandparentTitle']} - {video_dict['title']}"
        return video_dict["title"]

    def _get_file_type(self) -> str:
        """Get the type of file of the video currently played by the user."""
        video_dict = list(list(self.media_path_xml))[0].attrib
        return video_dict["type"]

    def _get_media_path_xml(self) -> ET:
        """Get the XML from plex for the video being played."""
        response = requests.get(f"{self.plex_url}{self.media_key}", params=self.params)
        return ET.fromstring(response.content)

    def _get_media_key(self) -> str:
        """Get the plex media key of the video being played."""
        media_info = list(list(self.sessions_xml))[self.session_id].attrib
        return media_info["key"]

    def _get_session_id(self, username: str) -> int:
        """Get the plex session index for the current user."""
        for sessions in list(self.sessions_xml):
            for session in sessions:
                if session.tag == "User" and session.attrib["title"] == username:
                    return list(self.sessions_xml).index(sessions)
        raise Exception(f"No stream running for user {username}")


class PlexLibrary:
    """Search and read the Plex catalogue over its HTTP API.

    Deliberately not the server's SQLite database: that file is locked while
    Plex is running and its schema is an internal detail. /search also returns
    each match's Part file path, which is the path Clipplex needs anyway.
    """

    def __init__(self):
        self.plex_url = os.environ.get("PLEX_URL")
        self.plex_token = os.environ.get("PLEX_TOKEN")

    def _get(self, path: str, params: dict = None) -> ET:
        if not self.plex_url or not self.plex_token:
            raise PlexUnavailable("PLEX_URL and PLEX_TOKEN are not configured.")
        try:
            response = requests.get(
                f"{self.plex_url}{path}",
                params={**(params or {}), "X-Plex-Token": self.plex_token},
                timeout=20,
            )
        except requests.RequestException as e:
            raise PlexUnavailable(f"Could not reach Plex: {e}")
        if response.status_code != 200:
            raise PlexUnavailable(f"Plex returned HTTP {response.status_code}.")
        return ET.fromstring(response.content)

    @staticmethod
    def _entry(video) -> dict:
        part = video.find("./Media/Part")
        path = part.attrib.get("file", "") if part is not None else ""
        attributes = video.attrib
        episode = attributes.get("type") == "episode"

        # Plex may know a file Clipplex cannot see, if the mounts disagree.
        # Surface that in the result rather than failing at cut time.
        reachable = False
        if path:
            try:
                reachable = os.path.isfile(resolve_media_path(path))
            except PathNotAllowed:
                reachable = False

        return {
            "rating_key": attributes.get("ratingKey", ""),
            "type": attributes.get("type", ""),
            "title": attributes.get("title", ""),
            "show": attributes.get("grandparentTitle", "") if episode else "",
            "season": attributes.get("parentIndex", "") if episode else "",
            "episode": attributes.get("index", "") if episode else "",
            "year": attributes.get("year", ""),
            "duration_str": Utils().milli_to_string(int(attributes.get("duration") or 0)),
            "path": path,
            "reachable": reachable,
        }

    def search(self, query: str, limit: int = 30) -> list:
        query = (query or "").strip()
        if not query:
            return []
        root = self._get("/search", {"query": query, "limit": limit})
        return [
            self._entry(video)
            for video in root.findall("./Video")
            if video.attrib.get("type") in ("episode", "movie")
        ][:limit]

    def item(self, rating_key: str) -> dict:
        root = self._get(f"/library/metadata/{rating_key}")
        video = root.find("./Video")
        if video is None:
            raise PlexUnavailable("Plex has no item with that id.")
        return self._entry(video)


@dataclass
class ClipSource:
    """What a clip is cut from, independent of where it was chosen.

    Plex gives richer metadata; a file picked off disk gives what its name
    reveals. Everything downstream only needs these fields.
    """

    media_path: str
    title: str = ""
    show: str = ""
    season: str = ""
    episode: str = ""
    username: str = ""
    source_time: str = ""

    @classmethod
    def from_plex(cls, plex_data: PlexInfo) -> "ClipSource":
        attributes = list(list(plex_data.media_path_xml))[0].attrib
        episode = plex_data.media_type == "episode"
        return cls(
            media_path=plex_data.media_path,
            title=attributes.get("title", ""),
            show=attributes.get("grandparentTitle", "") if episode else "",
            season=attributes.get("parentIndex", "") if episode else "",
            episode=attributes.get("index", "") if episode else "",
            username=plex_data.username,
            source_time=plex_data.current_media_time_str,
        )

    @classmethod
    def from_file(cls, path: str, start: str = "") -> "ClipSource":
        full = resolve_media_path(path)
        if not os.path.isfile(full):
            raise PathNotAllowed("That file does not exist.")
        show, season, episode, title = _parse_episode(os.path.splitext(os.path.basename(full))[0])
        return cls(
            media_path=full,
            title=title,
            show=show,
            season=season,
            episode=episode,
            source_time=start,
        )

    @classmethod
    def from_plex_library(cls, rating_key: str, start: str = "") -> "ClipSource":
        """A source picked out of a Plex search, with Plex's own metadata."""
        item = PlexLibrary().item(rating_key)
        if not item["path"]:
            raise PathNotAllowed("Plex did not report a file for that item.")
        return cls(
            media_path=resolve_media_path(item["path"]),
            title=item["title"],
            show=item["show"],
            season=item["season"],
            episode=item["episode"],
            source_time=start,
        )

    @property
    def slug(self) -> str:
        """Filename-safe stem for the clip this source produces."""
        name = f"{self.show}-{self.title}" if self.show else self.title
        name = re.sub(r"[^\w.-]", "", name.replace(" ", ""))
        return name or "clip"


class Snapshot:
    def __init__(self, media_path: str, time: str, fps: float):
        self.media_path = media_path
        self.time = time
        self.fps = int(fps)

    def _download_frames(self):
        # Argument list, not a shell string: media paths routinely contain
        # spaces and parentheses, which a shell would split or interpret.
        output = os.path.join(
            MEDIA_STATIC_PATH, "images", f"{self.time.replace(':', '_')}_%03d.jpg"
        )
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", self.time,
                "-i", self.media_path,
                "-vframes", str(self.fps),
                "-qscale:v", "2",
                output,
            ],
            capture_output=True,
        )
        if result.returncode != 0:
            raise ClipError(
                result.stderr.decode("utf-8", "replace").strip().splitlines()[-1]
                if result.stderr else "ffmpeg failed"
            )


class Video:
    def __init__(self, source: ClipSource, time: str, duration, file_name: str):
        self.source = source
        self.time = time
        self.duration = duration
        self.file_name = file_name

    def extract_video(self) -> str:
        output = f"{MEDIA_STATIC_PATH}/videos/{self.file_name}.mp4"
        try:
            (
                ffmpeg
                .input(self.source.media_path, ss=self.time, t=self.duration)
                .output(
                    output,
                    map_metadata=-1,
                    vcodec="libx264",
                    # AAC, not Vorbis: Vorbis in an MP4 container is not
                    # standard and browsers routinely refuse to play it.
                    acodec="aac",
                    pix_fmt="yuv420p",
                    crf=18,
                    **{
                        "metadata:g:0": f"title={self.source.title}",
                        "metadata:g:1": f"season_number={self.source.season}",
                        "metadata:g:2": f"show={self.source.show}",
                        "metadata:g:3": f"episode_id={self.source.episode}",
                        "metadata:g:4": f"comment={self.source.source_time}",
                        "metadata:g:5": f"artist={self.source.username}",
                    },
                )
                .run(capture_stdout=True, capture_stderr=True)
            )
        except ffmpeg.Error as e:
            raise ClipError(f"ffmpeg could not cut the clip: {_ffmpeg_error(e)}")
        return output


class Gif:
    """Animated GIF built from a finished clip.

    Two passes: one to build a palette tuned to this clip, one to apply it.
    A single-pass GIF is quantised to a generic 256-colour palette and bands
    badly on film footage.
    """

    @staticmethod
    def from_clip(clip_full_path: str, width: int = 480, fps: int = 15) -> str:
        gif_path = os.path.splitext(clip_full_path)[0] + ".gif"
        palette_path = gif_path + ".palette.png"
        scale = f"fps={fps},scale={width}:-1:flags=lanczos"
        try:
            _run_ffmpeg([
                "ffmpeg", "-y", "-i", clip_full_path,
                "-vf", f"{scale},palettegen=stats_mode=diff",
                "-frames:v", "1", palette_path,
            ])
            _run_ffmpeg([
                "ffmpeg", "-y", "-i", clip_full_path, "-i", palette_path,
                "-lavfi", f"{scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
                "-loop", "0", gif_path,
            ])
        finally:
            if os.path.exists(palette_path):
                os.remove(palette_path)
        return gif_path


def _run_ffmpeg(command: list):
    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise ClipError(detail.splitlines()[-1] if detail else "ffmpeg failed")


class Utils:
    def __init__(self, offset: int = 0):
        self.offset_to_time = self.milli_to_string(offset)

    def milli_to_string(self, millisec: int) -> str:
        time = str(timedelta(milliseconds=millisec))
        if len(time.split(":")[0]) < 2:
            time = f"0{time}"
        return time.split(".")[0]

    def seconds_to_time(self, seconds: float) -> str:
        return self.milli_to_string(int(seconds * 1000))

    def add_time(self, current_time: str, time_to_add: int) -> str:
        time_obj = datetime.strptime(current_time, "%H:%M:%S")
        return (time_obj + timedelta(seconds=time_to_add)).strftime("%H:%M:%S")

    def _pad_time(self, time) -> str:
        if len(str(time)) < 2:
            time = f"0{time}"
        return time

    def calculate_clip_time(self, start, end) -> int:
        def to_seconds(value):
            parts = value.split(":")
            if len(parts) != 3 or not all(part.strip().isdigit() for part in parts):
                raise ClipError(f"'{value}' is not a HH:MM:SS time.")
            hours, minutes, seconds = (int(part) for part in parts)
            return hours * 3600 + minutes * 60 + seconds

        total = to_seconds(end) - to_seconds(start)
        if total <= 0:
            raise ClipError("The end time must be after the start time.")
        return total

    def get_images_in_folder() -> list:
        folder = os.path.join(MEDIA_STATIC_PATH, "images")
        folder_list = []
        for name in os.listdir(folder):
            if name.startswith("."):
                continue
            path = f"{folder}/{name}"
            folder_list.append("/".join(path.split("/")[1:]))
        return sorted(folder_list)

    def get_videos_in_folder() -> list:
        folder = os.path.join(MEDIA_STATIC_PATH, "videos")
        entries = []
        for name in os.listdir(folder):
            # Only MP4s are clips; a sibling .gif belongs to one of them.
            if not name.lower().endswith(".mp4"):
                continue
            path = os.path.join(folder, name)
            try:
                metadata = ffmpeg.probe(path)["format"].get("tags", {})
            except Exception:
                metadata = {}
            gif_path = os.path.join(folder, os.path.splitext(name)[0] + ".gif")
            entries.append({
                "file_path": "/".join(path.split("/")[1:]),
                "gif_path": "/".join(gif_path.split("/")[1:]) if os.path.exists(gif_path) else "",
                "title": metadata.get("title") or "",
                "original_start_time": metadata.get("comment") or "",
                "username": metadata.get("artist") or "",
                "show": metadata.get("show") or "",
                "episode_number": metadata.get("episode_id") or "",
                "season_number": metadata.get("season_number") or "",
                "mtime": os.path.getmtime(path),
            })
        entries.sort(key=lambda entry: entry["mtime"], reverse=True)
        return entries

    def delete_file(self, file_path) -> bool:
        full = resolve_clip_path(file_path)
        try:
            os.remove(full)
        except OSError:
            return False
        companion = os.path.splitext(full)[0] + ".gif"
        if os.path.exists(companion):
            try:
                os.remove(companion)
            except OSError:
                pass
        return True

    def upload_name(self, full_path: str) -> str:
        """Build the name sent to Streamable, which shows it as the video title.

        Taken from the clip's own metadata so the title reads like the show
        rather than the stored filename.
        """
        try:
            tags = ffmpeg.probe(full_path)["format"].get("tags", {})
        except Exception:
            tags = {}
        title = (tags.get("title") or "").strip()
        show = (tags.get("show") or "").strip()
        season = (tags.get("season_number") or "").strip()
        episode = (tags.get("episode_id") or "").strip()

        if show and season and episode:
            name = f"{show} - S{season}E{episode} - {title}"
        elif show:
            name = f"{show} - {title}"
        else:
            name = title

        name = name.strip(" -")
        if not name:
            # Older clips may have no metadata: fall back to the filename with
            # any leading username and the trailing timestamp removed.
            stem = os.path.splitext(os.path.basename(full_path))[0]
            name = re.sub(r"_\d{9,}$", "", stem.split("_", 1)[-1])
        return f"{name}.mp4"

    def streamable_upload(self, file_path) -> dict:
        email = os.environ.get("STREAMABLE_LOGIN") or ""
        password = os.environ.get("STREAMABLE_PASSWORD") or ""
        if not email or not password:
            raise StreamableError(
                "Streamable credentials are not configured. Set STREAMABLE_LOGIN and STREAMABLE_PASSWORD."
            )
        full_path = resolve_clip_path(file_path)
        try:
            with open(full_path, "rb") as clip:
                response = requests.post(
                    "https://api.streamable.com/upload",
                    auth=(email, password),
                    files={"file": (self.upload_name(full_path), clip)},
                    timeout=600,
                )
        except OSError as e:
            raise StreamableError(f"Could not read {os.path.basename(full_path)}: {e}")
        except requests.RequestException as e:
            raise StreamableError(f"Could not reach Streamable: {e}")

        if response.status_code != 200:
            detail = response.text.strip()[:200] or "no response body"
            raise StreamableError(f"Streamable returned HTTP {response.status_code}: {detail}")
        try:
            return response.json()
        except ValueError:
            raise StreamableError("Streamable returned a response that was not JSON.")
