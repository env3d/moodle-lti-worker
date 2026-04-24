import { JWT_HEADER } from "../constants.js";
import { base64url } from "../utils/encoding.js";

export async function signJwt(payload, privateKeyPem) {
  if (!privateKeyPem || typeof privateKeyPem !== "string" || !privateKeyPem.trim()) {
    throw new Error("Missing LTI private key configuration. Set LTI_PRIVATE_KEY in worker environment variables.");
  }

  const pemContents = privateKeyPem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encodedHeader = base64url(JWT_HEADER);
  const encodedPayload = base64url(payload);
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, data);
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
