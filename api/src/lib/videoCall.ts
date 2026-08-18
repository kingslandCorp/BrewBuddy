// Brew Buddies — video-call room creation via Daily.co's REST API.
// Community/Corporate tiers only: a lightweight, no-signup room per group,
// scoped to the meeting window so it doesn't linger as an open room after.

export async function createCallRoom(
  apiKey: string,
  groupId: string,
  meetingStartUtc: Date,
  durationMinutes: number
): Promise<{ url: string } | { error: string }> {
  const nbf = Math.floor(meetingStartUtc.getTime() / 1000) - 15 * 60; // joinable 15 min early
  const exp = Math.floor(meetingStartUtc.getTime() / 1000) + durationMinutes * 60 + 60 * 60; // expires 1hr after the meeting ends

  const res = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `bb-${groupId}`,
      privacy: 'public',
      properties: { nbf, exp, eject_at_room_exp: true },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { error: `Daily ${res.status}: ${errBody}` };
  }
  const room = (await res.json()) as { url: string };
  return { url: room.url };
}
