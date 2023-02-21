import {z} from "zod";
import {EventType} from "@pubsubjs/core";

const helloEvent = {
    name: 'miesenPart',
    prefix: 'auth-',
    schema: z.object({
        message: z.string()
    })
} as const satisfies EventType

const test = {
    name: 'test',
    schema: z.object({
        message: z.string()
    })
} as const satisfies EventType


export default [helloEvent, test];
