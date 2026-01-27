import * as dotenv from 'dotenv';

export default function loadEnv() {
  dotenv.config({ path: ['.env.local', '.env'], quiet: true });
}
