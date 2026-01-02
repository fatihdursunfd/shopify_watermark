/**
 * Intercepts fetch requests to inject the Shopify App Bridge Session Token.
 * Ensures all calls to the backend are authenticated securely via JWT.
 */
export async function authenticatedFetch(app: any, url: string, options: RequestInit = {}) {
    const token = await app.idToken();

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    return fetch(url, { ...options, headers });
}