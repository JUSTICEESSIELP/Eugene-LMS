import { expect, type APIRequestContext, type Playwright } from "@playwright/test";

/**
 * An API context authenticated with a Bearer token rather than the session
 * cookie.
 *
 * The cookie is issued `Secure`, which is correct — but it means Playwright's
 * request context stores it and then declines to send it back over plain
 * `http://`. Specs driven purely through the API therefore fail against a local
 * `wrangler dev` while passing against the deployed HTTPS origin, which makes
 * "run it locally first" useless for exactly the authorization rules most worth
 * testing.
 *
 * `protect` accepts `Authorization: Bearer <jwt>` as well as the cookie, so we
 * sign in once, lift the token out of the cookie jar, and pin it as a header.
 * Same credentials, same middleware, works on both schemes.
 */
export const signInAsApi = async (
  playwright: Playwright,
  baseURL: string | undefined,
  credentials: { email: string; password: string },
  label = "sign-in",
): Promise<{ context: APIRequestContext; token: string; user: any }> => {
  const login = await playwright.request.newContext({ baseURL });
  const res = await login.post("/api/users/login", { data: credentials });
  expect(res.ok(), `${label} (${res.status()})`).toBeTruthy();
  const user = await res.json();

  const { cookies } = await login.storageState();
  const token = cookies.find((c) => c.name === "jwt")?.value;
  expect(token, `${label}: a jwt cookie was issued`).toBeTruthy();
  await login.dispose();

  const context = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  return { context, token: token!, user };
};
