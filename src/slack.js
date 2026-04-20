const { getSetting } = require('../db/database');

function getFailReason(failure) {
  var reasons = failure.details && Array.isArray(failure.details.reasons) ? failure.details.reasons : [];
  var failReasons = reasons.filter(function(r) { return !r.startsWith('OK:'); });
  if (failReasons.length > 0) return failReasons[0];
  if (failure.details && failure.details.error) return failure.details.error;
  return 'Check did not pass';
}

async function sendNotification(failures) {
  const webhookUrl = getSetting('slack_webhook_url');
  if (!webhookUrl) {
    console.log('No Slack webhook configured, skipping notification.');
    return;
  }

  // Send exactly 1 message per scan
  const blocks = [];

  if (failures.length === 1) {
    // Single failure — detailed message
    const f = failures[0];
    const reason = getFailReason(f);
    blocks.push(
      {
        type: 'header',
        text: { type: 'plain_text', text: ':warning: Endpoint Check Failed', emoji: true },
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
    // Multiple failures — summary message
    const bySite = {};
    for (const f of failures) {
      if (!bySite[f.siteName]) bySite[f.siteName] = { url: f.siteUrl, checks: [] };
      bySite[f.siteName].checks.push(f);
    }

    const siteCount = Object.keys(bySite).length;
    blocks.push(
      {
        type: 'header',
        text: { type: 'plain_text', text: ':warning: Multiple Endpoint Checks Failed', emoji: true },
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

    for (const [siteName, data] of Object.entries(bySite)) {
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
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      console.error(`Slack webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (e) {
    console.error('Slack notification error:', e.message);
  }
}

async function sendTestMessage() {
  const webhookUrl = getSetting('slack_webhook_url');
  if (!webhookUrl) throw new Error('No Slack webhook URL configured');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: ':white_check_mark: *Marketing Monitor* — Test notification. Connection successful!' },
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
