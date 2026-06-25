import http.server, ssl, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(
    certfile="../asterisk/config/keys/asterisk.pem",
    keyfile="../asterisk/config/keys/asterisk.key",
)

server = http.server.HTTPServer(("0.0.0.0", 8443), http.server.SimpleHTTPRequestHandler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)
print("Servidor HTTPS en :8443")
server.serve_forever()
