import { HOTLINES } from "@navopulse/shared";
import { json, route } from "@/lib/http";

/** Runtime config the citizen app needs (no secrets). */
export const GET = route(async () =>
  json({
    smsGatewayNumber: process.env.NEXT_PUBLIC_SMS_GATEWAY_NUMBER || "+639000000000",
    hotlines: {
      national: HOTLINES.national,
      drrmo: process.env.NEXT_PUBLIC_HOTLINE_DRRMO || HOTLINES.drrmo,
      pnp: process.env.NEXT_PUBLIC_HOTLINE_PNP || HOTLINES.pnp,
      bfp: process.env.NEXT_PUBLIC_HOTLINE_BFP || HOTLINES.bfp,
    },
    navobot: { mode: process.env.DIRECTLINE_SECRET || process.env.COPILOT_TOKEN_ENDPOINT ? "directline" : "demo" },
  }),
);
