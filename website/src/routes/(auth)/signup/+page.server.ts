import { fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import type { Actions, ActionData } from './$types';
import { sql } from '$lib/server/db';
import { PUBLIC_DOMAIN } from '$env/static/public';
import { getSessionScore, deleteSession_ } from '$lib/server/iq';
import { validateUsername } from '$lib/utils';
import { checkHardcore } from '$lib/moderation';

const SALT_ROUNDS = 10;

export const actions: Actions = {
    default: async ({ request, getClientAddress }) => {
        try {
            const data = await request.formData();
            const ip =
                request.headers.get('cf-connecting-ip') ??
                request.headers.get('x-real-ip') ??
                request.headers.get('x-forwarded-for')?.split(',')[0] ??
                getClientAddress();
            const userAgent = request.headers.get('user-agent') || '';

            const username = data.get('username')?.toString()?.toLowerCase();
            const password = data.get('password')?.toString();
            const confirmPassword = data.get('confirmPassword')?.toString();
            const sessionId = data.get('sessionId')?.toString();
            const clientIqScore = data.get('iqScore')?.toString();

            if (!username) return fail(400, { error: 'Username is required' });

            if (!validateUsername(username)) {
                return fail(400, { error: 'Invalid username format', username });
            }
            if (checkHardcore(username)) {
                return fail(400, { error: 'Username contains inappropriate content' });
            }

            if (!password) return fail(400, { error: 'Password is required', username });
            if (!confirmPassword) return fail(400, { error: 'Password confirmation is required', username });
            if (!sessionId) return fail(400, { error: 'IQ test session ID is missing', username });
            if (!clientIqScore) return fail(400, { error: 'IQ score is missing', username });

            if (password.length < 8) {
                return fail(400, { error: 'Password must be at least 8 characters', username });
            }

            if (password !== confirmPassword) {
                return fail(400, { error: 'Passwords do not match', username });
            }

            const parsedClientIqScore = parseInt(clientIqScore, 10);
            if (isNaN(parsedClientIqScore)) {
                return fail(400, { error: 'Invalid IQ score format', username });
            }

            const serverIqScore = await getSessionScore(sessionId);
            if (serverIqScore === undefined) {
                return fail(400, { error: 'IQ test session not found or incomplete', username });
            }

            if (serverIqScore !== parsedClientIqScore) {
                return fail(400, { error: 'IQ score validation failed', username });
            }

            const existingUsers = await sql`
                SELECT id FROM users WHERE username = ${username}
            `;

            if (existingUsers.length > 0) {
                return fail(409, { error: 'Username already taken', username });
            }

            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
            await sql`
                INSERT INTO users (username, password_hash, domain, iq, ip, user_agent)
                VALUES (${username}, ${passwordHash}, ${PUBLIC_DOMAIN}, ${serverIqScore}, ${ip}, ${userAgent})
            `;

            await deleteSession_(sessionId);

            return { success: true };

        } catch (error) {
            console.error('Signup error:', error);
            return fail(500, { error: 'Internal server error. Please try again later.' });
        }
    }
};

export type { ActionData };