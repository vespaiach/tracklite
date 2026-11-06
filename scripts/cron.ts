const everyMinuteMs = 60_000;
const url = `${process.env.APP_URL}/api/cron/outbox`;

async function callOutbox() {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch((error: Error) => error);
  console.log(new Date().toISOString(), url, response instanceof Error ? response.message : response.status);
}

callOutbox();
setInterval(callOutbox, everyMinuteMs);