// Frota fictícia para DESENVOLVIMENTO LOCAL (pedido do usuário em 11/11/2026: ver os painéis com dados). Nunca rodar em
// HML/produção: recusa se DATABASE_URL não apontar para localhost/127.0.0.1.
//
// Cria, no cliente do usuário (padrão gestor@demo.com — rode antes `pnpm seed:demo-user`): 4 grupos (bases), 60 veículos com
// placa Mercosul, motoristas, rastreadores instalados, 8 dias de posições (trajetos minuto a minuto no horário comercial,
// menos uso no fim de semana), estado atual variado (em movimento, parado ligado, desligado, sem sinal, sem GPS, aguardando
// 1ª posição) e viagens. Rematerializa o agregado uso_5min no fim.
//
// Rodar de novo apaga e recria só o que este script criou (rastreadores com modelo 'SEED-DEMO' e o que pende deles, ativos
// com dados.seed = 'demo-frota', grupos e motoristas criados por ele).
//
//   node scripts/seed-demo-frota.mjs [email]
import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2] || 'gestor@demo.com';
const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error('Recusado: DATABASE_URL não é local.'); process.exit(1); }

const pool = new pg.Pool({ connectionString: url });
const q = (sql, params) => pool.query(sql, params);

// gerador determinístico (a mesma frota a cada execução)
let semente = 20261111;
const rnd = () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296; };
const entre = (a, b) => a + rnd() * (b - a);
const inteiro = (a, b) => Math.floor(entre(a, b + 1));
const um = (l) => l[Math.floor(rnd() * l.length)];

const { rows: [user] } = await q('select client_id from users where email = $1', [email]);
if (!user?.client_id) { console.error(`Usuário ${email} não encontrado (rode pnpm seed:demo-user).`); process.exit(1); }
const clientId = user.client_id;

// ---------- limpeza do que o seed criou antes ----------
const { rows: velhos } = await q(`select id from rastreadores where modelo = 'SEED-DEMO'`);
const rids = velhos.map((r) => r.id);
if (rids.length) {
  for (const t of ['posicoes', 'ultima_posicao', 'rastreador_comunicacao', 'instalacoes', 'eventos']) await q(`delete from ${t} where rastreador_id = any($1)`, [rids]);
  await q('delete from rastreadores where id = any($1)', [rids]);
}
const { rows: ativosVelhos } = await q(`select id from assets where client_id = $1 and dados->>'seed' = 'demo-frota'`, [clientId]);
const aids = ativosVelhos.map((r) => r.id);
if (aids.length) {
  await q('delete from viagens where asset_id = any($1)', [aids]);
  await q('delete from asset_group_members where asset_id = any($1)', [aids]);
  await q('delete from assets where id = any($1)', [aids]);
}
await q(`delete from asset_groups where client_id = $1 and name like '% (seed)'`, [clientId]);
await q(`delete from motoristas where client_id = $1 and dados->>'seed' = 'demo-frota'`, [clientId]);

// ---------- cadastro ----------
const BASES = [
  { nome: 'Recife (PE)', lat: -8.0476, lon: -34.8770, n: 24 },
  { nome: 'Fortaleza (CE)', lat: -3.7319, lon: -38.5267, n: 16 },
  { nome: 'Salvador (BA)', lat: -12.9714, lon: -38.5014, n: 12 },
  { nome: 'João Pessoa (PB)', lat: -7.1195, lon: -34.8450, n: 8 },
];
const ICONES = ['07-furgao-grande', '06-furgao-pequeno', '04-picape-cabine-dupla', '05-picape-cabine-simples', '09-vuc', '10-toco-4x2', '02-sedan', '03-suv'];
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Henrique', 'Íris', 'João', 'Karina', 'Lucas', 'Marta', 'Nelson', 'Otávio', 'Paula', 'Rafael', 'Sílvia', 'Tiago', 'Vera'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Barbosa'];
const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const placa = () => `${um(LETRAS)}${um(LETRAS)}${um(LETRAS)}${inteiro(0, 9)}${um(LETRAS)}${inteiro(0, 9)}${inteiro(0, 9)}`;

const motoristas = [];
for (let i = 0; i < 44; i++) {
  const { rows: [m] } = await q(`insert into motoristas (client_id, nome, cnh_categoria, dados) values ($1, $2, $3, '{"seed":"demo-frota"}') returning id`,
    [clientId, `${um(NOMES)} ${um(SOBRENOMES)}`, um(['B', 'C', 'D', 'E'])]);
  motoristas.push(m.id);
}

const veiculos = [];
const placas = new Set();
const inicioInstalacao = new Date(Date.now() - 30 * 86400_000);
for (const base of BASES) {
  const { rows: [g] } = await q('insert into asset_groups (client_id, name) values ($1, $2) returning id', [clientId, `${base.nome} (seed)`]);
  base.grupo = g.id;
  for (let i = 0; i < base.n; i++) {
    let p; do p = placa(); while (placas.has(p)); placas.add(p);
    const { rows: [a] } = await q(`insert into assets (client_id, plate, status, icone, motorista_id, dados) values ($1, $2, 'ativo', $3, $4, '{"seed":"demo-frota"}') returning id`,
      [clientId, p, um(ICONES), motoristas.length ? motoristas.pop() : null]);
    await q('insert into asset_group_members (client_id, group_id, asset_id) values ($1, $2, $3)', [clientId, g.id, a.id]);
    const imei = `99${String(Date.now()).slice(-6)}${String(veiculos.length).padStart(7, '0')}`;
    const { rows: [r] } = await q(`insert into rastreadores (imei, modelo, protocolo, status) values ($1, 'SEED-DEMO', 'gt06', 'ativo') returning id`, [imei]);
    await q(`insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, tecnico) values ($1, $2, $3, 'principal', $4, 'Seed demo')`,
      [clientId, r.id, a.id, inicioInstalacao]);
    // perfil: quanto o veículo costuma rodar (alguns quase parados)
    veiculos.push({ asset: a.id, rast: r.id, base, perfil: rnd() < 0.12 ? 0.25 : entre(0.7, 0.97), lat: base.lat + entre(-0.04, 0.04), lon: base.lon + entre(-0.04, 0.04) });
  }
}

// estado de agora: em movimento 30%, parado ligado 20%, desligado 30%, sem sinal 10%, sem GPS 2 veículos, aguardando 2
const ordem = [...veiculos].sort(() => rnd() - 0.5);
ordem.forEach((v, i) => {
  const f = i / ordem.length;
  v.agora = i < 2 ? 'aguardando' : i < 4 ? 'sem_gps' : f < 0.14 ? 'sem_sinal' : f < 0.44 ? 'mov' : f < 0.64 ? 'par' : 'des';
});

// ---------- posições ----------
const FUSO_H = 3; // Recife = UTC-3
const agora = new Date();
const hojeLocal = new Date(agora.getTime() - FUSO_H * 3600_000); // relógio local em UTC
const diaUtc0 = (d) => Date.UTC(hojeLocal.getUTCFullYear(), hojeLocal.getUTCMonth(), hojeLocal.getUTCDate() - d) + FUSO_H * 3600_000; // 0h local
const linhas = []; // [rast, tpid, asset, t(ms), lat, lon, vel, ign]
let tpid = 1;
const ponto = (v, t, vel, ign) => linhas.push([v.rast, tpid++, v.asset, t, v.lat, v.lon, vel, ign]);

function trajeto(v, t0, minutos) {
  let rumo = entre(0, 2 * Math.PI);
  let t = t0;
  for (let m = 0; m < minutos && t < agora.getTime(); m++) {
    const vel = Math.max(8, Math.min(95, entre(25, 75) + entre(-15, 15)));
    rumo += entre(-0.5, 0.5);
    // puxa de volta para a base quando se afasta demais (≈ 25 km)
    const dLat = v.base.lat - v.lat, dLon = v.base.lon - v.lon;
    if (Math.hypot(dLat, dLon) > 0.22) rumo = Math.atan2(dLat, dLon) + entre(-0.3, 0.3);
    const km = vel / 60;
    v.lat += (km / 111) * Math.sin(rumo);
    v.lon += (km / (111 * Math.cos((v.lat * Math.PI) / 180))) * Math.cos(rumo);
    ponto(v, t, Math.round(vel), true);
    t += 60_000;
  }
  ponto(v, t, 0, true);
  ponto(v, t + 120_000, 0, false); // desliga
  return t + 120_000;
}

for (const v of veiculos) {
  if (v.agora === 'aguardando') continue;
  for (let d = 7; d >= 0; d--) {
    const inicioDia = diaUtc0(d);
    const fimDeSemana = [0, 6].includes(new Date(inicioDia - FUSO_H * 3600_000).getUTCDay());
    const sinalAte = v.agora === 'sem_sinal' ? agora.getTime() - inteiro(20, 60) * 3600_000 : Infinity;
    if (inicioDia > sinalAte) break;
    // estacionado: um pacote a cada 2 h (ignição desligada)
    for (let h = 0; h < 24; h += 2) { const t = inicioDia + h * 3600_000 + inteiro(0, 30) * 60_000; if (t < agora.getTime() && t < sinalAte) ponto(v, t, 0, false); }
    if (rnd() > v.perfil * (fimDeSemana ? 0.45 : 1)) continue;
    let t = inicioDia + entre(6.5, 9) * 3600_000;
    for (let k = inteiro(1, 3); k > 0 && t < agora.getTime() && t < sinalAte; k--) {
      t = trajeto(v, t, inteiro(20, 85));
      t += inteiro(30, 120) * 60_000; // parada entre entregas
    }
  }
}
// fecha o "agora" de cada veículo
for (const v of veiculos) {
  const t = agora.getTime();
  if (v.agora === 'mov') { trajeto(v, t - 15 * 60_000, 14); linhas.pop(); linhas.pop(); ponto(v, t - 20_000, inteiro(30, 70), true); }
  else if (v.agora === 'par') { ponto(v, t - inteiro(1, 6) * 60_000, 0, true); }
  else if (v.agora === 'des') { ponto(v, t - inteiro(5, 40) * 60_000, 0, false); }
}
linhas.sort((a, b) => a[3] - b[3]);

console.log(`Inserindo ${linhas.length} posições…`);
const ultimaPorRast = new Map();
for (let i = 0; i < linhas.length; i += 5000) {
  const lote = linhas.slice(i, i + 5000);
  const col = (k) => lote.map((l) => l[k]);
  const { rows } = await q(
    `insert into posicoes (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh, ignition)
     select r, tp, $1, a, to_timestamp(t / 1000.0), to_timestamp(t / 1000.0), true, st_setsrid(st_makepoint(lon, lat), 4326), vel, ign
     from unnest($2::uuid[], $3::bigint[], $4::uuid[], $5::float8[], $6::float8[], $7::float8[], $8::float8[], $9::bool[]) as x(r, tp, a, t, lat, lon, vel, ign)
     returning id, rastreador_id, fix_time`,
    [clientId, col(0), col(1), col(2), col(3), col(4), col(5), col(6), col(7)],
  );
  for (const r of rows) { const u = ultimaPorRast.get(r.rastreador_id); if (!u || r.fix_time > u.fix_time) ultimaPorRast.set(r.rastreador_id, r); }
}

// última posição e comunicação
for (const v of veiculos) {
  const u = ultimaPorRast.get(v.rast);
  if (!u) continue;
  const l = linhas.filter((x) => x[0] === v.rast).at(-1);
  await q(`insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition)
           values ($1, $2, $3, $4, $5, st_setsrid(st_makepoint($6, $7), 4326), $8, $9)`,
    [v.rast, v.asset, clientId, u.id, u.fix_time, l[5], l[4], l[6], l[7]]);
  // sem GPS: o aparelho segue falando agora, mas a última posição válida é de mais de 6 h
  const pacote = v.agora === 'sem_gps' ? agora : u.fix_time;
  const valida = v.agora === 'sem_gps' ? new Date(agora.getTime() - 9 * 3600_000) : u.fix_time;
  await q(`insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em, ultima_posicao_valida_em, ultimos_atributos)
           values ($1, $2, $3, $4, $5, $6)`, [v.rast, v.asset, clientId, pacote, valida, JSON.stringify({ ignition: l[7], power: 12.6, sat: 9 })]);
}

// ---------- viagens (módulo Viagens) ----------
let nv = 0;
for (let d = 7; d >= 0; d--) {
  for (const v of veiculos.filter(() => rnd() < 0.35)) {
    const ini = new Date(diaUtc0(d) + entre(7, 15) * 3600_000);
    if (ini > agora) continue;
    const fim = new Date(ini.getTime() + entre(1, 4) * 3600_000);
    const aberta = d === 0 && fim > agora;
    await q(`insert into viagens (client_id, tipo, nome, asset_id, status, iniciada_em, encerrada_em, carga) values ($1, 'externo', $2, $3, $4, $5, $6, $7)`,
      [clientId, `Entrega ${String(++nv).padStart(4, '0')}`, v.asset, aberta ? 'em_andamento' : 'concluida', ini, aberta ? null : fim, um(['Bebidas', 'Eletrônicos', 'Alimentos', 'Material de construção', null])]);
  }
}

console.log('Rematerializando uso_5min…');
await q(`call refresh_continuous_aggregate('uso_5min', now() - interval '10 days', now() - interval '10 minutes')`);

const cont = veiculos.reduce((c, v) => ((c[v.agora] = (c[v.agora] || 0) + 1), c), {});
console.log(`Pronto: ${veiculos.length} veículos em ${BASES.length} grupos, ${linhas.length} posições, ${nv} viagens. Agora:`, cont);
await pool.end();
