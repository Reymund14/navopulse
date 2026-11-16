import { env } from "@/lib/env";
import { json, route } from "@/lib/http";
import { openApiDocument } from "@/lib/openapi";

export const GET = route(async () => json(openApiDocument(env.appUrl)));
