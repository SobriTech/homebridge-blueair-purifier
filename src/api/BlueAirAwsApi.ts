import { Logger } from 'homebridge';
import { Region } from '../platformUtils';
import GigyaApi from './GigyaApi';
import { BLUEAIR_API_TIMEOUT, BlueAirDeviceStatusResponse, BlueAirTelemetryResponse, LOGIN_EXPIRATION, getAwsConfig } from './Consts';
import { Mutex } from 'async-mutex';

type BlueAirDeviceDiscovery = {
  mac: string;
  'mcu-firmware': string;
  name: string;
  type: string;
  'user-type': string;
  uuid: string;
  'wifi-firmware': string;
};

export type FullBlueAirDeviceState = BlueAirDeviceState & BlueAirDeviceSensorData;

export type BlueAirDeviceState = {
  cfv?: string;
  germshield?: boolean;
  gsnm?: boolean;
  standby?: boolean;
  fanspeed?: number;
  childlock?: boolean;
  nightmode?: boolean;
  mfv?: string;
  automode?: boolean;
  apsubmode?: number;
  ofv?: string;
  brightness?: number;
  nlstepless?: number;
  safetyswitch?: boolean;
  filterusage?: number;
  disinfection?: boolean;
  disinftime?: number;
  [key: string]: string | number | boolean | undefined;
};

export type BlueAirDeviceSensorData = {
  fanspeed?: number;
  hcho?: number;
  humidity?: number;
  pm1?: number;
  pm10?: number;
  pm2_5?: number;
  temperature?: number;
  voc?: number;
  [key: string]: string | number | boolean | undefined;
};

export type BlueAirDeviceStatus = {
  id: string;
  name: string;
  sku: string;
  state: BlueAirDeviceState;
  sensorData: BlueAirDeviceSensorData;
};

type BlueAirSetStateBody = {
  n: string;
  v?: number;
  vb?: boolean;
};

export const BlueAirDeviceSensorDataMap: Record<string, keyof BlueAirDeviceSensorData> = {
  fsp0: 'fanspeed',
  hcho: 'hcho',
  h: 'humidity',
  pm1: 'pm1',
  pm10: 'pm10',
  pm2_5: 'pm2_5',
  t: 'temperature',
  tVOC: 'voc',
};

export class BlueAirApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'BlueAirApiError';
  }
}

const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 60000;
const RATE_LIMIT_BASE_DELAY_MS = 30000;
const RATE_LIMIT_MAX_DELAY_MS = 120000;

const sleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

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

export const isRateLimitStatus = (status?: number): boolean => status === 229 || status === 429;

export default class BlueAirAwsApi {
  private readonly gigyaApi: GigyaApi;

  private last_login: number;

  private mutex: Mutex;

  private accessToken: string;
  private idToken: string;
  private userId: string;
  private blueAirApiUrl: string;

  constructor(
    username: string,
    password: string,
    region: Region,
    private readonly logger: Logger,
    cloudRegion: Region = region,
  ) {
    const config = getAwsConfig(cloudRegion);
    this.blueAirApiUrl = `https://${config.restApiId}.execute-api.${config.awsRegion}.amazonaws.com/prod/c`;

    this.mutex = new Mutex();

    this.logger.debug(`Creating BlueAir API instance for auth region ${region} and cloud region ${cloudRegion}`);

    this.gigyaApi = new GigyaApi(username, password, region, logger);

    this.last_login = 0;
    this.accessToken = '';
    this.idToken = '';
    this.userId = '';
  }

  async login(): Promise<void> {
    this.logger.debug('Logging in...');

    const { token, secret } = await this.gigyaApi.getGigyaSession();
    const { jwt } = await this.gigyaApi.getGigyaJWT(token, secret);
    const { accessToken, idToken, userId } = await this.getAwsAccessToken(jwt);

    this.last_login = Date.now();
    this.accessToken = accessToken;
    this.idToken = idToken;
    this.userId = userId;

    this.logger.debug('Logged in');
  }

  async checkTokenExpiration(): Promise<void> {
    if (LOGIN_EXPIRATION < Date.now() - this.last_login) {
      this.logger.debug('Token expired, logging in again');
      return await this.login();
    }
    return;
  }

  async getDevices(): Promise<BlueAirDeviceDiscovery[]> {
    await this.checkTokenExpiration();

    this.logger.debug('Getting devices...');

    const response = await this.apiCall('/registered-devices', undefined, 'GET');

    if (!response.devices) {
      throw new Error('getDevices error: no devices in response');
    }

    const devices = response.devices as BlueAirDeviceDiscovery[];
    return devices;
  }

  async getDeviceStatus(accountUuid: string, uuids: string[]): Promise<BlueAirDeviceStatus[]> {
    await this.checkTokenExpiration();

    const body = {
      deviceconfigquery: uuids.map((uuid) => ({ id: uuid, r: { r: ['sensors'] } })),
      includestates: true,
      eventsubscription: {
        include: uuids.map((uuid) => ({ filter: { o: `= ${uuid}` } })),
      },
    };
    const userId = this.userId || accountUuid;
    const data = await this.apiCall<BlueAirDeviceStatusResponse>(`/${userId}/r/initial`, body);

    if (!data.deviceInfo) {
      throw new Error('getDeviceStatus error: no deviceInfo in response');
    }

    const deviceStatuses: BlueAirDeviceStatus[] = data.deviceInfo.map((device) => {
      return {
        id: device.id,
        name: device.configuration.di.name,
        sku: device.configuration.di.sku ?? '',
        sensorData: device.sensordata.reduce((acc, sensor) => {
          const key = BlueAirDeviceSensorDataMap[sensor.n];
          if (key) {
            acc[key] = sensor.v;
          }
          return acc;
        }, {} as BlueAirDeviceSensorData),
        state: device.states.reduce((acc, state) => {
          if (state.v !== undefined) {
            acc[state.n] = state.v;
          } else if (state.vb !== undefined) {
            acc[state.n] = state.vb;
          } else {
            this.logger.warn(`getDeviceStatus: unknown state ${JSON.stringify(state)}`);
          }
          return acc;
        }, {} as BlueAirDeviceState),
      };
    });

    const airQualitySensorNames = new Set(['pm2_5', 'pm10', 'tVOC']);
    for (const status of deviceStatuses) {
      const hasAirQualityData =
        status.sensorData.pm2_5 !== undefined || status.sensorData.pm10 !== undefined || status.sensorData.voc !== undefined;
      const isMiniRestful = status.state.nlstepless !== undefined;
      if (hasAirQualityData || isMiniRestful) {
        continue;
      }

      const deviceInfo = data.deviceInfo.find((device) => device.id === status.id);
      const availableSensors = this.getAvailableSensorNames(deviceInfo, airQualitySensorNames);
      if (availableSensors.length === 0) {
        continue;
      }

      try {
        const telemetry = await this.getDeviceTelemetry(userId, status.id, availableSensors);
        Object.assign(status.sensorData, telemetry);
        this.logger.debug(`[${status.name}] Loaded fallback air-quality telemetry.`);
      } catch (error) {
        this.logger.debug(`[${status.name}] Telemetry fallback failed: ${(error as Error).message}`);
      }
    }

    return deviceStatuses;
  }

  private getAvailableSensorNames(
    deviceInfo: BlueAirDeviceStatusResponse['deviceInfo'][number] | undefined,
    allowedSensors: ReadonlySet<string>,
  ): string[] {
    if (!deviceInfo?.configuration.ds) {
      return [];
    }

    const available = new Set<string>();
    for (const [key, entry] of Object.entries(deviceInfo.configuration.ds)) {
      if (allowedSensors.has(key)) {
        available.add(key);
      }
      for (const sensorName of entry.sn ?? []) {
        if (allowedSensors.has(sensorName)) {
          available.add(sensorName);
        }
      }
    }
    return Array.from(available);
  }

  async getDeviceTelemetry(accountUuid: string, uuid: string, sensorNames: string[]): Promise<BlueAirDeviceSensorData> {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;
    const params = new URLSearchParams({
      did: uuid,
      from: oneHourAgo.toString(),
      to: now.toString(),
    });
    for (const sensorName of sensorNames) {
      params.append('s', sensorName);
    }

    const data = await this.apiCall<BlueAirTelemetryResponse>(
      `/${accountUuid}/r/telemetry/5m/historical?${params.toString()}`,
      undefined,
      'GET',
    );
    if (!Array.isArray(data) || data.length === 0) {
      return {};
    }

    const entry = data.find((telemetry) => telemetry.did === uuid) ?? data[0];
    if (!entry.datapoints?.length) {
      return {};
    }

    const latestDatapoint = entry.datapoints[entry.datapoints.length - 1];
    const sensorData: BlueAirDeviceSensorData = {};
    for (let index = 0; index < entry.sensors.length; index++) {
      const rawValue = latestDatapoint[index + 1];
      if (rawValue === null || rawValue === '') {
        continue;
      }
      const value = Number.parseFloat(rawValue);
      const key = BlueAirDeviceSensorDataMap[entry.sensors[index]];
      if (key && Number.isFinite(value)) {
        sensorData[key] = value;
      }
    }
    return sensorData;
  }

  async setDeviceStatus(uuid: string, state: string, value: number | boolean): Promise<void> {
    await this.checkTokenExpiration();

    // this.logger.debug(`setDeviceStatus: ${uuid} ${state} ${value}`);

    const body: BlueAirSetStateBody = {
      n: state,
    };

    if (typeof value === 'number') {
      body.v = value;
    } else if (typeof value === 'boolean') {
      body.vb = value;
    } else {
      throw new Error(`setDeviceStatus: unknown value type ${typeof value}`);
    }

    // const response = await this.apiCall(`/${uuid}/a/${state}`, body);
    await this.apiCall(`/${uuid}/a/${state}`, body);
    // this.logger.debug(`setDeviceStatus response: ${JSON.stringify(response)}`);
  }

  private async getAwsAccessToken(jwt: string): Promise<{ accessToken: string; idToken: string; userId: string }> {
    this.logger.debug('Getting AWS access token...');

    const response = await this.apiCall('/login', undefined, 'POST', {
      Authorization: `Bearer ${jwt}`,
      idtoken: jwt,
    });

    if (!response.access_token) {
      throw new Error('AWS access token error: response did not include access_token');
    }

    const accessToken = response.access_token as string;
    const tokenPayload = JSON.parse(Buffer.from(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as {
      username?: string;
    };

    this.logger.debug('AWS access token received');
    return {
      accessToken,
      idToken: response.id_token ?? jwt,
      userId: tokenPayload.username ?? '',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async apiCall<T = any>(url: string, data?: string | object, method = 'POST', headers?: object, retries = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const release = await this.mutex.acquire();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BLUEAIR_API_TIMEOUT);

      try {
        const response = await fetch(`${this.blueAirApiUrl}${url}`, {
          method: method,
          headers: {
            Accept: '*/*',
            Connection: 'keep-alive',
            'Accept-Encoding': 'gzip, deflate, br',
            Authorization: `Bearer ${this.accessToken}`,
            idtoken: this.idToken || this.accessToken,
            ...headers,
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        const responseText = await response.text();
        let responseBody: unknown = responseText;
        try {
          responseBody = responseText ? JSON.parse(responseText) : undefined;
        } catch {
          // Some BlueAir errors return plain text or an empty body.
        }
        if (response.status !== 200) {
          throw new BlueAirApiError(
            `API call error with status ${response.status}: ${response.statusText}, ${JSON.stringify(responseBody)}`,
            response.status,
            getRetryAfterMs(response.headers.get('retry-after')),
          );
        }
        return responseBody as T;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
        release();
      }

      if (attempt < retries) {
        const exponentialDelay = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
        const rateLimited = lastError instanceof BlueAirApiError && isRateLimitStatus(lastError.status);
        const rateLimitDelay = Math.min(RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt, RATE_LIMIT_MAX_DELAY_MS);
        const retryAfterMs = lastError instanceof BlueAirApiError && rateLimited ? lastError.retryAfterMs : undefined;
        const minimumDelay = rateLimited ? rateLimitDelay : exponentialDelay;
        const delayMs = retryAfterMs === undefined ? minimumDelay : Math.max(retryAfterMs, minimumDelay);
        const failureReason = rateLimited ? 'BlueAir API rate limit reached' : 'BlueAir API call failed';
        this.logger.warn(`${failureReason}; retrying in ${Math.ceil(delayMs / 1000)} second(s) (attempt ${attempt + 2}/${retries + 1}).`);
        await sleep(delayMs);
      }
    }

    if (lastError instanceof BlueAirApiError) {
      throw lastError;
    }
    if (lastError instanceof Error && lastError.name === 'AbortError') {
      throw new BlueAirApiError(`API call failed after ${retries + 1} attempts with timeout.`);
    }
    throw new BlueAirApiError(`API call failed after ${retries + 1} attempts with error: ${lastError}`);
  }
}
