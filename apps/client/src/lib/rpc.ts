import { hc } from 'hono/client';
import type { AppType } from '@psi/server';

export const rpc = hc<AppType>('/');
