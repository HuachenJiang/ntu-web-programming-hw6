import { handleTelegramWebhookRequest } from "@/services/telegram-webhook";

export async function POST(request: Request): Promise<Response> {
  return handleTelegramWebhookRequest(request);
}
