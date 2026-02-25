interface WebhookPayload {
    event: string;
    job_id: string;
    [key: string]: unknown;
}

export async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...payload,
                timestamp: new Date().toISOString(),
            }),
        });

        if (!response.ok) {
            console.warn(`⚠️ Webhook failed: ${response.status} ${response.statusText}`);
        } else {
            console.log(`📨 Webhook sent: ${payload.event}`);
        }
    } catch (error) {
        // Log but don't throw - webhooks shouldn't break the main flow
        console.error(`❌ Webhook error:`, error);
    }
}
