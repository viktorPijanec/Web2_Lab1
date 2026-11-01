import { getToken, issuePass } from './automat.ts';
import dotenv from 'dotenv';
dotenv.config();

const authority = process.env.AUTH0_ISSUER_BASE_URL!;
const audience = process.env.AUTH0_AUDIENCE!;
const clientId = process.env.M2M_CLIENT_ID!;
const clientSecret = process.env.M2M_CLIENT_SECRET!;

const token = await getToken(
  authority,
  audience,
  clientId,
  clientSecret,
  'create:passes'
);

await issuePass(
  'http://localhost:4080/passes',
  token,
  'Ana Anić',
  'HR-987654321'
);

console.log('Pass issued successfully');