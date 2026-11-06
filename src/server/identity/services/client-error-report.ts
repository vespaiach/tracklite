export function maskIp(ip: string) {
  const ipv4 = ip.replace(/^::ffff:/i, "");
  if (ipv4.includes(".")) return ipv4.replace(/\.\d+$/, ".0");
  return `${ipv6Groups(ip).slice(0, 3).join(":")}::`;
}

function ipv6Groups(ip: string) {
  const [head, tail] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const zeroGroups = Array<string>(8 - headGroups.length - tailGroups.length).fill("0");
  return [...headGroups, ...zeroGroups, ...tailGroups];
}

const maxUserAgentLength = 300;

const browsers: [pattern: RegExp, name: string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
];

export function describeUserAgent(userAgent: string) {
  return {
    browser: browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Other",
    device: deviceType(userAgent),
    userAgent: userAgent.slice(0, maxUserAgentLength),
  };
}

function deviceType(userAgent: string): "desktop" | "mobile" | "tablet" {
  if (/iPad|Tablet/.test(userAgent) || (/Android/.test(userAgent) && !/Mobile/.test(userAgent))) {
    return "tablet";
  }
  if (/Mobi|iPhone|Android/.test(userAgent)) return "mobile";
  return "desktop";
}