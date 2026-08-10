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
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

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
