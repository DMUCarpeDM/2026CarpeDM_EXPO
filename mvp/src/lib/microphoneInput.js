import { requestCapture } from './mediaRequest.js';

export const RAW_MIC_SETTINGS = { autoGainControl: false, noiseSuppression: false, echoCancellation: false };

export function preferredUsbMicrophone(devices) {
  const inputs = devices.filter(device => device.kind === 'audioinput' && device.deviceId && !['default', 'communications'].includes(device.deviceId));
  return inputs.find(device => /USBAudio\s*1\.0/i.test(device.label) && /3634:4155/i.test(device.label))
    || inputs.find(device => /USBAudio\s*1\.0/i.test(device.label));
}

export function microphoneConstraints(preferred) {
  return { ...RAW_MIC_SETTINGS, ...(preferred ? { deviceId: { exact: preferred.deviceId } } : {}) };
}

export async function requestMicrophone(devices, preferred) {
  try {
    return await requestCapture(devices, { audio: microphoneConstraints(preferred) }, preferred ? 4000 : 12000);
  } catch (error) {
    if (!preferred || !['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError', 'TimeoutError'].includes(error.name)) throw error;
    return requestCapture(devices, { audio: microphoneConstraints() });
  }
}
