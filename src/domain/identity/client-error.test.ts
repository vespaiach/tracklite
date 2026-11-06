import { expect, it } from "vitest";
import { describeUserAgent, maskIp } from "./client-error";

it("SEC-007.7: an IPv4 address keeps 3 octets, a v4-mapped one is masked as IPv4, an IPv6 one keeps 3 groups", () => {
  expect(maskIp("203.0.113.57")).toBe("203.0.113.0");
  expect(maskIp("::ffff:203.0.113.57")).toBe("203.0.113.0");
  expect(maskIp("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::");
  expect(maskIp("2001:db8::1")).toBe("2001:db8:0::");
});

it("OPS-008.3: a browser identification is named by browser and device and cut to 300 characters", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const ipad =
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const androidTablet =
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
  const edge = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0${"x".repeat(1000)}`;

  expect(describeUserAgent(iphone)).toEqual({ browser: "Safari", device: "mobile", userAgent: iphone });
  expect(describeUserAgent(ipad)).toMatchObject({ browser: "Safari", device: "tablet" });
  expect(describeUserAgent(androidTablet)).toMatchObject({ browser: "Chrome", device: "tablet" });
  expect(
    describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"),
  ).toMatchObject({ browser: "Firefox", device: "desktop" });
  expect(describeUserAgent("")).toEqual({ browser: "Other", device: "desktop", userAgent: "" });

  const described = describeUserAgent(edge);
  expect(described).toMatchObject({ browser: "Edge", device: "desktop" });
  expect(described.userAgent).toBe(edge.slice(0, 300));
});