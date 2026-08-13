// Brew Buddies — invite emails via Resend (https://resend.com).
// One call per participant, sent from the verified brew-buddies.com domain.

/** btoa() only handles Latin1; the .ics can contain UTF-8 (e.g. ☕), so
 * convert to UTF-8 bytes first, then to a Latin1-safe binary string. */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function sendInviteEmail(
  apiKey: string,
  to: string,
  participantName: string,
  orgName: string,
  otherNames: string,
  meetingTimeUtc: Date,
  icsContent: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${orgName} Brew Buddies <invites@brew-buddies.com>`,
      to: [to],
      subject: `☕ You're matched with ${otherNames}`,
      html: `<p>Hi ${participantName},</p>
<p>You've been matched with <strong>${otherNames}</strong> for a Brew Buddies chat.</p>
<p>Meeting time: ${meetingTimeUtc.toUTCString()}</p>
<p>The calendar invite is attached — add it and you're set.</p>`,
      attachments: [
        {
          filename: 'brew-buddies-invite.ics',
          content: utf8ToBase64(icsContent),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `Resend ${res.status}: ${body}` };
  }
  return { ok: true };
}
