export type TrustProxySetting = boolean | number | string;

/**
 * Express `trust proxy` value.
 *
 * Behind a reverse proxy or load balancer, set TRUST_PROXY to the number of
 * proxy hops (for example "1") or to a subnet/name list (for example
 * "loopback" or "10.0.0.0/8"). Only then does Express use X-Forwarded-For for
 * req.ip and X-Forwarded-Proto for req.protocol, which the rate limiter and
 * secure cookies rely on.
 */
export function trustProxyValue(): TrustProxySetting {
  const raw = process.env.TRUST_PROXY?.trim();

  if (!raw || raw === "false") {
    return false;
  }

  if (raw === "true") {
    return true;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  return raw;
}
