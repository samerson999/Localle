import { ServiceUnavailableException } from '@nestjs/common';

/**
 * 503 esperado: pede ao remetente que reenvie depois (hoje, posição/evento do Forwarding do Traccar ainda com id 0).
 * O filtro global não registra cada um como erro — quem lança resume no próprio log.
 */
export class ReenvioPedidoException extends ServiceUnavailableException {}
