import { createHmac } from "crypto";

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function createTiptapHs256Jwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 60 * 60,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}
