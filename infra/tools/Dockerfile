# Imagem que roda o Makefile da raiz: make + docker CLI/compose falando com o daemon do host pelo socket.
# O host só precisa do Docker. Chamada pelos wrappers make.ps1 (Windows) / make.sh (Linux/macOS/VPS).
FROM alpine:3.20
RUN apk add --no-cache make bash curl docker-cli docker-cli-compose
