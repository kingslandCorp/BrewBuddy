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
  icsContent: string,
  videoLink?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const videoLine = videoLink
    ? `<p>Meeting remotely? Join the call here: <a href="${videoLink}">${videoLink}</a></p>`
    : '';

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
${videoLine}
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

/** Sent only to an organization's on-file owner_email — never to an
 * address supplied by whoever is asking. */
export async function sendPasscodeResetEmail(
  apiKey: string,
  to: string,
  orgName: string,
  newPasscode: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Brew Buddies <support@brew-buddies.com>`,
      to: [to],
      subject: `☕ New passcode for ${orgName}`,
      html: `<p>Here's a new passcode for <strong>${orgName}</strong> on Brew Buddies:</p>
<p style="font-family:monospace; font-size:1.2em; background:#FFF6E9; padding:12px 16px; border-radius:6px; display:inline-block;">${newPasscode}</p>
<p>Your old passcode no longer works. If you didn't request this, someone else may have your group's name — reply to this email and we'll help.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `Resend ${res.status}: ${body}` };
  }
  return { ok: true };
}
