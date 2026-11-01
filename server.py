#!/usr/bin/env python3
"""Projector Mapper server.

Serves the editor/output pages, lists media in ./media, saves projects to
./projects, accepts drag-and-drop uploads, and relays phone-remote commands
to the editor with Server-Sent Events.

Run:  python3 server.py [--port 8787]
"""
import http.server
import json
import os
import queue
import re
import socket
import sys
import threading
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(ROOT, "media")
PROJECTS = os.path.join(ROOT, "projects")
os.makedirs(MEDIA, exist_ok=True)
os.makedirs(PROJECTS, exist_ok=True)

VIDEO_EXT = {".mp4", ".webm", ".mov", ".m4v", ".ogv", ".mkv"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"}
SAFE_NAME = re.compile(r"[^A-Za-z0-9._\- ()]+")

_clients_lock = threading.Lock()
_clients = set()


def broadcast(msg: dict):
    data = json.dumps(msg)
    with _clients_lock:
        for q in list(_clients):
            q.put(data)


def list_media():
    items = []
    for name in sorted(os.listdir(MEDIA)):
        ext = os.path.splitext(name)[1].lower()
        if ext in VIDEO_EXT:
            kind = "video"
        elif ext in IMAGE_EXT:
            kind = "image"
        else:
            continue
        items.append({"name": name, "url": "/media/" + urllib.parse.quote(name), "kind": kind})
    return items


def list_projects():
    return sorted(
        os.path.splitext(n)[0] for n in os.listdir(PROJECTS) if n.endswith(".json")
    )


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webm": "video/webm",
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".ogv": "video/ogg",
        ".webp": "image/webp",
        ".avif": "image/avif",
    }

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        if "/api/events" in str(args[0]) if args else False:
            return
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---------- helpers ----------
    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def project_path(self, name):
        name = SAFE_NAME.sub("", os.path.basename(name)).strip()
        if not name:
            return None
        return os.path.join(PROJECTS, name + ".json")

    # ---------- GET ----------
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path
        if path == "/api/media":
            return self.send_json(list_media())
        if path == "/api/projects":
            return self.send_json(list_projects())
        if path == "/api/info":
            return self.send_json({"lan": lan_ip(), "port": self.server.server_address[1]})
        m = re.match(r"^/api/project/(.+)$", path)
        if m:
            p = self.project_path(urllib.parse.unquote(m.group(1)))
            if not p or not os.path.isfile(p):
                return self.send_json({"error": "not found"}, 404)
            with open(p, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/events":
            return self.serve_events()
        return self.serve_file()

    def serve_events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q = queue.Queue()
        with _clients_lock:
            _clients.add(q)
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    data = q.get(timeout=15)
                    self.wfile.write(("data: " + data + "\n\n").encode())
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with _clients_lock:
                _clients.discard(q)

    def serve_file(self):
        """Static file serving with HTTP Range support (needed for video seeking)."""
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().do_GET()
        if not os.path.isfile(path):
            self.send_error(404, "File not found")
            return
        size = os.path.getsize(path)
        ctype = self.guess_type(path)
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = int(m.group(2))
                elif m.group(2):
                    start = max(0, size - int(m.group(2)))
                end = min(end, size - 1)
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self.end_headers()
                    return
                status = 206
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = f.read(min(1 << 16, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ---------- POST / PUT ----------
    def do_POST(self):
        return self.do_PUT()

    def do_PUT(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path
        qs = urllib.parse.parse_qs(url.query)
        if path == "/api/upload":
            name = SAFE_NAME.sub("_", os.path.basename(qs.get("name", ["upload"])[0]))
            ext = os.path.splitext(name)[1].lower()
            if ext not in VIDEO_EXT | IMAGE_EXT:
                return self.send_json({"error": "unsupported file type %s" % ext}, 400)
            dest = os.path.join(MEDIA, name)
            n = int(self.headers.get("Content-Length") or 0)
            with open(dest, "wb") as f:
                remaining = n
                while remaining > 0:
                    chunk = self.rfile.read(min(1 << 20, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
            return self.send_json({"ok": True, "name": name, "url": "/media/" + urllib.parse.quote(name)})
        m = re.match(r"^/api/project/(.+)$", path)
        if m:
            p = self.project_path(urllib.parse.unquote(m.group(1)))
            if not p:
                return self.send_json({"error": "bad name"}, 400)
            body = self.read_body()
            try:
                data = json.loads(body)
            except Exception:
                return self.send_json({"error": "invalid json"}, 400)
            with open(p, "w") as f:
                json.dump(data, f, indent=1)
            return self.send_json({"ok": True, "name": os.path.splitext(os.path.basename(p))[0]})
        if path == "/api/remote":
            try:
                msg = json.loads(self.read_body() or b"{}")
            except Exception:
                return self.send_json({"error": "invalid json"}, 400)
            broadcast(msg)
            return self.send_json({"ok": True})
        return self.send_json({"error": "unknown endpoint"}, 404)

    def do_DELETE(self):
        m = re.match(r"^/api/project/(.+)$", urllib.parse.urlparse(self.path).path)
        if m:
            p = self.project_path(urllib.parse.unquote(m.group(1)))
            if p and os.path.isfile(p):
                os.remove(p)
                return self.send_json({"ok": True})
        return self.send_json({"error": "not found"}, 404)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    port = 8787
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    srv = Server(("0.0.0.0", port), Handler)
    print("Projector Mapper")
    print("  Editor:   http://localhost:%d/" % port)
    print("  Remote:   http://%s:%d/remote.html   (open on your phone)" % (lan_ip(), port))
    print("  Media:    drop videos/images in %s" % MEDIA)
    print("Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
