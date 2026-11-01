import { Logger } from 'homebridge';
import { BLUEAIR_API_TIMEOUT, getGigyaConfig } from './Consts';
import { Region } from '../platformUtils';

class GigyaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

const getRetryAfterMs = (retryAfter: string | null): number | undefined => {
  if (!retryAfter) {
    return undefined;
  }
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
};

export default class GigyaApi {
  private api_key: string;
  private gigyaApiUrl: string;

  constructor(
    private readonly username: string,
    private readonly password: string,
    region: Region,
    private readonly logger: Logger,
  ) {
    const config = getGigyaConfig(region);

    this.logger.debug(`Creating Gigya API instance for region ${region}`);

    this.api_key = config.apiKey;
    this.gigyaApiUrl = `https://accounts.${config.gigyaRegion}.gigya.com`;
  }

  public async getGigyaSession(): Promise<{ token: string; secret: string }> {
    const params = new URLSearchParams({
      apiKey: this.api_key,
      loginID: this.username,
      password: this.password,
      targetEnv: 'mobile',
    });

    const response = await this.apiCall('/accounts.login', params.toString());

    if (!response.sessionInfo) {
      throw new Error('Gigya session error: response did not include sessionInfo');
    }

    this.logger.debug('Gigya session received');
    return {
      token: response.sessionInfo.sessionToken,
      secret: response.sessionInfo.sessionSecret,
    };
  }

  public async getGigyaJWT(token: string, secret: string): Promise<{ jwt: string }> {
    const params = new URLSearchParams({
      oauth_token: token,
      secret: secret,
      targetEnv: 'mobile',
    });

    const response = await this.apiCall('/accounts.getJWT', params.toString());

    if (!response.id_token) {
      throw new Error('Gigya JWT error: response did not include id_token');
    }

    this.logger.debug('Gigya JWT received');
    return {
      jwt: response.id_token,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async apiCall(url: string, data: string, retries = 3): Promise<any> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BLUEAIR_API_TIMEOUT);

      try {
        const response = await fetch(`${this.gigyaApiUrl}${url}?${data}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*',
            Connection: 'keep-alive',
            'Accept-Encoding': 'gzip, deflate, br',
          },
          signal: controller.signal,
        });
        const json = await response.json();
        if (response.status !== 200) {
          throw new GigyaApiError(
            `API call error with status ${response.status}: ${response.statusText}`,
            response.status,
            response.status === 229 || response.status === 429 ? getRetryAfterMs(response.headers.get('retry-after')) : undefined,
          );
        }
        return json;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < retries) {
        const exponentialDelay = Math.min(1000 * 2 ** attempt, 60000);
        const rateLimited = lastError instanceof GigyaApiError && (lastError.status === 229 || lastError.status === 429);
        const rateLimitDelay = Math.min(30000 * 2 ** attempt, 120000);
        const minimumDelay = rateLimited ? rateLimitDelay : exponentialDelay;
        const delayMs =
          lastError instanceof GigyaApiError && lastError.retryAfterMs !== undefined
            ? Math.max(lastError.retryAfterMs, minimumDelay)
            : minimumDelay;
        this.logger.warn(`Gigya API call failed; retrying in ${delayMs / 1000} second(s) (attempt ${attempt + 2}/${retries + 1}).`);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error(`Gigya API call failed after ${retries + 1} attempts: ${lastError}`);
  }
}
