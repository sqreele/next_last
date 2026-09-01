export function rows<T>(payload: T[] | { results?: T[] } | null): T[];
export function billingStatusLabel(status: string): string;
export function formatBillingDate(value: string | null | undefined): string;
export function isSafeStripeHostedUrl(value: string): boolean;
export function redirectToStripe(value: string, locationObject?: { assign(value: string): void }): void;
