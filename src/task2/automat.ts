import { writeFile } from "node:fs/promises";

export async function getToken(
  authority: string,
  audience: string,
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<string> {
  // Implementation for getting token
  if (authority.endsWith("/")) {
    authority = authority.slice(0, -1);
  }
  const tokenUrl = `${authority}/oauth/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: audience,
      scope: scope,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get token: ${response.status} ${response.statusText}`,
    );
  }

  const result = await response.json();

  if (typeof result.access_token !== "string") {
    throw new Error("Token response does not contain access_token");
  }

  return result.access_token;
}

export async function issuePass(
  url: string,
  token: string,
  name: string,
  document: string,
): Promise<void> {
  // Implementation for issuing pass
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      document
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to issue pass: ${response.status} ${response.statusText}`,
    );
  }

  const location = response.headers.get("Location");
  if (!location) {
    throw new Error("Response does not contain Location header");
  }

  const passId = location.split("/").filter(Boolean).pop();
  if (!passId) {
    throw new Error("Failed to extract pass ID from Location header");
  }

  const imageData = await response.arrayBuffer();
  const imageBuffer = Buffer.from(imageData);
  await writeFile(`${passId}.png`, imageBuffer);
}
