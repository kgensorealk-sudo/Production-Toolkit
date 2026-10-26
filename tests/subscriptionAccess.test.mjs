import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasActiveSubscription } from '../utils/subscriptionAccess.ts';
const now = Date.parse('2026-10-26T00:00:00Z');
for (const profile of [null, undefined, {}, {is_subscribed: false}, {is_subscribed: 'true'},
    {is_subscribed: true, subscription_end: 'invalid'},
    {is_subscribed: true, subscription_end: ''},
    {is_subscribed: true, subscription_end: '2026-10-25T00:00:00Z'},
    {is_subscribed: true, subscription_end: '2026-10-26T00:00:00Z'}]) {
    assert.equal(hasActiveSubscription(profile, now), false, JSON.stringify(profile));
}
assert.equal(hasActiveSubscription({is_subscribed: true}, now), true);
assert.equal(hasActiveSubscription({is_subscribed: true, subscription_end: '2026-10-27T00:00:00Z'}, now), true);
// Guard both profile-error and missing-profile fallbacks against accidental reintroduction.
const auth = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8');
assert.equal((auth.match(/is_subscribed: false,/g) || []).length, 2);
assert.ok(!auth.includes('is_subscribed: true'));
assert.ok(auth.includes('isRoleAdmin || hasActiveSubscription(profileData)'));
console.log('Subscription access regression checks passed (12 entitlement cases and fallback guards).');
