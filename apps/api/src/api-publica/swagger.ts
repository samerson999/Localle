import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ApiPublicaModule } from './api-publica.module';
import { ESCOPOS } from './auth/escopos';
import { LIMITES } from './auth/limitador';

const GUIA = `API de consulta dos dados da sua frota. Somente leitura.

**Autenticação** — a chave de acesso (64 caracteres) é fornecida pela equipe da plataforma. Envie em todas as chamadas:
\`Authorization: Bearer <chave>\`. Revogação e reset valem em até 1 minuto.

**Escopos** — cada chave acessa só os grupos marcados nela (${Object.keys(ESCOPOS).join(', ')}), e só os módulos do
seu contrato.

**Paginação** — listas devolvem \`{ dados, proximoCursor }\`. Para a próxima página, repita a chamada com
\`cursor=<proximoCursor>\`; \`null\` indica a última. \`limite\` padrão 100, máximo 500 (posições: padrão 500, máximo
1.000). Cadastros (grupos, motoristas, cercas, pneus…) vêm inteiros numa página.

**Períodos** — séries temporais (posições, eventos, alertas, viagens, abastecimentos…) exigem \`de\` e \`ate\` em ISO 8601:
até 31 dias por chamada, 7 dias para posições de um veículo. Relatórios da frota: até 50 \`veiculoIds\` com 31 dias, ou a
frota toda com 7 dias.

**Limites** — ${LIMITES.cliente.porMinuto} requisições por minuto e ${LIMITES.cliente.porDia.toLocaleString('pt-BR')} por dia, por
chave. Cabeçalhos \`X-RateLimit-Limite\`, \`X-RateLimit-Restante\` e \`X-RateLimit-Reinicio\`; acima do limite, \`429\`
com \`Retry-After\`.

**Erros** — \`{ statusCode, codigo, message }\`. Informe o cabeçalho \`X-Request-Id\` ao suporte.

**Datas** em ISO 8601 (UTC).`;

/**
 * Só rotas `/v1`, e nenhuma da chave mestra (`/v1/clientes...`) — decisão de 23/11: o Swagger não menciona a chave
 * mestra. As controllers usam o mesmo handler para os dois caminhos, então o corte é no documento pronto. O filtro por
 * `/v1/` é a segunda barreira: a gestão das chaves (rota interna) já sai por `@ApiExcludeController()`.
 */
export function semChaveMestra(doc: OpenAPIObject): OpenAPIObject {
  const paths = Object.fromEntries(Object.entries(doc.paths).filter(([p]) => p.startsWith('/v1/') && !p.startsWith('/v1/clientes')));
  return { ...doc, paths };
}

export function montarDocumento(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('API de consulta')
    .setDescription(GUIA)
    .setVersion('v1')
    .addServer(process.env.API_PUBLICA_BASE ?? '/api')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: '64 caracteres', description: 'Chave de acesso fornecida pela equipe da plataforma' })
    .addSecurityRequirements('bearer')
    .build();
  return semChaveMestra(SwaggerModule.createDocument(app, config, { include: [ApiPublicaModule] }));
}

/** `/v1/docs` (UI) e `/v1/openapi.json` — no app, `/api/v1/...` pelo proxy do container web. */
export function registrarSwagger(app: INestApplication) {
  SwaggerModule.setup('v1/docs', app, montarDocumento(app), {
    jsonDocumentUrl: 'v1/openapi.json',
    customSiteTitle: 'API de consulta',
  });
}
