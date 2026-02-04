require('dotenv').config();
const { WebClient } = require('@slack/web-api');
const express = require('express');
const crypto = require('crypto'); // Para la validación de firma

const app = express();

// IMPORTANTE: Para validar la firma, necesitamos el body "crudo" (Buffer)
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const PORT = process.env.PORT || 3000;

// Función para validar la firma de Bitbucket
const validateBitbucketSignature = (req) => {
    const signature = req.headers['x-hub-signature'];
    const secret = process.env.BITBUCKET_WEBHOOK_SECRET;

    if (!signature || !secret) return false;

    // Bitbucket envía la firma en formato: sha256=hash
    const [algorithm, remoteHash] = signature.split('=');
    if (algorithm !== 'sha256') return false;

    const localHash = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(localHash), Buffer.from(remoteHash));
};

app.post('/webhook', async (req, res) => {
    // VALIDACIÓN DE SEGURIDAD
    if (!validateBitbucketSignature(req)) {
        console.error('⚠️ Intento de acceso no autorizado detectado.');
        return res.status(403).send('Invalid signature');
    }

    const data = req.body;
    const eventKey = req.headers['x-event-key'];

    if (['pullrequest:created', 'pullrequest:updated'].includes(eventKey)) {
        const pr = data.pullrequest;
        const reviewers = pr.reviewers || [];

        const notifications = reviewers.map(async (reviewer) => {
            try {
                // Lógica de email simplificada
                
				// Si es para testing, solo me mando a mí. En producción, uso el dinámico.
                const userEmail = (process.env.NODE_ENV === 'dev') 
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

    res.status(200).send('OK');
});

// Exportar para que Vercel lo maneje como Serverless Function
module.exports = app;