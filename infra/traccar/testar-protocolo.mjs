// Envia pacotes reais de um protocolo de rastreador para o Traccar, por TCP, sem precisar de
// hardware. Uso: node testar-protocolo.mjs PORTA FRAME1 [FRAME2 ...]
// Cada FRAME é hex por padrão; prefixe com "text:" para mandar como texto ASCII puro
// (protocolos baseados em texto, como Suntech ST, Coban/gps103, Meitrack, GL200 texto).
// Exemplo (GT06 — login + posição, capturados do conjunto de testes do próprio Traccar):
//   node testar-protocolo.mjs 5023 \
//     78780D01086471700328358100093F040D0A \
//     7878131340b2fa000201040000000000011c00400e550d0a
//
// Onde achar frames reais de outros protocolos: cada decoder do Traccar tem um arquivo de teste
// público com pacotes capturados de equipamento real, ex.:
//   https://raw.githubusercontent.com/traccar/traccar/master/src/test/java/org/traccar/protocol/TeltonikaProtocolDecoderTest.java
//   https://raw.githubusercontent.com/traccar/traccar/master/src/test/java/org/traccar/protocol/SuntechProtocolDecoderTest.java
// Procure por verifyDecode(decoder, binary("...")) — a string entre aspas é o hex do pacote.
import net from 'node:net';

const [port, ...frames] = process.argv.slice(2);
if (!port || frames.length === 0) {
  console.error('Uso: node testar-protocolo.mjs PORTA FRAME_HEX [FRAME_HEX ...]');
  process.exit(1);
}

const socket = net.createConnection({ host: 'localhost', port: Number(port) }, () => {
  let i = 0;
  const sendNext = () => {
    if (i >= frames.length) { setTimeout(() => socket.end(), 1000); return; }
    const raw = frames[i++];
    const buf = raw.startsWith('text:') ? Buffer.from(raw.slice(5), 'utf8') : Buffer.from(raw, 'hex');
    console.log('enviando:', buf.toString('hex'));
    socket.write(buf);
    setTimeout(sendNext, 500);
  };
  sendNext();
});
socket.on('data', (d) => console.log('resposta do Traccar:', d.toString('hex')));
socket.on('end', () => { console.log('conexão encerrada.'); process.exit(0); });
socket.on('error', (e) => { console.error('erro:', e.message); process.exit(1); });
