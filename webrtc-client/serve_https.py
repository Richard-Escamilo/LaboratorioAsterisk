import http.server, ssl, os, socketserver

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(
    certfile="../asterisk/config/keys/asterisk.pem",
    keyfile="../asterisk/config/keys/asterisk.key",
)

server = ThreadingHTTPServer(("0.0.0.0", 8443), http.server.SimpleHTTPRequestHandler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)
server.socket.settimeout(10)
print("Servidor HTTPS multi-hilo en :8443")
server.serve_forever()
