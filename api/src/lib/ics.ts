// Brew Buddies — .ics generation
// Standard iCalendar (RFC 5545) VEVENT, addressed to every participant in a group.

export interface IcsParticipant {
  name: string;
  email: string;
}

export interface IcsGroupInput {
  groupId: string;
  orgName: string;
  meetingTimeUtc: Date;
  durationMinutes: number;
  participants: IcsParticipant[];
  videoLink?: string | null;
}

function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeText(s: string): string {
  return s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
}

export function generateIcs(input: IcsGroupInput): string {
  const start = input.meetingTimeUtc;
  const end = new Date(start.getTime() + input.durationMinutes * 60000);
  const names = input.participants.map((p) => p.name).join(', ');

  const description = input.videoLink
    ? `You've been matched with ${names}. Join here: ${input.videoLink}`
    : `You've been matched with ${names}. Grab a coffee and get to know each other.`;

  const attendees = input.participants
    .map((p) => `ATTENDEE;CN=${escapeText(p.name)}:mailto:${p.email}`)
    .join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Brew Buddies//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${input.groupId}@brew-buddies.com`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeText('Brew Buddies ☕ — Meet your table')}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(input.videoLink ? [`URL:${input.videoLink}`, `LOCATION:${escapeText(input.videoLink)}`] : []),
    attendees,
    `ORGANIZER;CN=${escapeText(input.orgName + ' Brew Buddies')}:mailto:noreply@brew-buddies.com`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
