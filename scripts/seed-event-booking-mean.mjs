#!/usr/bin/env node
/**
 * seed-event-booking-mean.mjs
 * Idempotent seed: registers the three demo accounts via the live backend.
 * Assumes backend is running at http://localhost:3000.
 * Duplicate emails return HTTP 400 and are treated as success.
 */

const BACKEND = process.env.EVENT_BOOKING_BACKEND ?? 'http://localhost:3000';
const USERS = [
  { Username: 'Alice123',   email: 'alice@example.com',   password: 'password123' },
  { Username: 'Bob456',     email: 'bob@example.com',     password: 'password456' },
  { Username: 'Charlie789', email: 'charlie@example.com', password: 'password789' },
];

async function register(user) {
  const url = `${BACKEND}/TPL/Users/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  const body = await res.text();
  return { status: res.status, body };
}

(async () => {
  for (const user of USERS) {
    try {
      const { status, body } = await register(user);
      if (status === 200) {
        console.log(`[seed] registered ${user.email}`);
      } else if (status === 400) {
        console.log(`[seed] ${user.email} already present (HTTP 400 — idempotent)`);
      } else {
        console.error(`[seed] unexpected ${status} for ${user.email}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`[seed] request failed for ${user.email}:`, err.message);
      process.exitCode = 1;
    }
  }
})();
