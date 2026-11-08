import net from "net";

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
      hostname.endsWith(".corp")
    ) {
      return false;
    }

    const cleanHost =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    const ipVer = net.isIP(cleanHost);
    if (ipVer === 4) {
      const parts = cleanHost.split(".").map(Number);
      const [o1, o2] = parts;
      if (o1 === 127) return false; // 127.0.0.0/8 (Loopback)
      if (o1 === 10) return false; // 10.0.0.0/8 (Private)
      if (o1 === 192 && o2 === 168) return false; // 192.168.0.0/16 (Private)
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false; // 172.16.0.0/12 (Private)
      if (o1 === 169 && o2 === 254) return false; // 169.254.0.0/16 (Link-local cloud metadata)
      if (o1 === 0 || o1 >= 224) return false; // Current network, multicast, or reserved
      return true;
    }

    if (ipVer === 6) {
      if (cleanHost === "::1" || cleanHost === "::") return false; // Loopback or unspecified
      if (/^0*(:0*)*:1$/.test(cleanHost)) return false; // Expanded loopback
      if (/^0*(:0*)*:0$/.test(cleanHost)) return false; // Expanded unspecified
      if (cleanHost.startsWith("fc") || cleanHost.startsWith("fd")) return false; // ULA / Private (fc00::/7)
      if (/^fe[89ab]/i.test(cleanHost)) return false; // Link-local (fe80::/10)
      if (/^fe[c-f]/i.test(cleanHost)) return false; // Site-local (fec0::/10)
      if (cleanHost.includes("::ffff:")) return false; // IPv4-mapped IPv6
      return true;
    }

    // Reject non-IP hostnames without a dot (e.g. internal machine names like 'admin', 'metadata')
    if (!hostname.includes(".")) return false;

    return true;
  } catch {
    return false;
  }
}

