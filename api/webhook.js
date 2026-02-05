const { WebClient } = require('@slack/web-api');
const crypto = require('crypto');

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// Función de validación (se mantiene igual)
const validateBitbucketSignature = (req, rawBody) => {
    const signature = req.headers['x-hub-signature'];
    const secret = process.env.BITBUCKET_WEBHOOK_SECRET;
    if (!signature || !secret) return false;

    const [algorithm, remoteHash] = signature.split('=');
    const localHash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(localHash), Buffer.from(remoteHash));
};

// EXPORTAR EL HANDLER DIRECTO PARA VERCEL
module.exports = async (req, res) => {
    // Solo aceptamos POST
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // IMPORTANTE: Vercel ya parsea el body, pero para la firma necesitamos el raw
    // En Vercel, el body ya viene en req.body si es JSON. 
    // Para la firma, usamos el string del body original.
    const rawBody = JSON.stringify(req.body);

    if (!validateBitbucketSignature(req, rawBody)) {
        console.error('⚠️ Firma inválida');
        return res.status(403).send('Invalid signature');
    }

    const data = req.body;
    const eventKey = req.headers['x-event-key'];

    if (['pullrequest:created', 'pullrequest:updated'].includes(eventKey)) {
        const pr = data.pullrequest;
        const reviewers = pr.reviewers || [];

        const notifications = reviewers.map(async (reviewer) => {
            try {
                // Lógica de email
                const userEmail = (process.env.NODE_ENV === 'development') 
                    ? "santiago.i@knownonline.com" 
                    : (reviewer.email || `${reviewer.nickname}${process.env.BITBUCKET_DOMAIN_EMAIL}`);

                const slackLookup = await slackClient.users.lookupByEmail({ email: userEmail });

                if (slackLookup.ok) {
                    return slackClient.chat.postMessage({
                        channel: slackLookup.user.id,
                        text: `🚀 Tenés un PR ¡Que emoción!`,
                        blocks: [
                            {
                                "type": "header",
                                "text": {
                                    "type": "plain_text",
                                    "text": "🙈 Nueva revisión asignada",
                                    "emoji": true
                                }
                            },
                            {
                                "type": "section",
                                "text": {
                                    "type": "mrkdwn",
                                    "text": `*Repositorio:* ${data.repository.name}\n*Título:* ${pr.title}\n*Autor:* ${pr.author.display_name}`
                                }
                            },
                            {
                                "type": "actions",
                                "elements": [
                                    {
                                        "type": "button",
                                        "text": { "type": "plain_text", "text": "Revisar ahora" },
                                        "url": pr.links.html.href,
                                        "style": "primary"
                                    }
                                ]
                            }
                        ]
                    });
                }
            } catch (err) {
                console.error(`Error con ${reviewer.display_name}: ${err.message}`);
            }
        });
        await Promise.all(notifications);
    }

    return res.status(200).send('OK');
};