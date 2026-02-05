const { WebClient } = require('@slack/web-api');
const crypto = require('crypto');

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const SLACK_USERS = new Map([
  ["617166bf26a540007140970b", "U02EYDVHGFQ"], // Julito
  ["6144ee46805a97006ad5c621", "U02AEU6Q729"], // Santi
  ["62d6caea3b239b30ebc7bbae", "U03PWSC16AX"], // Joacote
  ["633ae848748d1bfcb85b1d79", "U044EMEEE1L"], // Fefe
  ["61c3862f0586a20069a5dcfe", "U02PRB885DF"], // Primo Yoe
])

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
                console.log('REVIEWER INFO', reviewer)

                if (SLACK_USERS.has(reviewer.account_id)) {
                    return slackClient.chat.postMessage({
                        channel: SLACK_USERS.get(reviewer.account_id),
                        text: `🚀 Tenés un PR ¡Que emoción!`,
                        blocks: [
                            {
                                "type": "header",
                                "text": {
                                    "type": "plain_text",
                                    "text": "🙈 ¡Nuevo PR asignado! 🔥",
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
                                        "text": { "type": "plain_text", "text": "Ver obra maestra 🚀" },
                                        "url": pr.links.html.href,
                                        "style": "primary"
                                    }
                                ]
                            }
                        ]
                    });
                } else {
                    console.warn(`⚠️ No se encontró usuario en Slack para: ${reviewer.display_name}`);
                }
            } catch (err) {
                // Si el error es que no encontró al usuario, lo logueamos pero no rompemos nada
                if (err.data?.error === 'users_not_found') {
                    console.warn(`⚠️ No se encontró usuario en Slack para: ${reviewer.display_name}`);
                } else {
                    console.error(`❌ Error con ${reviewer.display_name}:`, err.message);
                }
            }
        });
        await Promise.all(notifications);
    }

    return res.status(200).send('OK');
};