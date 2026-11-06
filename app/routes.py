import os
import time
from flask import render_template, redirect, request, jsonify
from app import app
from app.forms import video as formVideo
import clipplexAPI

DEFAULT_USERNAME = os.environ.get("PLEX_USERNAME") or ""


def _error(message, status=400):
    return jsonify({"message": message}), status


def _web_path(full_path: str) -> str:
    """Turn a path on disk into one the browser can request."""
    return os.path.relpath(os.path.realpath(full_path), os.path.realpath("app"))


def _normalise_time(value: str) -> str:
    parts = (value or "").split(":")
    if len(parts) != 3:
        raise clipplexAPI.ClipError(f"'{value}' is not a HH:MM:SS time.")
    return ":".join(part.strip().zfill(2) for part in parts)


@app.route("/")
def home():
    return redirect("/instant_video.html")


@app.route("/instant_video.html", methods=["GET"])
def timed_video():
    form = formVideo(user=DEFAULT_USERNAME)
    return render_template(
        "instant_video.html",
        form=form,
        title="Instant Video",
        active_page="video",
        videos=clipplexAPI.Utils.get_videos_in_folder(),
        has_plex=bool(os.environ.get("PLEX_URL") and os.environ.get("PLEX_TOKEN")),
    )


@app.route("/instant_snapshot.html", methods=["GET"])
def instant_snapshot():
    return render_template(
        "instant_snapshot.html",
        title="Instant Snapshot",
        active_page="snapshot",
        images=clipplexAPI.Utils.get_images_in_folder(),
        default_username=DEFAULT_USERNAME,
    )


# --------------------------------------------------------------------------
# Picking a source
# --------------------------------------------------------------------------

@app.route("/get_current_stream", methods=["GET", "POST"])
def get_current_stream():
    username = request.args.get("username")
    try:
        plex = clipplexAPI.PlexInfo(username)
    except Exception:
        return {"message": f"No session running for user {username}"}
    return {
        "file_path": str(plex.media_path),
        "username": username,
        "current_time": plex.current_media_time_str,
        "media_title": plex.media_title,
    }


@app.route("/plex_search", methods=["GET"])
def plex_search():
    try:
        results = clipplexAPI.PlexLibrary().search(request.args.get("query", ""))
    except clipplexAPI.PlexUnavailable as e:
        return _error(str(e), 502)
    return jsonify({"results": results})


@app.route("/browse", methods=["GET"])
def browse():
    try:
        return jsonify(clipplexAPI.browse(request.args.get("path", "")))
    except clipplexAPI.PathNotAllowed as e:
        return _error(str(e), 403)
    except OSError as e:
        return _error(f"Could not read that directory: {e}")


@app.route("/media_info", methods=["GET"])
def media_info():
    try:
        return jsonify(clipplexAPI.media_info(request.args.get("path", "")))
    except clipplexAPI.PathNotAllowed as e:
        return _error(str(e), 403)
    except clipplexAPI.ClipError as e:
        return _error(str(e))


# --------------------------------------------------------------------------
# Making clips
# --------------------------------------------------------------------------

def _build_source(kind: str, args, start: str) -> clipplexAPI.ClipSource:
    if kind == "plex":
        username = args.get("username") or DEFAULT_USERNAME
        return clipplexAPI.ClipSource.from_plex(clipplexAPI.PlexInfo(username))
    if kind == "item":
        return clipplexAPI.ClipSource.from_plex_library(args.get("rating_key", ""), start)
    if kind == "file":
        return clipplexAPI.ClipSource.from_file(args.get("path", ""), start)
    raise clipplexAPI.ClipError(f"Unknown clip source '{kind}'.")


@app.route("/create_clip", methods=["POST"])
def create_clip():
    args = request.args
    try:
        start = _normalise_time(args.get("start"))
        end = _normalise_time(args.get("end"))
        duration = clipplexAPI.Utils().calculate_clip_time(start, end)
        source = _build_source(args.get("source", "plex"), args, start)

        app.logger.info(
            "Cutting %ss from %s at %s", duration, source.media_path, start
        )
        output = clipplexAPI.Video(
            source, start, duration, f"{source.slug}_{int(time.time())}"
        ).extract_video()

        result = {"result": "success", "file_path": _web_path(output)}
        if args.get("gif") == "1":
            result["gif_path"] = _web_path(
                clipplexAPI.Gif.from_clip(os.path.realpath(output))
            )
        return jsonify(result)
    except clipplexAPI.PathNotAllowed as e:
        return _error(str(e), 403)
    except clipplexAPI.PlexUnavailable as e:
        return _error(str(e), 502)
    except clipplexAPI.ClipError as e:
        return _error(str(e))
    except Exception as e:
        app.logger.exception("Clip creation failed")
        return _error(f"Clip creation failed: {e}", 500)


@app.route("/create_gif", methods=["POST"])
def create_gif():
    try:
        clip = clipplexAPI.resolve_clip_path(request.args.get("file_path", ""))
        gif = clipplexAPI.Gif.from_clip(
            clip,
            width=int(request.args.get("width") or 480),
            fps=int(request.args.get("fps") or 15),
        )
        return jsonify({"gif_path": _web_path(gif)})
    except clipplexAPI.PathNotAllowed as e:
        return _error(str(e), 403)
    except clipplexAPI.ClipError as e:
        return _error(str(e))
    except ValueError:
        return _error("Width and fps must be whole numbers.")


@app.route("/get_instant_snapshot", methods=["GET"])
def get_instant_snapshot():
    try:
        plex_data = clipplexAPI.PlexInfo(request.args.get("username") or DEFAULT_USERNAME)
        clipplexAPI.Snapshot(
            plex_data.media_path, plex_data.current_media_time_str, plex_data.media_fps
        )._download_frames()
    except clipplexAPI.ClipError as e:
        return _error(str(e))
    except Exception as e:
        app.logger.exception("Snapshot failed")
        return _error(f"Snapshot failed: {e}", 500)
    return jsonify({"result": "success"})


@app.route("/quick_add_time_to_start_time", methods=["POST"])
def quick_add_time_to_start_time():
    try:
        return clipplexAPI.Utils().add_time(
            _normalise_time(request.args.get("start_time")),
            int(request.args.get("time_to_add")),
        )
    except (clipplexAPI.ClipError, ValueError) as e:
        return _error(str(e))


# --------------------------------------------------------------------------
# Managing clips
# --------------------------------------------------------------------------

@app.route("/remove_file", methods=["POST"])
def remove_file():
    try:
        if clipplexAPI.Utils().delete_file(request.args.get("file_path", "")):
            return jsonify({"result": "deleted"})
        return _error("That clip could not be deleted.")
    except clipplexAPI.PathNotAllowed as e:
        return _error(str(e), 403)


@app.route("/streamable_upload", methods=["POST"])
def streamable_upload():
    try:
        return jsonify(clipplexAPI.Utils().streamable_upload(request.args.get("file_path", "")))
    except clipplexAPI.PathNotAllowed as e:
        return _error(str(e), 403)
    except clipplexAPI.StreamableError as e:
        app.logger.warning("Streamable upload failed: %s", e)
        return _error(str(e), 502)


# --------------------------------------------------------------------------
# Unused Plex OAuth scaffolding from upstream. Kept as-is: check_credentials
# calls a plex_user_login that does not exist, so /signin raises if reached.
# --------------------------------------------------------------------------

@app.route("/login.html", methods=["GET", "POST"])
def login():
    return render_template("login.html")


@app.route("/signin", methods=["POST"])
def signin():
    token = request.get_json()["token"]
    valid_login, user_details, user_group = check_credentials(token=token)
    print(valid_login, user_details, user_group)


def check_credentials(token=None):
    """Verifies credentials for username and password.
    Returns True and the user group on success or False and no user group"""
    plex_login = plex_user_login(token=token)

    if plex_login is not None:
        return True, plex_login[0], plex_login[1]
