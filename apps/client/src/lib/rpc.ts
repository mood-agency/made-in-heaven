import { hc } from 'hono/client';
import type { AppType } from '@mih/server';

export const rpc = hc<AppType>('/');
