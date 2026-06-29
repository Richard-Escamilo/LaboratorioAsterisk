import http.server, ssl, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.minimum_version = ssl.TLSVersion.TLSv1_2
ctx.load_cert_chain(
    certfile="../asterisk/config/keys/asterisk.pem",
    keyfile="../asterisk/config/keys/asterisk.key",
)
server = http.server.HTTPServer(("0.0.0.0", 8443), NoCacheHandler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)
print("Servidor HTTPS en :8443 (sin hilos, sin cache)")
server.serve_forever()
