"""
Organic Food E-Commerce - Local Web Server
Run this script to start the local website server:
    python server.py
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        # Gracefully handle WordPress AJAX calls
        if 'admin-ajax.php' in self.path:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"success": true, "data": []}')
        else:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"success": true}')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
        self.end_headers()

    def end_headers(self):
        # Enable CORS for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 60)
        print(" অর্গানিক ফুড - লোকাল ই-কমার্স সার্ভার চালু হয়েছে")
        print(f" ওয়েবসাইট লিঙ্ক: {url}")
        print(" সার্ভার বন্ধ করতে কীবোর্ডে Ctrl + C চাপুন")
        print("=" * 60)
        
        # Automatically open browser
        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nসার্ভার সফলভাবে বন্ধ হয়েছে।")

if __name__ == '__main__':
    run()
