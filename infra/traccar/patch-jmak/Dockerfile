# Traccar 6.17.0 com o JmakProtocolDecoder corrigido: a resposta do aparelho a um comando ("$<imei>;ok;#")
# vira commandResult. O decoder oficial só aceita mensagens "~...$" e descartava a resposta, então
# bloqueio/desbloqueio do JR10/JR12 chegava no aparelho mas expirava na plataforma (17/11/2026).
# Só a classe muda; o resto é o jar oficial. Remover quando o Traccar oficial tratar a resposta.
#
#   docker build -t localle/traccar:6.17.0-jmakack infra/traccar/patch-jmak
FROM eclipse-temurin:25-jdk AS build
COPY --from=traccar/traccar:6.17.0 /opt/traccar /opt/traccar
COPY JmakProtocolDecoder.java /src/org/traccar/protocol/
RUN javac -nowarn -cp "/opt/traccar/tracker-server.jar:/opt/traccar/lib/*" -d /out /src/org/traccar/protocol/JmakProtocolDecoder.java \
 && cd /out && jar uf /opt/traccar/tracker-server.jar org/traccar/protocol/JmakProtocolDecoder.class

FROM traccar/traccar:6.17.0
COPY --from=build /opt/traccar/tracker-server.jar /opt/traccar/tracker-server.jar
