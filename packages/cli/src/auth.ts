export async function checkPlan(apiKey: string): Promise<string | null> {
  try {
    const apiUrl = process.env.INDXEL_API_URL || "https://indxel.com";
    const res = await fetch(`${apiUrl}/api/cli/plan`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { plan?: string };
    return data.plan ?? null;
  } catch {
    return null;
  }
}
