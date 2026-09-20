import { createClient } from "@clickhouse/client";

import { env } from "@studyapp/env/server";

export const CLICKHOUSE_ENABLED =
  env.CLICKHOUSE_HOST && env.CLICKHOUSE_USER && env.CLICKHOUSE_PASSWORD;

export const clickhouse = CLICKHOUSE_ENABLED
  ? createClient({
      host: env.CLICKHOUSE_HOST,
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
    })
  : null;
