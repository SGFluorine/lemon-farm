# 開発用のローカルサーバー。
# 普通の `py -m http.server` だと、ブラウザが古いJSファイルを覚えて使い続けることがあるので、
# 「毎回最新のファイルを読み込んで（キャッシュしないで）」という指示を付けて返す。
#
# 使い方：このフォルダで `py serve.py` を実行し、http://localhost:8000 を開く
import http.server
import os

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))  # このファイルがあるフォルダを公開する
    print(f"http://localhost:{PORT} で起動しました（止めるときは Ctrl+C）")
    http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler).serve_forever()
