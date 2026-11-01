import { BlueAirDeviceState } from '../api/BlueAirAwsApi';
import { BlueAirDeviceType } from './BlueAirDeviceType';

export interface AutoModeStrategy {
  isAvailable(state: BlueAirDeviceState): boolean;
  isAuto(state: BlueAirDeviceState): boolean;
  setAuto(isAuto: boolean): { attribute: string; value: number | boolean };
}

const defaultStrategy: AutoModeStrategy = {
  isAvailable: (state) => state.automode !== undefined,
  isAuto: (state) => Boolean(state.automode),
  setAuto: (isAuto) => ({ attribute: 'automode', value: isAuto }),
};

// Blue Signature uses apsubmode: 1=manual, 2=auto, 3=night, 4=eco.
const blueSignatureStrategy: AutoModeStrategy = {
  isAvailable: (state) => state.apsubmode !== undefined,
  isAuto: (state) => state.apsubmode === 2,
  setAuto: (isAuto) => ({ attribute: 'apsubmode', value: isAuto ? 2 : 1 }),
};

const miniRestfulStrategy: AutoModeStrategy = {
  isAvailable: () => false,
  isAuto: () => false,
  setAuto: () => ({ attribute: 'automode', value: false }),
};

const AUTO_MODE_STRATEGIES: Partial<Record<BlueAirDeviceType, AutoModeStrategy>> = {
  [BlueAirDeviceType.BLUE_SIGNATURE]: blueSignatureStrategy,
  [BlueAirDeviceType.MINI_RESTFUL]: miniRestfulStrategy,
};

export function getAutoModeStrategy(deviceType: BlueAirDeviceType): AutoModeStrategy {
  return AUTO_MODE_STRATEGIES[deviceType] ?? defaultStrategy;
}
