import {z} from "zod";
import {EventType} from "@pubsubjs/core";

const hmmEvent = {
    name: 'hmm',
    schema: z.object({
        name: z.string()
    })
} as const satisfies EventType;

export default [hmmEvent];
