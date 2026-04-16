const TELEGRAM_API = "https://api.telegram.org";

function getToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

function getChatId(): string {
  return process.env.TELEGRAM_CHAT_ID || "";
}

export function isTelegramConfigured(): boolean {
  return !!(getToken() && getChatId());
}

export interface RepoAlert {
  full_name: string;
  html_url: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  created_at: string;
  score: number;
  reasons: string[];
}

export async function sendAlert(repo: RepoAlert): Promise<boolean> {
  const token = getToken();
  const chatId = getChatId();
  if (!token || !chatId) return false;

  const text = [
    `*Radar — new repo*`,
    ``,
    `[${repo.full_name}](${repo.html_url})`,
    `Stars ${repo.stars} | Forks ${repo.forks} | ${repo.created_at.slice(0, 10)}`,
    `Lang: ${repo.language}`,
    `${repo.description.slice(0, 200)}`,
    ``,
    `Score: ${repo.score}`,
    `Matched: ${repo.reasons.join(", ")}`,
  ].join("\n");

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendBatchSummary(
  count: number,
  topRepos: RepoAlert[]
): Promise<boolean> {
  const token = getToken();
  const chatId = getChatId();
  if (!token || !chatId) return false;

  const topList = topRepos
    .slice(0, 5)
    .map((r) => `  ${r.score}p — [${r.full_name}](${r.html_url})`)
    .join("\n");

  const text = [
    `*Radar scan complete*`,
    `${count} repos above threshold`,
    ``,
    topList || "  (none)",
  ].join("\n");

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
