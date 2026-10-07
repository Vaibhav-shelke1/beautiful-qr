export interface WifiInput {
  ssid: string;
  password?: string;
  encryption?: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
}

export interface EmailInput {
  to: string;
  subject?: string;
  body?: string;
}

export interface SmsInput {
  phone: string;
  message?: string;
}

export interface GeoInput {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface VCardInput {
  name: string;
  organization?: string;
  title?: string;
  phone?: string;
  email?: string;
  url?: string;
  address?: string;
  note?: string;
}

export function url(value: string): string {
  return value;
}

export function wifi({ ssid, password, encryption = "WPA", hidden = false }: WifiInput): string {
  const fields = [`T:${encryption}`, `S:${escapeWifi(ssid)}`];
  if (encryption !== "nopass" && password) fields.push(`P:${escapeWifi(password)}`);
  if (hidden) fields.push("H:true");
  return `WIFI:${fields.join(";")};;`;
}

export function email({ to, subject, body }: EmailInput): string {
  const query = new URLSearchParams();
  if (subject) query.set("subject", subject);
  if (body) query.set("body", body);
  const search = query.toString();
  return `mailto:${to}${search ? `?${search}` : ""}`;
}

export function sms({ phone, message }: SmsInput): string {
  return message ? `SMSTO:${phone}:${message}` : `SMSTO:${phone}`;
}

export function phone(value: string): string {
  return `tel:${value}`;
}

export function geo({ latitude, longitude, altitude }: GeoInput): string {
  return `geo:${latitude},${longitude}${altitude === undefined ? "" : `,${altitude}`}`;
}

export function vcard(input: VCardInput): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCard(input.name)}`, `N:${escapeVCard(input.name)}`];

  if (input.organization) lines.push(`ORG:${escapeVCard(input.organization)}`);
  if (input.title) lines.push(`TITLE:${escapeVCard(input.title)}`);
  if (input.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(input.phone)}`);
  if (input.email) lines.push(`EMAIL:${escapeVCard(input.email)}`);
  if (input.url) lines.push(`URL:${escapeVCard(input.url)}`);
  if (input.address) lines.push(`ADR:;;${escapeVCard(input.address)}`);
  if (input.note) lines.push(`NOTE:${escapeVCard(input.note)}`);

  lines.push("END:VCARD");
  return lines.join("\n");
}

function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function escapeVCard(value: string): string {
  return value.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
}
