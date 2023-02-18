import {EventType} from "@pubsubjs/core/types";
import {z} from "zod";
import generateHooks from "@pubsubjs/react";

const nextEvent = {
    name: "nextImage",
    schema: z.null().optional()
} as const satisfies EventType

const previousEvent = {
    name: "previousImage",
    schema: z.null().optional()
} as const satisfies EventType

export const PubSub = generateHooks([nextEvent, previousEvent]);
