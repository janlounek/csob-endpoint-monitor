function getFailReason(failure) {
  var reasons = failure.details && Array.isArray(failure.details.reasons) ? failure.details.reasons : [];
  var failReasons = reasons.filter(function(r) { return !r.startsWith('OK:'); });
  if (failReasons.length > 0) return failReasons[0];
  if (failure.details && failure.details.error) return failure.details.error;
  return 'Check did not pass';
}

async function sendNotification(failures, webhookUrl, clientName) {
  if (!webhookUrl) {
    console.log(`  Slack: No webhook configured${clientName ? ' for ' + clientName : ''}, skipping notification.`);
    return;
  }

  const clientLabel = clientName ? ` [${clientName}]` : '';
  console.log(`  Slack${clientLabel}: Sending notification for ${failures.length} failure(s)...`);

  const blocks = [];

  if (failures.length === 1) {
    const f = failures[0];
    const reason = getFailReason(f);
    blocks.push(
      {
        type: 'header',
        text: { type: 'plain_text', text: ':warning: Endpoint Check Failed' + (clientName ? ` — ${clientName}` : ''), emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Site:* <${f.siteUrl}|${f.siteName}>\n*Check:* ${f.checkLabel}\n*Status:* ${f.status.toUpperCase()}\n*Reason:* ${reason}`,
        },
      }
    );
  } else {
    const bySite = {};
    for (const f of failures) {
      if (!bySite[f.siteName]) bySite[f.siteName] = { url: f.siteUrl, checks: [] };
      bySite[f.siteName].checks.push(f);
    }

    const siteCount = Object.keys(bySite).length;
    blocks.push(
      {
        type: 'header',
        text: { type: 'plain_text', text: ':warning: Multiple Endpoint Checks Failed' + (clientName ? ` — ${clientName}` : ''), emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${failures.length} check(s) failed* across *${siteCount} site(s)*`,
        },
      },
      { type: 'divider' }
    );

    const siteEntries = Object.entries(bySite).slice(0, 10);
    for (const [siteName, data] of siteEntries) {
      const checkList = data.checks
        .map(function(c) {
          const icon = c.status === 'fail' ? ':x:' : ':exclamation:';
          return `${icon} ${c.checkLabel}`;
        })
        .join(', ');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${data.url}|${siteName}>* — ${checkList}`,
        },
      });
    }

    if (Object.keys(bySite).length > 10) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `_...and ${Object.keys(bySite).length - 10} more site(s)_` },
      });
    }
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Checked at ${new Date().toISOString()}` },
      ],
    }
  );

  try {
    const body = JSON.stringify({ blocks });
    console.log(`  Slack${clientLabel}: Sending ${blocks.length} blocks (${body.length} bytes)...`);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`  Slack${clientLabel} webhook failed: ${response.status} ${responseText}`);
    } else {
      console.log(`  Slack${clientLabel}: Notification sent successfully (${responseText})`);
    }
  } catch (e) {
    console.error(`  Slack${clientLabel} notification error:`, e.message);
  }
}

async function sendTestMessage(webhookUrl, clientName) {
  if (!webhookUrl) throw new Error('No Slack webhook URL configured');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:white_check_mark: *Endpoint Monitor*${clientName ? ` — ${clientName}` : ''} — Test notification. Connection successful!`,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Slack responded with ${response.status}: ${response.statusText}`);
  }

  return true;
}

module.exports = { sendNotification, sendTestMessage };
