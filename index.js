require('dotenv').config(); 
const { WebClient } = require('@slack/web-api');
const express = require('express');

const app = express();
app.use(express.json());

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const PORT = process.env.PORT || 3000;
const EMAIL_DOMAIN = process.env.BITBUCKET_DOMAIN_EMAIL || '@tuempresa.com';

app.post('/webhook', async (req, res) => {
    const data = req.body;
    const eventKey = req.headers['x-event-key'];

    if (['pullrequest:created', 'pullrequest:updated'].includes(eventKey)) {
        const pr = data.pullrequest;
        const reviewers = pr.reviewers || [];

        // Proseso cada reviewer en paralelo para mayor velocidad
        const notifications = reviewers.map(async (reviewer) => {
            try {
                // Intento obtenerlo del campo email si Bitbucket lo envía
                // Si no, lo construimos usando el nickname
                
				/* const userEmail = reviewer.email || `${reviewer.nickname}${EMAIL_DOMAIN}`; */

				const userEmail = 'santiago.i@knownonline.com' // Solo para testing hardcodeo mi email

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
                console.error(`Error procesando a ${reviewer.display_name}: ${err.message}`);
            }
        });

        await Promise.all(notifications);
    }

    res.status(200).send('OK');
});

app.listen(PORT, () => console.log(`🚀 Bot de Revisores activo en puerto ${PORT}`));