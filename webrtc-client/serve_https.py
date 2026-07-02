import http.server, ssl, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://98.95.202.225:4000 wss://98.95.202.225:8089; img-src 'self' data:; media-src 'self' https://98.95.202.225:4000 blob:")
        super().end_headers()

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.minimum_version = ssl.TLSVersion.TLSv1_2
ctx.load_cert_chain(
    certfile="../asterisk/config/keys/asterisk.pem",
    keyfile="../asterisk/config/keys/asterisk.key",
)
import socketserver
socketserver.ThreadingTCPServer.allow_reuse_address = True
server = socketserver.ThreadingTCPServer(("0.0.0.0", 8443), NoCacheHandler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)
print("Servidor HTTPS en :8443 (sin hilos, sin cache)")
server.serve_forever()
