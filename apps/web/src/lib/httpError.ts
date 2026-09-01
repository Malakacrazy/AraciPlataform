// Extraído de revisão de qualidade de código: api.ts, portalApi.ts,
// publicApi.ts, collaboratorPortalApi.ts, whiteboardGuestPortalApi.ts e
// leadApi.ts tinham cada um sua própria classe de erro, byte a byte
// idêntica -- só o nome mudava. Os seis arquivos continuam existindo
// separados de propósito (cada um fala com uma superfície de auth
// diferente: proxy BFF, token no link público, cookie de sessão de
// portal, header de sessão de colaborador/convidado), só a forma do erro
// em si não precisava ser reinventada seis vezes. Cada arquivo continua
// exportando seu próprio nome (ApiError, PortalApiError, etc.) como um
// re-export desta classe, então nenhum `instanceof` existente precisa
// mudar.
export class HttpApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
