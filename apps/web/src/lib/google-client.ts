// Helpers de navegador para autorização incremental (fora do login
// principal do NextAuth) + Google Picker (Drive) + listagem de eventos do
// Calendar. Só usados dentro de componentes "use client" — nunca chamados
// durante SSR.
//
// Por que fora do NextAuth: a decisão já registrada em
// especificacao-tecnica.md é não pedir escopo de Drive/Calendar no login
// inicial, só quando o usuário ativa aquele recurso. O Google Identity
// Services (GIS) resolve isso sem tocar na sessão do NextAuth — pede um
// token de acesso avulso, de vida curta, só com o escopo pedido, e não
// devolve refresh token (fluxo implícito, de propósito: nada fica
// armazenado, o token é usado na hora e descartado).
//
// Por que Picker só para Drive: a Picker API do Google
// (developers.google.com/picker) cobre Drive/Docs/Fotos/etc., mas não tem
// nenhuma view para Calendar — não existe "Calendar Picker". Vínculo de
// evento usa a Calendar API direto (listUpcomingCalendarEvents) para uma
// lista simples construída aqui mesmo.

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GooglePickerDocument {
  id: string;
  name: string;
  url: string;
}

interface GooglePickerData {
  action: string;
  docs?: GooglePickerDocument[];
}

interface GooglePickerView {
  setIncludeFolders: (value: boolean) => GooglePickerView;
}

interface GooglePickerInstance {
  setVisible: (visible: boolean) => void;
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (id: string) => GooglePickerBuilder;
  setCallback: (callback: (data: GooglePickerData) => void) => GooglePickerBuilder;
  build: () => GooglePickerInstance;
}

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        hint?: string;
        callback: (response: GoogleTokenResponse) => void;
      }) => GoogleTokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => GooglePickerBuilder;
    DocsView: new () => GooglePickerView;
    Action: { PICKED: string; CANCEL: string };
  };
}

interface GapiGlobal {
  load: (api: string, callback: () => void) => void;
}

declare global {
  interface Window {
    google?: GoogleGlobal;
    gapi?: GapiGlobal;
  }
}

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
// calendar.events (leitura E escrita), não mais só .readonly -- upgrade
// deliberado pra cobrir tanto listar/vincular um evento existente quanto
// criar um novo (ver createCalendarEvent) com um escopo só, em vez de
// pedir consentimento duas vezes pra permissões que se sobrepõem.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
// gmail.readonly é classificado pelo Google como escopo "restrito" (não
// só "sensível", como calendar.events) -- exige verificação CASA de
// segurança pra sair do modo de teste (até 100 usuários de teste) e
// ficar disponível pra qualquer conta Google real. Não bloqueia o
// desenvolvimento agora, mas é uma etapa extra antes de produção que
// drive.file/calendar.events não têm.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
// Escopo separado de GMAIL_SCOPE de propósito -- compor/enviar é uma
// ação de maior confiança (manda e-mail de verdade em nome da pessoa)
// que só listar/vincular uma mensagem já existente. Pedir os dois juntos
// sempre que qualquer um dos dois botões é clicado violaria o "least-
// privilege" que já é a filosofia declarada deste arquivo. gmail.send
// (diferente de gmail.readonly) é classificado como escopo "sensível",
// não "restrito" -- não exige a verificação CASA mais pesada.
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(script);
  });
}

export async function getGoogleAccessToken(scope: string, loginHint?: string): Promise<string> {
  await loadScriptOnce("https://accounts.google.com/gsi/client");

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.");
  }
  if (!window.google) {
    throw new Error("Google Identity Services não carregou.");
  }
  const google = window.google;

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      hint: loginHint,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Autorização do Google cancelada ou falhou."));
          return;
        }
        resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export interface PickedDriveFile {
  externalId: string;
  url: string;
  title: string;
}

export async function openDrivePicker(accessToken: string): Promise<PickedDriveFile | null> {
  await loadScriptOnce("https://apis.google.com/js/api.js");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GOOGLE_API_KEY não configurado.");
  }
  if (!window.gapi) {
    throw new Error("gapi não carregou.");
  }
  await new Promise<void>((resolve) => window.gapi!.load("picker", () => resolve()));

  if (!window.google) {
    throw new Error("Google Picker não carregou.");
  }
  const google = window.google;
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;

  return new Promise((resolve) => {
    const view = new google.picker.DocsView().setIncludeFolders(true);
    let builder = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey);
    if (appId) {
      builder = builder.setAppId(appId);
    }
    const picker = builder
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
          const doc = data.docs[0];
          resolve({ externalId: doc.id, url: doc.url, title: doc.name });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

interface GoogleCalendarEventItem {
  id: string;
  htmlLink: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
}

export interface CalendarEventSummary {
  externalId: string;
  url: string;
  title: string;
  start: string;
}

export async function listUpcomingCalendarEvents(accessToken: string): Promise<CalendarEventSummary[]> {
  const params = new URLSearchParams({
    maxResults: "10",
    orderBy: "startTime",
    singleEvents: "true",
    timeMin: new Date().toISOString(),
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error("Não foi possível listar os eventos do Calendar.");
  }
  const body: { items?: GoogleCalendarEventItem[] } = await res.json();
  return (body.items ?? []).map((event) => ({
    externalId: event.id,
    url: event.htmlLink,
    title: event.summary?.trim() || "Evento sem título",
    start: event.start?.dateTime ?? event.start?.date ?? "",
  }));
}

export interface NewCalendarEvent {
  title: string;
  description?: string;
  // datetime-local do <input> (sem timezone) -- manda como está pro
  // Calendar API junto do timeZone do navegador, em vez de converter pra
  // UTC na mão (a própria API já resolve o timezone informado).
  startIso: string;
  endIso: string;
}

// Cria um evento de verdade (events.insert), sem convidados -- diferente
// do picker acima, que só lista o que já existe. Não usa a Picker API
// (não existe "Calendar Picker", ver nota do topo do arquivo): é uma
// chamada direta à Calendar API, criando e devolvendo o evento no mesmo
// formato de CalendarEventSummary pra virar um OfficeLink igual a
// qualquer evento vinculado.
// O valor de um <input type="datetime-local"> vem sem segundos
// ("2026-08-26T20:59"), mas a Calendar API exige RFC3339 completo
// (com segundos) em dateTime -- sem isso ela responde 400. Achado real
// testando a criação de evento de verdade.
function withSeconds(dateTimeLocal: string): string {
  return dateTimeLocal.length === 16 ? `${dateTimeLocal}:00` : dateTimeLocal;
}

export async function createCalendarEvent(
  accessToken: string,
  input: NewCalendarEvent,
): Promise<CalendarEventSummary> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.title,
      description: input.description || undefined,
      start: { dateTime: withSeconds(input.startIso), timeZone },
      end: { dateTime: withSeconds(input.endIso), timeZone },
    }),
  });
  if (!res.ok) {
    throw new Error("Não foi possível criar o evento no Calendar.");
  }
  const event: GoogleCalendarEventItem = await res.json();
  return {
    externalId: event.id,
    url: event.htmlLink,
    title: event.summary?.trim() || "Evento sem título",
    start: event.start?.dateTime ?? event.start?.date ?? "",
  };
}

interface GoogleGmailMessageListItem {
  id: string;
  threadId: string;
}

interface GoogleGmailHeader {
  name: string;
  value: string;
}

interface GoogleGmailMessageDetail {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: { headers?: GoogleGmailHeader[] };
}

export interface GmailMessageSummary {
  externalId: string;
  url: string;
  title: string;
  snippet: string;
}

// Sem Picker pra Gmail (mesma limitação do Calendar -- a Picker API não
// cobre Gmail). users.messages.list só devolve {id, threadId}, sem
// assunto nem snippet -- por isso um GET por mensagem com
// format=metadata (só cabeçalho Subject, não o corpo do e-mail).
export async function listRecentGmailMessages(accessToken: string): Promise<GmailMessageSummary[]> {
  const listParams = new URLSearchParams({ maxResults: "10" });
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    throw new Error("Não foi possível listar as mensagens do Gmail.");
  }
  const listBody: { messages?: GoogleGmailMessageListItem[] } = await listRes.json();
  const items = listBody.messages ?? [];

  const detailParams = new URLSearchParams({ format: "metadata", metadataHeaders: "Subject" });
  const details = await Promise.all(
    items.map(async (item) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?${detailParams}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        throw new Error("Não foi possível carregar uma mensagem do Gmail.");
      }
      return (await res.json()) as GoogleGmailMessageDetail;
    }),
  );

  return details.map((msg) => {
    const subject = msg.payload?.headers?.find((h) => h.name === "Subject")?.value;
    return {
      // threadId (não o id da mensagem) é o formato real do link
      // permanente do Gmail -- a API não devolve um "htmlLink" pronto
      // como a Calendar API devolve pra eventos.
      externalId: msg.id,
      url: `https://mail.google.com/mail/u/0/#all/${msg.threadId}`,
      title: subject?.trim() || "Mensagem sem assunto",
      snippet: msg.snippet ?? "",
    };
  });
}

export interface NewGmailMessage {
  to: string;
  subject: string;
  body: string;
}

// btoa só lida com Latin1 -- sem o encodeURIComponent/unescape, qualquer
// acento (comum em assunto/corpo em português) quebraria o base64. O
// Gmail exige base64URL (RFC 4648 §5: -_ em vez de +/, sem padding =),
// não o base64 padrão que btoa devolve.
function toBase64Url(input: string): string {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Compor e mandar de verdade (users.messages.send), diferente de
// listRecentGmailMessages acima, que só lista o que já existe na caixa.
// Usa gmail.send (GMAIL_SEND_SCOPE), não gmail.readonly -- ver
// comentário do escopo no topo do arquivo. Devolve no mesmo formato de
// GmailMessageSummary pra virar um OfficeLink igual a uma mensagem
// vinculada por lá.
// Cabeçalhos de e-mail exigem US-ASCII (RFC 2822) -- diferente do corpo,
// que já é lido com o charset do Content-Type. Sem isso, um Subject com
// acento (comum em português) chega corrompido no destinatário mesmo com
// o corpo certo. Achado real testando envio de verdade.
function encodeMimeHeaderWord(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(value)))}?=`;
}

export async function sendGmailMessage(accessToken: string, input: NewGmailMessage): Promise<GmailMessageSummary> {
  const raw = toBase64Url(
    [
      `To: ${input.to}`,
      `Subject: ${encodeMimeHeaderWord(input.subject)}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      input.body,
    ].join("\r\n"),
  );
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    throw new Error("Não foi possível enviar a mensagem pelo Gmail.");
  }
  const sent: { id: string; threadId: string } = await res.json();
  return {
    externalId: sent.id,
    url: `https://mail.google.com/mail/u/0/#all/${sent.threadId}`,
    title: input.subject.trim() || "Mensagem sem assunto",
    snippet: input.body.slice(0, 140),
  };
}
