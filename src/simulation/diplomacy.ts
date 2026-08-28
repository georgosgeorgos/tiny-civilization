export type TreatyState = "none" | "parley" | "trade-pact" | "hostile";
export type DiplomaticMessageKind = "trade-proposal" | "rival-claim" | "warning";
export type DiplomaticMessage = { kind: DiplomaticMessageKind; sentYear: number; arrivesYear: number };
export type DiplomaticChannel = { trust: number; reliability: number; treaty: TreatyState; lastYear: number; messages: DiplomaticMessage[] };
export type DiplomaticArrival = { kind: DiplomaticMessageKind; treaty: TreatyState; trustDelta: number; relationDelta: number };

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createDiplomaticChannel(year = 0): DiplomaticChannel {
  return { trust: 0.26, reliability: 0.45, treaty: "none", lastYear: year, messages: [] };
}

/** Distance, infrastructure, and translation change the arrival time of a message. */
export function dispatchMessage(channel: DiplomaticChannel, kind: DiplomaticMessageKind, year: number, context: { distance: number; infrastructure: number; languageAffinity: number }): DiplomaticChannel {
  const travel = Math.max(1, Math.ceil((1 + context.distance / 26) * (1.35 - context.infrastructure * 0.55) * (1.2 - context.languageAffinity * 0.25)));
  const messages = channel.messages.slice(-7);
  messages.push({ kind, sentYear: year, arrivesYear: year + travel });
  return { ...channel, messages };
}

export function advanceDiplomaticChannel(channel: DiplomaticChannel, year: number, context: { infrastructure: number; languageAffinity: number; scarcity: number }): { channel: DiplomaticChannel; arrivals: DiplomaticArrival[] } {
  const elapsed = Math.max(0, year - channel.lastYear);
  let trust = clamp(channel.trust - elapsed * (0.006 + context.scarcity * 0.008) + context.infrastructure * elapsed * 0.004);
  let reliability = clamp(channel.reliability - elapsed * 0.012 + context.infrastructure * elapsed * 0.022 + context.languageAffinity * elapsed * 0.006);
  let treaty = channel.treaty;
  const arrivals: DiplomaticArrival[] = [];
  const messages: DiplomaticMessage[] = [];
  for (const message of channel.messages) {
    if (message.arrivesYear > year) { messages.push(message); continue; }
    if (message.kind === "trade-proposal") {
      const delta = 0.1 + reliability * 0.08 + context.languageAffinity * 0.07 - context.scarcity * 0.04;
      trust = clamp(trust + delta); reliability = clamp(reliability + 0.09);
      treaty = trust >= 0.42 && reliability >= 0.38 ? "trade-pact" : "parley";
      arrivals.push({ kind: message.kind, treaty, trustDelta: delta, relationDelta: treaty === "trade-pact" ? 12 : 4 });
    } else if (message.kind === "rival-claim") {
      const delta = -(0.12 + (1 - context.languageAffinity) * 0.06);
      trust = clamp(trust + delta); reliability = clamp(reliability - 0.08); treaty = "hostile";
      arrivals.push({ kind: message.kind, treaty, trustDelta: delta, relationDelta: -14 });
    } else {
      const delta = -0.03 + context.languageAffinity * 0.025;
      trust = clamp(trust + delta);
      arrivals.push({ kind: message.kind, treaty, trustDelta: delta, relationDelta: -3 });
    }
  }
  return { channel: { trust, reliability, treaty, lastYear: year, messages }, arrivals };
}

export function channelSupportsTrade(channel: DiplomaticChannel): boolean {
  return channel.treaty === "trade-pact" && channel.trust >= 0.38 && channel.reliability >= 0.34;
}
