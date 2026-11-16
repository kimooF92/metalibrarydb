import net from "net";
import dns from "dns";

export function isPrivateIp(ip: string): boolean {
  const clean = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  const ipVer = net.isIP(clean);
  if (ipVer === 4) {
    const parts = clean.split(".").map(Number);
    const [o1, o2] = parts;
    if (o1 === 127) return true; // 127.0.0.0/8 (Loopback)
    if (o1 === 10) return true; // 10.0.0.0/8 (Private)
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16 (Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 (Private)
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 (Link-local cloud metadata)
    if (o1 === 0 || o1 >= 224) return true; // Current network, multicast, or reserved
    return false;
  }
  if (ipVer === 6) {
    if (clean === "::1" || clean === "::") return true; // Loopback or unspecified
    if (/^0*(:0*)*:1$/.test(clean)) return true; // Expanded loopback
    if (/^0*(:0*)*:0$/.test(clean)) return true; // Expanded unspecified
    if (clean.startsWith("fc") || clean.startsWith("fd")) return true; // ULA / Private (fc00::/7)
    if (/^fe[89ab]/i.test(clean)) return true; // Link-local (fe80::/10)
    if (/^fe[c-f]/i.test(clean)) return true; // Site-local (fec0::/10)
    if (clean.includes("::ffff:")) return true; // IPv4-mapped IPv6
    return false;
  }
  return false;
}

/**
 * Validates that an IP or hostname is not in a private, loopback, or cloud-metadata subnet.
 * Protects against IPv4 and IPv6 SSRF attacks (BUG-08 mitigation).
 */
export function isSafePublicUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase().trim();
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".onion") ||
      hostname.endsWith(".lan") ||
      hostname.endsWith(".home") ||
      hostname.endsWith(".corp") ||
      hostname.endsWith(".nip.io") ||
      hostname.endsWith(".sslip.io") ||
      hostname.endsWith(".localtest.me")
    ) {
      return false;
    }

    const cleanHost =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    const ipVer = net.isIP(cleanHost);
    if (ipVer !== 0) {
      return !isPrivateIp(cleanHost);
    }

    // Reject non-IP hostnames without a dot (e.g. internal machine names like 'admin', 'metadata')
    if (!hostname.includes(".")) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Async DNS-resolving SSRF validator to protect against DNS rebinding attacks.
 */
export async function isSafePublicUrlAsync(urlString: string): Promise<boolean> {
  if (!isSafePublicUrl(urlString)) return false;
  try {
    const url = new URL(urlString);
    const { address } = await dns.promises.lookup(url.hostname);
    if (isPrivateIp(address)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

