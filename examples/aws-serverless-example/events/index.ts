import {z} from "zod";
import {EventType} from "@pubsubjs/core";

const helloEvent = {
    name: 'userRegistered',
    prefix: 'auth-',
    schema: z.object({
        fullName: z.string(),
        email: z.string()
    })
} as const satisfies EventType

const test = {
    name: 'test',
    schema: z.object({
        message: z.string()
    })
} as const satisfies EventType


export default [helloEvent, test];
