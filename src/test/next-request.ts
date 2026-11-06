type WrittenCookie = { name: string; value: string; options: object };

const jar = new Map<string, string>();
let requestHeaders = new Headers();
let written: WrittenCookie[] = [];

export function setNextRequest({
  cookies: sent = {},
  headers: sentHeaders = {},
}: {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  jar.clear();
  for (const [name, value] of Object.entries(sent)) jar.set(name, value);
  requestHeaders = new Headers(sentHeaders);
  written = [];
}

export function writtenCookies() {
  return written;
}

export async function cookies() {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options: object = {}) => {
      written.push({ name, value, options });
    },
  };
}

export async function headers() {
  return requestHeaders;
}