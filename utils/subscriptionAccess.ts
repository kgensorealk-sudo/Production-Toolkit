/** Missing or invalid entitlement data must never grant subscription access. */
export function hasActiveSubscription(
    profile: { is_subscribed?: unknown; subscription_end?: string | null } | null | undefined,
    now: number = Date.now()
): boolean {
    if (profile?.is_subscribed !== true) return false;
    // Preserve explicitly provisioned subscriptions without an expiry.
    if (profile.subscription_end == null) return true;
    const expiresAt = Date.parse(profile.subscription_end);
    return Number.isFinite(expiresAt) && expiresAt > now;
}
