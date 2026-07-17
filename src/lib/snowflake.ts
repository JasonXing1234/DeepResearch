import snowflake from 'snowflake-sdk';

let cachedConnection: snowflake.Connection | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// snowflake-sdk doesn't read HTTP(S)_PROXY env vars automatically like curl
// does — it needs the proxy host/port passed explicitly as connection
// options. Networks that require an outbound proxy (e.g. corporate networks)
// would otherwise fail with an opaque "Request to Snowflake failed" error.
function getProxyOptions(): Partial<snowflake.ConnectionOptions> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxyUrl) return {};

  try {
    const url = new URL(proxyUrl);
    return {
      proxyHost: url.hostname,
      proxyPort: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      proxyProtocol: url.protocol.replace(':', ''),
      ...(url.username ? { proxyUser: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { proxyPassword: decodeURIComponent(url.password) } : {}),
      noProxy: process.env.NO_PROXY || process.env.no_proxy,
    };
  } catch {
    return {};
  }
}

function createConnection(): snowflake.Connection {
  const options: snowflake.ConnectionOptions = {
    account: getRequiredEnv('SNOWFLAKE_ACCOUNT'),
    username: getRequiredEnv('SNOWFLAKE_USERNAME'),
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE || 'WATCHTOWER_ANA_DEV_DB',
    schema: process.env.SNOWFLAKE_SCHEMA || 'ELI',
    role: process.env.SNOWFLAKE_ROLE,
    ...getProxyOptions(),
  };

  if (process.env.SNOWFLAKE_PRIVATE_KEY) {
    options.authenticator = 'SNOWFLAKE_JWT';
    options.privateKey = process.env.SNOWFLAKE_PRIVATE_KEY.replace(/\\n/g, '\n');
    if (process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE) {
      options.privateKeyPass = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE;
    }
  } else {
    options.password = getRequiredEnv('SNOWFLAKE_PASSWORD');
  }

  return snowflake.createConnection(options);
}

export async function getSnowflakeConnection(): Promise<snowflake.Connection> {
  if (cachedConnection && cachedConnection.isUp()) {
    return cachedConnection;
  }

  const connection = createConnection();
  await new Promise<void>((resolve, reject) => {
    connection.connect((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  cachedConnection = connection;
  return connection;
}

export function executeSnowflakeSql(
  connection: snowflake.Connection,
  sqlText: string,
  binds?: unknown[][]
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      ...(binds ? { binds: binds as snowflake.InsertBinds } : {}),
      complete: (err, _stmt, rows) => {
        if (err) reject(err);
        else resolve(rows ?? []);
      },
    });
  });
}
