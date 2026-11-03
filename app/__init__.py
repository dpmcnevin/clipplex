from flask import Flask
import os

folders = ["/app/app/static/media/videos", "/app/app/static/media/images"]
for folder in folders:
    os.makedirs(folder, exist_ok=True)

app = Flask(__name__, static_url_path="/static")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or os.urandom(32)
from app import routes
